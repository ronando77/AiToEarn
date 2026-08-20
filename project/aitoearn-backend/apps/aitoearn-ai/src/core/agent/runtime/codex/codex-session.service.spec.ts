import { describe, expect, it } from 'vitest'
import {
  CodexSessionService,
  isCodexSessionId,
  parseCodexSessionId,
  serializeCodexSessionId,
} from './codex-session.service'

describe('codexSessionService', () => {
  it('namespaces persisted Codex thread ids', () => {
    expect(serializeCodexSessionId('thread-1')).toBe('codex:thread-1')
    expect(isCodexSessionId('codex:thread-1')).toBe(true)
    expect(parseCodexSessionId('codex:thread-1')).toBe('thread-1')
    expect(parseCodexSessionId('claude-session')).toBeUndefined()
  })

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

  it('clears every task binding on module shutdown', () => {
    const sessions = new CodexSessionService()
    sessions.bind('task-1', 'thread-1')
    sessions.bind('task-2', 'thread-2')

    sessions.onModuleDestroy()

    expect(sessions.has('task-1')).toBe(false)
    expect(sessions.has('task-2')).toBe(false)
  })
})
