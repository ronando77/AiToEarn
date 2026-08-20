import type { AgentRuntimeService } from '../../services/agent-runtime.service'
import { of } from 'rxjs'
import { vi } from 'vitest'
import { ClaudeAgentRuntimeService } from './claude-agent-runtime.service'

describe('claudeAgentRuntimeService', () => {
  it('delegates task lifecycle calls to the existing runtime', async () => {
    const taskStream = of({ type: 'keep_alive' } as never)
    const delegate = {
      createContentGenerationTask: vi.fn().mockReturnValue(taskStream),
      abortTask: vi.fn(),
      waitForRunningTasks: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentRuntimeService
    const runtime = new ClaudeAgentRuntimeService(delegate)
    const params = { userId: 'user-1' } as never

    expect(runtime.name).toBe('claude')
    expect(runtime.createContentGenerationTask(params)).toBe(taskStream)
    expect(delegate.createContentGenerationTask).toHaveBeenCalledWith(params)

    runtime.abortTask('task-1')
    expect(delegate.abortTask).toHaveBeenCalledWith('task-1')

    await runtime.waitForRunningTasks()
    expect(delegate.waitForRunningTasks).toHaveBeenCalledOnce()
  })
})
