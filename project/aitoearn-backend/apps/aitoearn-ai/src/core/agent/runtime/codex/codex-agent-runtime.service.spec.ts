import type { ContentGenerationTaskTitleUpdatedChunkVo } from '../../agent.vo'
import type { CodexRuntimeEvent, CodexRuntimeTurnParams } from './codex-runtime.types'
import { ContentGenerationTaskStatus } from '@yikart/mongodb'
import { lastValueFrom, Subject, toArray } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import {
  AgentMessageType,
  ContentGenerationTaskChunkVoSchema,
} from '../../agent.vo'
import { CodexAgentRuntimeService } from './codex-agent-runtime.service'
import { CodexRuntimeFoundationService } from './codex-runtime-foundation.service'
import { CodexSessionService } from './codex-session.service'

function eventStream(events: CodexRuntimeEvent[]): AsyncGenerator<CodexRuntimeEvent> {
  return (async function* () {
    for (const event of events)
      yield event
  })()
}

const completedUsage = {
  inputTokens: 10,
  cachedInputTokens: 2,
  cacheWriteInputTokens: 1,
  outputTokens: 4,
  reasoningOutputTokens: 3,
}

function successfulEvents(): CodexRuntimeEvent[] {
  return [
    { type: 'session.started', sessionId: 'thread-1' },
    {
      type: 'item.completed',
      item: { id: 'message-1', type: 'agent_message', text: 'Finished' },
    },
    { type: 'turn.completed', usage: completedUsage },
  ]
}

function createRuntime(events: CodexRuntimeEvent[] = successfulEvents()) {
  const repository = {
    create: vi.fn().mockResolvedValue({ id: 'task-1' }),
    getByUserIdAndId: vi.fn(),
    updateById: vi.fn().mockResolvedValue(undefined),
    updateMessage: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  }
  const foundation = {
    runTurn: vi.fn().mockImplementation(() => eventStream(events)),
  } as unknown as CodexRuntimeFoundationService
  const sessions = {
    unbind: vi.fn(),
  } as unknown as CodexSessionService
  const titleUpdate$ = new Subject<ContentGenerationTaskTitleUpdatedChunkVo>()
  const registration = {
    taskId: 'task-1',
    titleUpdate$,
    createServer: vi.fn(),
    getTaskResult: vi.fn(),
  }
  const taskScopedSessionTools = {
    runTaskScoped: vi.fn().mockImplementation(async function* (
      _taskId: string,
      _userId: string,
      execute: (currentRegistration: typeof registration) => AsyncIterable<CodexRuntimeEvent>,
    ) {
      yield* execute(registration)
    }),
  }
  const runtime = new CodexAgentRuntimeService(
    repository as never,
    foundation,
    sessions,
    taskScopedSessionTools as never,
    undefined,
  )
  const res = {
    closed: false,
    end: vi.fn(),
  }
  const params = {
    userId: 'user-1',
    userType: 'user',
    dto: {
      prompt: 'Create a post',
      model: 'gpt-5.3-codex',
      includePartialMessages: false,
      taskId: undefined as string | undefined,
    },
    abortController: new AbortController(),
    req: {
      headers: { authorization: 'Bearer token' },
    },
    res,
  }

  return {
    foundation,
    params,
    registration,
    repository,
    res,
    runtime,
    sessions,
    taskScopedSessionTools,
    titleUpdate$,
  }
}

async function collectRuntime(runtime: CodexAgentRuntimeService, params: unknown) {
  return await lastValueFrom(runtime.createContentGenerationTask(params as never).pipe(toArray()))
}

describe('codexAgentRuntimeService', () => {
  it('emits only existing validated SSE chunks in thread/message/result order', async () => {
    const { foundation, params, repository, res, runtime, sessions, taskScopedSessionTools } = createRuntime()

    const chunks = await collectRuntime(runtime, params)

    expect(chunks.map(chunk => chunk.type)).toEqual([
      AgentMessageType.Init,
      AgentMessageType.Assistant,
      AgentMessageType.Result,
    ])
    for (const chunk of chunks)
      expect(ContentGenerationTaskChunkVoSchema.safeParse(chunk).success).toBe(true)

    expect(repository.updateById).toHaveBeenCalledWith('task-1', {
      sessionId: 'codex:thread-1',
    })
    expect(repository.updateById.mock.invocationCallOrder[0])
      .toBeLessThan(repository.updateMessage.mock.invocationCallOrder[1])
    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', ContentGenerationTaskStatus.Completed)
    expect(foundation.runTurn).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      sessionId: undefined,
      client: {
        taskId: 'task-1',
        headers: { authorization: 'Bearer token' },
      },
    }))
    expect(taskScopedSessionTools.runTaskScoped).toHaveBeenCalledWith('task-1', 'user-1', expect.any(Function))
    expect(sessions.unbind).toHaveBeenCalledWith('task-1')
    expect(res.end).toHaveBeenCalledOnce()
  })

  it('subscribes to title updates before execution and emits them after init', async () => {
    const { foundation, params, runtime, titleUpdate$ } = createRuntime()
    vi.mocked(foundation.runTurn).mockImplementation(() => (async function* () {
      titleUpdate$.next({
        type: AgentMessageType.TitleUpdated,
        taskId: 'task-1',
        title: 'Codex title',
      } as ContentGenerationTaskTitleUpdatedChunkVo)
      yield* eventStream(successfulEvents())
    })())

    const chunks = await collectRuntime(runtime, params)

    expect(chunks.map(chunk => chunk.type)).toEqual([
      AgentMessageType.Init,
      AgentMessageType.TitleUpdated,
      AgentMessageType.Assistant,
      AgentMessageType.Result,
    ])
    for (const chunk of chunks)
      expect(ContentGenerationTaskChunkVoSchema.safeParse(chunk).success).toBe(true)
  })

  it('includes outputTaskResult in both SSE and the persisted result message', async () => {
    const { params, registration, repository, runtime } = createRuntime()
    const taskResult = {
      type: 'mediaOnly' as const,
      action: 'none' as const,
      medias: [{ type: 'IMAGE' as const, url: 'https://example.com/image.png' }],
    }
    registration.getTaskResult.mockReturnValue(taskResult)

    const chunks = await collectRuntime(runtime, params)
    const resultChunk = chunks.find(chunk => chunk.type === AgentMessageType.Result)
    const persistedResult = repository.updateMessage.mock.calls
      .map(call => call[1])
      .find(message => message.type === AgentMessageType.Result)

    expect(resultChunk).toMatchObject({ message: { result: taskResult } })
    expect(persistedResult).toMatchObject({ result: taskResult })
  })

  it.each([
    {
      name: 'normal output',
      result: undefined,
      expected: ContentGenerationTaskStatus.Completed,
    },
    {
      name: 'channel action',
      result: [{
        type: 'fullContent',
        action: 'createChannel',
        title: 'Title',
        description: 'Description',
        tags: [],
        medias: [],
        platform: 'tiktok',
      }],
      expected: ContentGenerationTaskStatus.RequiresAction,
    },
  ])('commits the expected terminal status for $name', async ({ expected, result }) => {
    const { params, registration, repository, runtime } = createRuntime()
    registration.getTaskResult.mockReturnValue(result)

    await collectRuntime(runtime, params)

    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', expected)
  })

  it.each([
    {
      name: 'Completed',
      result: undefined,
      status: ContentGenerationTaskStatus.Completed,
    },
    {
      name: 'RequiresAction',
      result: [{
        type: 'fullContent',
        action: 'createChannel',
        title: 'Title',
        description: 'Description',
        tags: [],
        medias: [],
        platform: 'tiktok',
      }],
      status: ContentGenerationTaskStatus.RequiresAction,
    },
  ])('emits Error instead of $name when terminal status persistence fails', async ({ result, status }) => {
    const { params, registration, repository, runtime } = createRuntime()
    registration.getTaskResult.mockReturnValue(result)
    repository.updateStatus.mockImplementation(async (_taskId: string, nextStatus: ContentGenerationTaskStatus) => {
      if (nextStatus === status)
        throw new Error('terminal persistence failed')
    })

    const chunks = await collectRuntime(runtime, params)

    expect(chunks.some(chunk => chunk.type === AgentMessageType.Result)).toBe(false)
    expect(chunks.at(-1)?.type).toBe(AgentMessageType.Error)
    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', ContentGenerationTaskStatus.Error)
  })

  it.each([
    ['turn.failed', { type: 'error', message: 'turn failed', fatal: true } as CodexRuntimeEvent],
    ['top-level error', { type: 'error', message: 'stream failed', fatal: true } as CodexRuntimeEvent],
  ])('maps %s to one existing error chunk and Error status', async (_name, fatalEvent) => {
    const { params, repository, runtime } = createRuntime([
      { type: 'session.started', sessionId: 'thread-1' },
      fatalEvent,
    ])

    const chunks = await collectRuntime(runtime, params)

    expect(chunks.map(chunk => chunk.type)).toEqual([
      AgentMessageType.Init,
      AgentMessageType.Error,
    ])
    for (const chunk of chunks)
      expect(ContentGenerationTaskChunkVoSchema.safeParse(chunk).success).toBe(true)
    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', ContentGenerationTaskStatus.Error)
  })

  it.each(['message', 'status'] as const)('still emits the compatible error chunk when error %s persistence fails', async (failure) => {
    const { params, repository, runtime } = createRuntime([
      { type: 'session.started', sessionId: 'thread-1' },
      { type: 'error', message: 'stream failed', fatal: true },
    ])
    if (failure === 'message') {
      repository.updateMessage.mockImplementation(async (_taskId: string, message: { type: AgentMessageType }) => {
        if (message.type === AgentMessageType.Error)
          throw new Error('error message persistence failed')
      })
    }
    else {
      repository.updateStatus.mockImplementation(async (_taskId: string, status: ContentGenerationTaskStatus) => {
        if (status === ContentGenerationTaskStatus.Error)
          throw new Error('error status persistence failed')
      })
    }

    const chunks = await collectRuntime(runtime, params)

    expect(chunks.map(chunk => chunk.type)).toEqual([
      AgentMessageType.Init,
      AgentMessageType.Error,
    ])
  })

  it('treats a stream ending without turn.completed as Error', async () => {
    const { params, repository, runtime } = createRuntime([
      { type: 'session.started', sessionId: 'thread-1' },
    ])

    const chunks = await collectRuntime(runtime, params)

    expect(chunks.at(-1)?.type).toBe(AgentMessageType.Error)
    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', ContentGenerationTaskStatus.Error)
  })

  it('lets abort win when it races before turn.completed', async () => {
    const { foundation, params, repository, runtime } = createRuntime()
    vi.mocked(foundation.runTurn).mockImplementation(() => (async function* () {
      yield { type: 'session.started', sessionId: 'thread-1' }
      params.abortController.abort()
      yield { type: 'turn.completed', usage: completedUsage }
    })())

    const chunks = await collectRuntime(runtime, params)

    expect(chunks.some(chunk => chunk.type === AgentMessageType.Result)).toBe(false)
    expect(chunks.some(chunk => chunk.type === AgentMessageType.Error)).toBe(false)
    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', ContentGenerationTaskStatus.Aborted)
  })

  it('does not start Codex execution for a pre-aborted request', async () => {
    const { foundation, params, repository, runtime } = createRuntime()
    params.abortController.abort()

    const chunks = await collectRuntime(runtime, params)

    expect(chunks).toEqual([])
    expect(foundation.runTurn).not.toHaveBeenCalled()
    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', ContentGenerationTaskStatus.Aborted)
  })

  it('aborts a running Codex turn through the runtime registry entry point', async () => {
    const { foundation, params, repository, runtime } = createRuntime()
    vi.mocked(foundation.runTurn).mockImplementation((turnParams: CodexRuntimeTurnParams) => (async function* () {
      yield { type: 'session.started', sessionId: 'thread-1' }
      await new Promise<void>((_resolve, reject) => {
        turnParams.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    })())

    const chunksPromise = collectRuntime(runtime, params)
    await vi.waitFor(() => expect(foundation.runTurn).toHaveBeenCalledOnce())
    runtime.abortTask('task-1')
    const chunks = await chunksPromise

    expect(chunks.map(chunk => chunk.type)).toEqual([AgentMessageType.Init])
    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', ContentGenerationTaskStatus.Aborted)
  })

  it('does not let a later abort overwrite a committed completion', async () => {
    const { foundation, params, repository, runtime } = createRuntime()
    vi.mocked(foundation.runTurn).mockImplementation(() => (async function* () {
      try {
        yield* eventStream(successfulEvents())
      }
      finally {
        params.abortController.abort()
      }
    })())

    const chunks = await collectRuntime(runtime, params)

    expect(chunks.at(-1)?.type).toBe(AgentMessageType.Result)
    expect(repository.updateStatus).toHaveBeenLastCalledWith('task-1', ContentGenerationTaskStatus.Completed)
    expect(repository.updateStatus).not.toHaveBeenCalledWith('task-1', ContentGenerationTaskStatus.Aborted)
  })

  it('persists a new thread and resumes it after an in-memory restart', async () => {
    const first = createRuntime()
    await collectRuntime(first.runtime, first.params)

    const resumed = createRuntime([
      { type: 'turn.started' },
      {
        type: 'item.completed',
        item: { id: 'message-2', type: 'agent_message', text: 'Resumed' },
      },
      { type: 'turn.completed', usage: completedUsage },
    ])
    resumed.params.dto = { ...resumed.params.dto, taskId: 'task-1' }
    resumed.repository.getByUserIdAndId.mockResolvedValue({
      id: 'task-1',
      sessionId: 'codex:thread-1',
    })

    const chunks = await collectRuntime(resumed.runtime, resumed.params)

    expect(resumed.repository.getByUserIdAndId).toHaveBeenCalledWith('user-1', 'task-1')
    expect(resumed.foundation.runTurn).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      sessionId: 'thread-1',
    }))
    expect(chunks.map(chunk => chunk.type)).toEqual([
      AgentMessageType.Init,
      AgentMessageType.Assistant,
      AgentMessageType.Result,
    ])
  })

  it('rejects cross-user resume when the user-owned lookup returns no task', async () => {
    const { foundation, params, repository, runtime } = createRuntime()
    params.dto = { ...params.dto, taskId: 'task-owned-by-another-user' }
    repository.getByUserIdAndId.mockResolvedValue(null)

    const chunks = await collectRuntime(runtime, params)

    expect(repository.getByUserIdAndId).toHaveBeenCalledWith('user-1', 'task-owned-by-another-user')
    expect(foundation.runTurn).not.toHaveBeenCalled()
    expect(chunks).toHaveLength(1)
    expect(chunks[0].type).toBe(AgentMessageType.Error)
  })

  it('rejects a bare Claude session ID', async () => {
    const { foundation, params, repository, runtime } = createRuntime()
    params.dto = { ...params.dto, taskId: 'task-1' }
    repository.getByUserIdAndId.mockResolvedValue({ id: 'task-1', sessionId: 'claude-session' })

    const chunks = await collectRuntime(runtime, params)

    expect(foundation.runTurn).not.toHaveBeenCalled()
    expect(chunks[0].type).toBe(AgentMessageType.Error)
  })

  it('aborts execution and cleans the in-memory session on consumer unsubscribe', async () => {
    const { foundation, params, runtime, sessions } = createRuntime()
    vi.mocked(foundation.runTurn).mockImplementation((turnParams: CodexRuntimeTurnParams) => {
      return (async function* () {
        yield { type: 'session.started', sessionId: 'thread-1' }
        await new Promise<void>((_resolve, reject) => {
          turnParams.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
      })()
    })

    const subscription = runtime.createContentGenerationTask(params as never).subscribe()
    await vi.waitFor(() => expect(foundation.runTurn).toHaveBeenCalledOnce())
    subscription.unsubscribe()

    await vi.waitFor(() => {
      expect(params.abortController.signal.aborted).toBe(true)
      expect(sessions.unbind).toHaveBeenCalledWith('task-1')
    })
  })
})
