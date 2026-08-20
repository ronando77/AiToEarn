export type CodexApprovalMode = 'never' | 'on-request' | 'on-failure' | 'untrusted'

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export type CodexModelReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type CodexWebSearchMode = 'disabled' | 'cached' | 'live'

export interface CodexThreadOptions {
  model?: string
  sandboxMode?: CodexSandboxMode
  workingDirectory?: string
  skipGitRepoCheck?: boolean
  modelReasoningEffort?: CodexModelReasoningEffort
  networkAccessEnabled?: boolean
  webSearchMode?: CodexWebSearchMode
  webSearchEnabled?: boolean
  approvalPolicy?: CodexApprovalMode
  additionalDirectories?: string[]
}

export type CodexUserInput =
  | { type: 'text', text: string }
  | { type: 'local_image', path: string }

export type CodexInput = string | CodexUserInput[]

export interface CodexTurnOptions {
  signal?: AbortSignal
  outputSchema?: Record<string, unknown>
}

export interface CodexUsage {
  input_tokens: number
  cached_input_tokens: number
  cache_write_input_tokens?: number
  output_tokens: number
  reasoning_output_tokens: number
}

export type CodexCommandExecutionStatus = 'in_progress' | 'completed' | 'failed'
export type CodexPatchApplyStatus = 'completed' | 'failed'
export type CodexMcpToolCallStatus = 'in_progress' | 'completed' | 'failed'
export type CodexPatchChangeKind = 'add' | 'delete' | 'update'

export type CodexThreadItem =
  | { id: string, type: 'agent_message', text: string }
  | { id: string, type: 'reasoning', text: string }
  | {
    id: string
    type: 'command_execution'
    command: string
    aggregated_output: string
    exit_code?: number
    status: CodexCommandExecutionStatus
  }
  | {
    id: string
    type: 'file_change'
    changes: Array<{ path: string, kind: CodexPatchChangeKind }>
    status: CodexPatchApplyStatus
  }
  | {
    id: string
    type: 'mcp_tool_call'
    server: string
    tool: string
    arguments: unknown
    result?: unknown
    error?: { message: string }
    status: CodexMcpToolCallStatus
  }
  | { id: string, type: 'web_search', query: string }
  | { id: string, type: 'todo_list', items: Array<{ text: string, completed: boolean }> }
  | { id: string, type: 'error', message: string }

export type CodexSdkEvent =
  | { type: 'thread.started', thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed', usage: CodexUsage }
  | { type: 'turn.failed', error: { message: string } }
  | { type: 'item.started' | 'item.updated' | 'item.completed', item: CodexThreadItem }
  | { type: 'error', message: string }

export interface CodexThreadPort {
  readonly id: string | null
  runStreamed(input: CodexInput, options?: CodexTurnOptions): Promise<{ events: AsyncIterable<CodexSdkEvent> }>
}

export interface CodexClientPort {
  startThread(options?: CodexThreadOptions): CodexThreadPort
  resumeThread(id: string, options?: CodexThreadOptions): CodexThreadPort
}
