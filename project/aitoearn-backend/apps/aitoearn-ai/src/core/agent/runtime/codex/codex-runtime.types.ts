import type { CodexClientFactoryParams, CodexInput, CodexThreadItem, CodexThreadOptions } from './codex-sdk.types'

export interface CodexRuntimeUsage {
  inputTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
}

export type CodexRuntimeEvent
  = | { type: 'session.started', sessionId: string }
    | { type: 'turn.started' }
    | { type: 'item.started' | 'item.updated' | 'item.completed', item: CodexThreadItem }
    | { type: 'turn.completed', usage: CodexRuntimeUsage }
    | { type: 'error', message: string, fatal: boolean }

export interface CodexRuntimeTurnParams {
  taskId: string
  sessionId?: string
  input: CodexInput
  client: CodexClientFactoryParams
  signal?: AbortSignal
  outputSchema?: Record<string, unknown>
  threadOptions?: CodexThreadOptions
}
