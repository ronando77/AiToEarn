import { describe, expect, it } from 'vitest'
import { CodexSessionService } from './codex-session.service'

describe('CodexSessionService', () => {
  it('prefers an in-memory thread binding over a persisted session id', () => {
    const sessions = new CodexSessionService()
    sessions.bind('task-1', 'thread-live')

    expect(sessions.resolve('task-1', 'thread-persisted')).toBe('thread-live')
  })

  it('falls back to the persisted session id after unbind', () => {
    const sessions = new CodexSessionService()
    sessions.bind('task-1', 'thread-live')
    sessions.unbind('task-1')

    expect(sessions.resolve('task-1', 'thread-persisted')).toBe('thread-persisted')
  })
})
