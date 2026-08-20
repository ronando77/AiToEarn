import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import type { Observable } from 'rxjs'
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common'
import { z } from 'zod'
import { AiAvailabilityService } from '../../ai-availability'
import { McpServerName } from '../agent.constants'
import {
  ContentGenerationTaskResultSchema,
  ContentGenerationTaskResultUnionSchema,
  ContentGenerationTaskTitleUpdatedChunkVo,
} from '../agent.vo'
import { errorResult, successResult, wrapTool } from './mcp.utils'
import { UtilMcp, UtilToolName } from './util.mcp'

type TaskResult = z.infer<typeof ContentGenerationTaskResultUnionSchema>

export interface TaskScopedSessionToolsRegistration {
  readonly taskId: string
  readonly titleUpdate$: Observable<ContentGenerationTaskTitleUpdatedChunkVo>
  createServer: () => McpSdkServerConfigWithInstance
  getTaskResult: () => TaskResult | undefined
}

interface TaskScopedSessionToolsEntry extends TaskScopedSessionToolsRegistration {
  readonly ownerUserId: string
  close: () => Promise<void>
}

@Injectable()
export class TaskScopedSessionToolsService implements OnModuleDestroy {
  private readonly logger = new Logger(TaskScopedSessionToolsService.name)
  private readonly entries = new Map<string, TaskScopedSessionToolsEntry>()

  constructor(
    private readonly utilMcp: UtilMcp,
    private readonly aiAvailability: AiAvailabilityService,
  ) {}

  register(taskId: string, ownerUserId: string): TaskScopedSessionToolsRegistration {
    if (this.entries.has(taskId)) {
      throw new ConflictException(`Session tools already registered for task: ${taskId}`)
    }

    let taskResult: TaskResult | undefined
    let acceptingCalls = true
    const inFlightCalls = new Set<Promise<void>>()

    const outputTaskResultTool = wrapTool(
      this.logger,
      UtilToolName.OutputTaskResult,
      'output task result JSON, the result will be included in the completion message.',
      ContentGenerationTaskResultSchema.shape,
      async (args) => {
        if (!acceptingCalls) {
          return errorResult('Session tools are no longer active')
        }

        taskResult = args.result
        return successResult('Task result submitted successfully')
      },
      this.aiAvailability,
    )

    const [setTitleTool, titleUpdate$, completeTitleUpdate] = this.utilMcp.createSetTitleTool(
      taskId,
      async (operation) => {
        if (!acceptingCalls)
          return false

        const inFlightCall = operation()
        inFlightCalls.add(inFlightCall)
        try {
          await inFlightCall
          return true
        }
        finally {
          inFlightCalls.delete(inFlightCall)
        }
      },
    )

    const entry: TaskScopedSessionToolsEntry = {
      taskId,
      ownerUserId,
      titleUpdate$,
      createServer: () => createSdkMcpServer({
        name: McpServerName.SessionTools,
        version: '1.0.0',
        tools: [outputTaskResultTool, setTitleTool],
      }),
      getTaskResult: () => taskResult,
      close: async () => {
        acceptingCalls = false
        await Promise.allSettled([...inFlightCalls])
        completeTitleUpdate()
      },
    }

    this.entries.set(taskId, entry)
    return entry
  }

  async* runTaskScoped<T>(
    taskId: string,
    ownerUserId: string,
    execute: (registration: TaskScopedSessionToolsRegistration) => AsyncIterable<T>,
  ): AsyncGenerator<T> {
    const registration = this.register(taskId, ownerUserId)
    try {
      yield* execute(registration)
    }
    finally {
      await this.unregisterEntry(taskId, registration)
    }
  }

  createServerForUser(taskId: string, userId: string): McpSdkServerConfigWithInstance {
    const entry = this.entries.get(taskId)
    if (!entry || entry.ownerUserId !== userId) {
      // Do not reveal whether another user's task is currently registered.
      throw new NotFoundException(`Session tools are not registered for task: ${taskId}`)
    }
    return entry.createServer()
  }

  async unregister(taskId: string): Promise<void> {
    await this.unregisterEntry(taskId)
  }

  private async unregisterEntry(
    taskId: string,
    expectedRegistration?: TaskScopedSessionToolsRegistration,
  ): Promise<void> {
    const entry = this.entries.get(taskId)
    if (!entry || (expectedRegistration && entry !== expectedRegistration))
      return

    this.entries.delete(taskId)
    await entry.close()
  }

  has(taskId: string): boolean {
    return this.entries.has(taskId)
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.entries.keys()].map(taskId => this.unregister(taskId)))
  }
}
