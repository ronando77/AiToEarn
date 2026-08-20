import { describe, expect, it } from 'vitest'
import { mapCodexSdkEvent } from './codex-event.mapper'

describe('mapCodexSdkEvent', () => {
  it('maps a started thread to an AiToEarn session', () => {
    expect(mapCodexSdkEvent({
      type: 'thread.started',
      thread_id: 'thread-123',
    })).toEqual({
      type: 'session.started',
      sessionId: 'thread-123',
    })
  })

  it('preserves streamed items', () => {
    const item = {
      id: 'item-1',
      type: 'agent_message' as const,
      text: 'hello',
    }

    expect(mapCodexSdkEvent({
      type: 'item.completed',
      item,
    })).toEqual({
      type: 'item.completed',
      item,
    })
  })

  it('normalizes token usage', () => {
    expect(mapCodexSdkEvent({
      type: 'turn.completed',
      usage: {
        input_tokens: 10,
        cached_input_tokens: 2,
        output_tokens: 4,
        reasoning_output_tokens: 1,
      },
    })).toEqual({
      type: 'turn.completed',
      usage: {
        inputTokens: 10,
        cachedInputTokens: 2,
        cacheWriteInputTokens: 0,
        outputTokens: 4,
        reasoningOutputTokens: 1,
      },
    })
  })

  it('maps turn failures to fatal errors', () => {
    expect(mapCodexSdkEvent({
      type: 'turn.failed',
      error: { message: 'failed' },
    })).toEqual({
      type: 'error',
      message: 'failed',
      fatal: true,
    })
  })

  it('maps top-level SDK errors to fatal errors', () => {
    expect(mapCodexSdkEvent({
      type: 'error',
      message: 'stream failed',
    })).toEqual({
      type: 'error',
      message: 'stream failed',
      fatal: true,
    })
  })
})
