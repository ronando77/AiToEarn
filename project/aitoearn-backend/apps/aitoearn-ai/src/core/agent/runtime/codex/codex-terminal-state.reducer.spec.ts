import { ContentGenerationTaskStatus } from '@yikart/mongodb'
import { describe, expect, it } from 'vitest'
import { CodexTerminalStateReducer } from './codex-terminal-state.reducer'

describe('codexTerminalStateReducer', () => {
  it.each([
    ContentGenerationTaskStatus.Completed,
    ContentGenerationTaskStatus.RequiresAction,
    ContentGenerationTaskStatus.Error,
    ContentGenerationTaskStatus.Aborted,
  ])('allows %s to win exactly once', (winner) => {
    const terminal = new CodexTerminalStateReducer()

    expect(terminal.tryCommit(winner)).toBe(true)
    for (const later of [
      ContentGenerationTaskStatus.Completed,
      ContentGenerationTaskStatus.RequiresAction,
      ContentGenerationTaskStatus.Error,
      ContentGenerationTaskStatus.Aborted,
    ]) {
      expect(terminal.tryCommit(later)).toBe(false)
    }
    expect(terminal.status).toBe(winner)
  })
})
