import type { AgentRuntimeName } from './agent-runtime.types'
import type { ClaudeAgentRuntimeService } from './claude/claude-agent-runtime.service'
import { vi } from 'vitest'
import { AgentRuntimeRegistry } from './agent-runtime.registry'

describe('AgentRuntimeRegistry', () => {
  const claudeRuntime = {
    name: 'claude',
    createContentGenerationTask: vi.fn(),
    abortTask: vi.fn(),
    waitForRunningTasks: vi.fn(),
    claudeQuery: vi.fn(),
  } as unknown as ClaudeAgentRuntimeService

  it('returns the Claude runtime', () => {
    const registry = new AgentRuntimeRegistry(claudeRuntime)

    expect(registry.get('claude')).toBe(claudeRuntime)
  })

  it('fails explicitly for an unregistered runtime', () => {
    const registry = new AgentRuntimeRegistry(claudeRuntime)

    expect(() => registry.get('codex' as AgentRuntimeName)).toThrow('Unsupported agent runtime: codex')
  })
})
