import type { AgentRuntimeName } from './agent-runtime.types'
import type { ClaudeAgentRuntimeService } from './claude/claude-agent-runtime.service'
import type { CodexAgentRuntimeService } from './codex/codex-agent-runtime.service'
import { vi } from 'vitest'
import { AgentRuntimeRegistry } from './agent-runtime.registry'

describe('agentRuntimeRegistry', () => {
  const claudeRuntime = {
    name: 'claude',
    createContentGenerationTask: vi.fn(),
    abortTask: vi.fn(),
    waitForRunningTasks: vi.fn(),
    claudeQuery: vi.fn(),
  } as unknown as ClaudeAgentRuntimeService
  const codexRuntime = {
    name: 'codex',
    createContentGenerationTask: vi.fn(),
    abortTask: vi.fn(),
    waitForRunningTasks: vi.fn(),
  } as unknown as CodexAgentRuntimeService

  it('returns the Claude runtime', () => {
    const registry = new AgentRuntimeRegistry(claudeRuntime, codexRuntime)

    expect(registry.get('claude')).toBe(claudeRuntime)
  })

  it('returns the Codex runtime', () => {
    const registry = new AgentRuntimeRegistry(claudeRuntime, codexRuntime)

    expect(registry.get('codex')).toBe(codexRuntime)
  })

  it('fails explicitly for an unregistered runtime', () => {
    const registry = new AgentRuntimeRegistry(claudeRuntime, codexRuntime)

    expect(() => registry.get('unknown' as AgentRuntimeName)).toThrow('Unsupported agent runtime: unknown')
  })

  it('broadcasts aborts and waits for every runtime', async () => {
    const registry = new AgentRuntimeRegistry(claudeRuntime, codexRuntime)

    registry.abortTask('task-1')
    await registry.waitForRunningTasks()

    expect(claudeRuntime.abortTask).toHaveBeenCalledWith('task-1')
    expect(codexRuntime.abortTask).toHaveBeenCalledWith('task-1')
    expect(claudeRuntime.waitForRunningTasks).toHaveBeenCalledOnce()
    expect(codexRuntime.waitForRunningTasks).toHaveBeenCalledOnce()
  })
})
