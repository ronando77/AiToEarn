import type { CodexRuntimeEvent } from './codex-runtime.types'
import type { CodexSdkEvent } from './codex-sdk.types'

export function mapCodexSdkEvent(event: CodexSdkEvent): CodexRuntimeEvent {
  switch (event.type) {
    case 'thread.started':
      return {
        type: 'session.started',
        sessionId: event.thread_id,
      }
    case 'turn.started':
      return { type: 'turn.started' }
    case 'turn.completed':
      return {
        type: 'turn.completed',
        usage: {
          inputTokens: event.usage.input_tokens,
          cachedInputTokens: event.usage.cached_input_tokens,
          cacheWriteInputTokens: event.usage.cache_write_input_tokens ?? 0,
          outputTokens: event.usage.output_tokens,
          reasoningOutputTokens: event.usage.reasoning_output_tokens,
        },
      }
    case 'turn.failed':
      return {
        type: 'error',
        message: event.error.message,
        fatal: true,
      }
    case 'error':
      return {
        type: 'error',
        message: event.message,
        fatal: true,
      }
    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      return {
        type: event.type,
        item: event.item,
      }
  }
}
