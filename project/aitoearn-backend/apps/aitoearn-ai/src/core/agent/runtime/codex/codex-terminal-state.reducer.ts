import { ContentGenerationTaskStatus } from '@yikart/mongodb'

export type CodexTerminalStatus
  = | ContentGenerationTaskStatus.Completed
    | ContentGenerationTaskStatus.RequiresAction
    | ContentGenerationTaskStatus.Error
    | ContentGenerationTaskStatus.Aborted

export class CodexTerminalStateReducer {
  private committedStatus: CodexTerminalStatus | undefined

  get status(): CodexTerminalStatus | undefined {
    return this.committedStatus
  }

  tryCommit(status: CodexTerminalStatus): boolean {
    if (this.committedStatus)
      return false

    this.committedStatus = status
    return true
  }
}
