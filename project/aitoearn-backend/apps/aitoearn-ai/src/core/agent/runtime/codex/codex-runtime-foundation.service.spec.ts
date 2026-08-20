import type { CodexRuntimeEvent } from './codex-runtime.types'
import type { CodexClientFactoryPort, CodexClientPort, CodexSdkEvent, CodexThreadPort } from './codex-sdk.types'
import { describe, expect, it, vi } from 'vitest'
import { CodexRuntimeFoundationService } from './codex-runtime-foundation.service'
import { CodexSessionService } from './codex-session.service'

async function collectEvents(stream: AsyncGenerator<CodexRuntimeEvent>): Promise<CodexRuntimeEvent[]> {
  const events: CodexRuntimeEvent[] = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

function createEventStream(events: CodexSdkEvent[]): AsyncIterable<CodexSdkEvent> {
  return (async function* () {
    for (const event of events) {
      yield event
    }
  })()
}

describe('codexRuntimeFoundationService', () => {
  it('starts a new thread, forwards the abort signal, and binds the thread id', async () => {
    const abortController = new AbortController()
    const thread: CodexThreadPort = {
      id: null,
      runStreamed: vi.fn().mockResolvedValue({
        events: createEventStream([
          { type: 'thread.started', thread_id: 'thread-1' },
          { type: 'turn.started' },
          {
            type: 'item.completed',
            item: { id: 'item-1', type: 'agent_message', text: 'done' },
          },
        ]),
      }),
    }
    const client: CodexClientPort = {
      startThread: vi.fn().mockReturnValue(thread),
      resumeThread: vi.fn(),
    }
    const clientFactory: CodexClientFactoryPort = {
      create: vi.fn().mockResolvedValue(client),
    }
    const sessions = new CodexSessionService()
    const runtime = new CodexRuntimeFoundationService(clientFactory, sessions)

    const events = await collectEvents(runtime.runTurn({
      taskId: 'task-1',
      client: { taskId: 'task-1', headers: { authorization: 'Bearer token' } },
      input: 'hello',
      signal: abortController.signal,
    }))

    expect(client.startThread).toHaveBeenCalledOnce()
    expect(clientFactory.create).toHaveBeenCalledWith({
      taskId: 'task-1',
      headers: { authorization: 'Bearer token' },
    })
    expect(client.resumeThread).not.toHaveBeenCalled()
    expect(thread.runStreamed).toHaveBeenCalledWith('hello', {
      signal: abortController.signal,
      outputSchema: undefined,
    })
    expect(sessions.resolve('task-1')).toBe('thread-1')
    expect(events[0]).toEqual({ type: 'session.started', sessionId: 'thread-1' })
    expect(events.at(-1)).toEqual({
      type: 'item.completed',
      item: { id: 'item-1', type: 'agent_message', text: 'done' },
    })
  })

  it('resumes a persisted Codex thread', async () => {
    const thread: CodexThreadPort = {
      id: 'thread-old',
      runStreamed: vi.fn().mockResolvedValue({
        events: createEventStream([{ type: 'turn.started' }]),
      }),
    }
    const client: CodexClientPort = {
      startThread: vi.fn(),
      resumeThread: vi.fn().mockReturnValue(thread),
    }
    const clientFactory: CodexClientFactoryPort = {
      create: vi.fn().mockResolvedValue(client),
    }
    const runtime = new CodexRuntimeFoundationService(clientFactory, new CodexSessionService())

    await collectEvents(runtime.runTurn({
      taskId: 'task-1',
      client: { taskId: 'task-1', headers: {} },
      sessionId: 'thread-old',
      input: 'continue',
    }))

    expect(client.resumeThread).toHaveBeenCalledWith('thread-old', undefined)
    expect(client.startThread).not.toHaveBeenCalled()
  })
})
