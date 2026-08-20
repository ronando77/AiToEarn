import type { Subscriber, Subscription } from 'rxjs'
import type { ContentBlock } from '../../agent.dto'
import type {
  ContentGenerationTaskChunkVo,
  ContentGenerationTaskTitleUpdatedChunkVo,
} from '../../agent.vo'
import type { TaskScopedSessionToolsRegistration } from '../../mcp/task-scoped-session-tools.service'
import type { AgentRuntime, AgentRuntimeTaskParams } from '../agent-runtime.types'
import * as fs from 'node:fs'
import { join } from 'node:path'
import { Injectable, Logger, Optional } from '@nestjs/common'
import {
  AppException,
  ResponseCode,
} from '@yikart/common'
import {
  ContentGenerationTaskRepository,
  ContentGenerationTaskStatus,
} from '@yikart/mongodb'
import { Observable } from 'rxjs'
import { RelayMediaResolverService } from '../../../ai/relay-media'
import { SYSTEM_PROMPT } from '../../agent.constants'
import { filterHeaders, normalizePrompt } from '../../agent.utils'
import { AgentMessageType } from '../../agent.vo'
import { TaskScopedSessionToolsService } from '../../mcp/task-scoped-session-tools.service'
import { CodexRuntimeFoundationService } from './codex-runtime-foundation.service'
import { CodexSessionService, parseCodexSessionId, serializeCodexSessionId } from './codex-session.service'
import { CodexSseCompatibilityService } from './codex-sse-compatibility.service'
import { CodexTerminalStateReducer } from './codex-terminal-state.reducer'

interface CodexRunningTaskInfo {
  taskId: string
  abortController: AbortController
  completionPromise: Promise<void>
  sessionId?: string
}

@Injectable()
export class CodexAgentRuntimeService implements AgentRuntime {
  readonly name = 'codex' as const

  private readonly logger = new Logger(CodexAgentRuntimeService.name)
  private readonly sessionDir = join(process.cwd(), '.codex-session')
  private readonly runningTasks = new Map<string, CodexRunningTaskInfo>()
  private readonly compatibility = new CodexSseCompatibilityService()

  constructor(
    private readonly contentGenerateRepository: ContentGenerationTaskRepository,
    private readonly foundation: CodexRuntimeFoundationService,
    private readonly sessions: CodexSessionService,
    private readonly taskScopedSessionTools: TaskScopedSessionToolsService,
    @Optional() private readonly relayMediaResolver?: RelayMediaResolverService,
  ) {}

  createContentGenerationTask(params: AgentRuntimeTaskParams): Observable<ContentGenerationTaskChunkVo> {
    return new Observable((subscriber) => {
      let settled = false
      const execution = this.runTask(params, subscriber)
      void execution.then(
        () => {
          settled = true
          subscriber.complete()
        },
        (error) => {
          settled = true
          subscriber.error(error)
        },
      )

      return () => {
        if (!settled && !params.abortController.signal.aborted)
          params.abortController.abort()
      }
    })
  }

  abortTask(taskId: string): void {
    const task = this.runningTasks.get(taskId)
    if (!task || task.abortController.signal.aborted)
      return

    this.logger.debug({ taskId, sessionId: task.sessionId }, `Aborting Codex task ${taskId}`)
    task.abortController.abort()
  }

  async waitForRunningTasks(): Promise<void> {
    await Promise.all([...this.runningTasks.values()].map(task => task.completionPromise))
  }

  private async runTask(
    params: AgentRuntimeTaskParams,
    subscriber: Subscriber<ContentGenerationTaskChunkVo>,
  ): Promise<void> {
    const terminal = new CodexTerminalStateReducer()
    let taskId: string | undefined
    let taskInfo: CodexRunningTaskInfo | undefined
    let registration: TaskScopedSessionToolsRegistration | undefined
    let titleSubscription: Subscription | undefined
    let keepAliveTimer: NodeJS.Timeout | undefined
    let abortListener: (() => void) | undefined
    let terminalPersistence: Promise<unknown> | undefined
    let resolveCompletion: (() => void) | undefined
    let initEmitted = false
    const pendingTitleUpdates: ContentGenerationTaskTitleUpdatedChunkVo[] = []

    try {
      const initialized = await this.initializeTask(params)
      taskId = initialized.taskId

      const completionPromise = new Promise<void>((resolve) => {
        resolveCompletion = resolve
      })
      taskInfo = {
        taskId,
        abortController: params.abortController,
        completionPromise,
        sessionId: initialized.sessionId,
      }
      this.runningTasks.set(taskId, taskInfo)

      abortListener = () => {
        if (!taskId || !terminal.tryCommit(ContentGenerationTaskStatus.Aborted))
          return

        this.logger.warn({ taskId, sessionId: taskInfo?.sessionId }, `Codex task ${taskId} was aborted`)
        terminalPersistence = this.contentGenerateRepository.updateStatus(taskId, ContentGenerationTaskStatus.Aborted)
      }
      params.abortController.signal.addEventListener('abort', abortListener, { once: true })
      if (params.abortController.signal.aborted)
        abortListener()
      params.abortController.signal.throwIfAborted()

      const normalizedContent = normalizePrompt(params.dto.prompt)
      await this.contentGenerateRepository.updateMessage(taskId, {
        type: AgentMessageType.User,
        content: normalizedContent,
      })

      const resolvedContent = this.relayMediaResolver
        ? await this.relayMediaResolver.resolveJson(normalizedContent)
        : normalizedContent
      const taskCwd = join(this.sessionDir, 'tasks', taskId)
      fs.mkdirSync(taskCwd, { recursive: true })

      const emitInit = () => {
        if (initEmitted)
          return

        initEmitted = true
        this.emitChunk(subscriber, this.compatibility.createInitChunk(taskId as string))
        for (const titleUpdate of pendingTitleUpdates)
          this.emitChunk(subscriber, titleUpdate)
        pendingTitleUpdates.length = 0
        keepAliveTimer = setInterval(() => {
          this.emitChunk(subscriber, this.compatibility.createKeepAliveChunk())
        }, 5000)
      }

      let finalResponse = ''
      const runtimeEvents = this.taskScopedSessionTools.runTaskScoped(
        taskId,
        params.userId,
        (currentRegistration) => {
          registration = currentRegistration
          titleSubscription = registration.titleUpdate$.subscribe((chunk) => {
            if (initEmitted)
              this.emitChunk(subscriber, chunk)
            else
              pendingTitleUpdates.push(chunk)
          })
          return this.foundation.runTurn({
            taskId: initialized.taskId,
            sessionId: initialized.sessionId,
            client: {
              taskId: initialized.taskId,
              headers: initialized.headers,
            },
            input: this.buildPrompt(resolvedContent),
            signal: params.abortController.signal,
            threadOptions: {
              model: params.dto.model,
              workingDirectory: taskCwd,
              skipGitRepoCheck: true,
              sandboxMode: 'workspace-write',
              networkAccessEnabled: true,
              approvalPolicy: 'never',
            },
          })
        },
      )

      for await (const event of runtimeEvents) {
        if (terminal.status)
          break

        // A resumed SDK thread may begin with turn.started rather than thread.started.
        if (!initEmitted && initialized.sessionId && event.type !== 'session.started')
          emitInit()

        switch (event.type) {
          case 'session.started': {
            taskInfo.sessionId = event.sessionId
            await this.contentGenerateRepository.updateById(taskId, {
              sessionId: serializeCodexSessionId(event.sessionId),
            })
            emitInit()
            break
          }
          case 'item.completed': {
            if (event.item.type !== 'agent_message')
              break
            if (!initEmitted)
              throw new Error('Codex emitted an agent message before thread.started')

            finalResponse = event.item.text
            const compatible = this.compatibility.createAssistantChunk(event.item, params.dto.model)
            await this.contentGenerateRepository.updateMessage(taskId, compatible.message)
            this.emitChunk(subscriber, compatible.chunk)
            break
          }
          case 'turn.completed': {
            params.abortController.signal.throwIfAborted()
            if (!initEmitted)
              throw new Error('Codex completed a turn before thread.started')

            const taskResult = registration?.getTaskResult()
            const finalStatus = this.compatibility.getSuccessStatus(taskResult)
            const compatible = this.compatibility.createResultChunk(finalResponse, taskResult, event.usage)
            await this.contentGenerateRepository.updateMessage(taskId, compatible.message)
            await this.contentGenerateRepository.updateStatus(taskId, finalStatus)
            if (terminal.tryCommit(finalStatus))
              this.emitChunk(subscriber, compatible.chunk)
            break
          }
          case 'error':
            if (event.fatal)
              throw new Error(event.message)
            break
        }

        if (terminal.status)
          break
      }

      if (!terminal.status)
        throw new Error('Codex event stream ended without a terminal event')
    }
    catch (error) {
      if (params.abortController.signal.aborted) {
        if (taskId && terminal.tryCommit(ContentGenerationTaskStatus.Aborted)) {
          terminalPersistence = this.contentGenerateRepository.updateStatus(taskId, ContentGenerationTaskStatus.Aborted)
        }
      }
      else if (terminal.tryCommit(ContentGenerationTaskStatus.Error)) {
        this.logger.error({ error, taskId }, 'Codex task failed')
        const errorChunk = this.compatibility.createErrorChunk(error)
        this.emitChunk(subscriber, errorChunk)
        if (taskId) {
          try {
            await this.contentGenerateRepository.updateMessage(taskId, { ...errorChunk })
          }
          catch (persistenceError) {
            this.logger.error({ error: persistenceError, taskId }, 'Failed to persist Codex task error message')
          }
          try {
            await this.contentGenerateRepository.updateStatus(taskId, ContentGenerationTaskStatus.Error)
          }
          catch (persistenceError) {
            this.logger.error({ error: persistenceError, taskId }, 'Failed to persist Codex task error status')
          }
        }
      }
    }
    finally {
      if (keepAliveTimer)
        clearInterval(keepAliveTimer)
      titleSubscription?.unsubscribe()
      if (taskId)
        this.sessions.unbind(taskId)
      if (abortListener)
        params.abortController.signal.removeEventListener('abort', abortListener)
      if (terminalPersistence) {
        try {
          await terminalPersistence
        }
        catch (error) {
          this.logger.error({ error, taskId }, 'Failed to persist terminal Codex task status')
        }
      }
      try {
        if (!params.res.closed)
          params.res.end()
      }
      catch (error) {
        this.logger.error({ error, taskId }, 'Failed to close Codex task response')
      }
      if (taskInfo)
        this.runningTasks.delete(taskInfo.taskId)
      resolveCompletion?.()
    }
  }

  private emitChunk(
    subscriber: Subscriber<ContentGenerationTaskChunkVo>,
    chunk: ContentGenerationTaskChunkVo,
  ): void {
    if (!subscriber.closed)
      subscriber.next(this.compatibility.validateChunk(chunk))
  }

  private async initializeTask(params: AgentRuntimeTaskParams): Promise<{
    taskId: string
    sessionId?: string
    headers: Record<string, string>
  }> {
    let task
    if (params.dto.taskId) {
      task = await this.contentGenerateRepository.getByUserIdAndId(params.userId, params.dto.taskId)
      if (!task?.sessionId)
        throw new AppException(ResponseCode.AgentTaskNotFound)

      const threadId = parseCodexSessionId(task.sessionId)
      if (!threadId)
        throw new AppException(ResponseCode.AgentSessionRecoveryFailed)

      await this.contentGenerateRepository.updateStatus(task.id, ContentGenerationTaskStatus.Running)
      return {
        taskId: task.id,
        sessionId: threadId,
        headers: filterHeaders(params.req.headers),
      }
    }

    task = await this.contentGenerateRepository.create({ userId: params.userId })
    await this.contentGenerateRepository.updateStatus(task.id, ContentGenerationTaskStatus.Running)
    return {
      taskId: task.id,
      headers: filterHeaders(params.req.headers),
    }
  }

  private buildPrompt(content: ContentBlock[]): string {
    const userRequest = content.map((block) => {
      switch (block.type) {
        case 'text':
          return block.text
        case 'image':
          return `Reference image: ${block.source.url}`
        case 'video':
          return `Reference video: ${block.source.url}`
        case 'document':
          return `Reference document: ${JSON.stringify(block.source)}`
        default:
          return JSON.stringify(block)
      }
    }).join('\n\n')

    return `${SYSTEM_PROMPT}\n\n## User request\n${userRequest}`
  }
}
