import { UserType } from '@yikart/common'
import { lastValueFrom, of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { AgentService } from './agent.service'

function createService() {
  const repository = {
    getByUserIdAndId: vi.fn(),
  }
  const runtimes = {
    claude: {
      createContentGenerationTask: vi.fn().mockReturnValue(of({ type: 'keep_alive' })),
    },
    codex: {
      createContentGenerationTask: vi.fn().mockReturnValue(of({ type: 'keep_alive' })),
    },
  }
  const registry = {
    get: vi.fn((name: 'claude' | 'codex') => runtimes[name]),
    abortTask: vi.fn(),
    waitForRunningTasks: vi.fn().mockResolvedValue(undefined),
  }
  const redis = {
    on: vi.fn(),
  }
  const service = new AgentService(repository as never, registry as never, redis as never)
  const createTask = (taskId?: string) => service.createContentGenerationTask(
    'user-1',
    UserType.User,
    {
      prompt: 'hello',
      model: 'test-model',
      includePartialMessages: false,
      taskId,
    } as never,
    new AbortController(),
    { headers: {} } as never,
    { closed: false, end: vi.fn() } as never,
  )

  return { createTask, redis, registry, repository, runtimes, service }
}

describe('agentService runtime routing', () => {
  it('routes legacy persisted sessions to Claude', async () => {
    const { createTask, repository, runtimes } = createService()
    repository.getByUserIdAndId.mockResolvedValue({ sessionId: 'claude-session-id' })

    await lastValueFrom(createTask('task-1'))

    expect(runtimes.claude.createContentGenerationTask).toHaveBeenCalledOnce()
    expect(runtimes.codex.createContentGenerationTask).not.toHaveBeenCalled()
  })

  it('routes namespaced Codex sessions back to Codex', async () => {
    const { createTask, repository, runtimes } = createService()
    repository.getByUserIdAndId.mockResolvedValue({
      sessionId: 'codex:thread-1',
    })

    await lastValueFrom(createTask('task-1'))

    expect(runtimes.codex.createContentGenerationTask).toHaveBeenCalledOnce()
    expect(runtimes.claude.createContentGenerationTask).not.toHaveBeenCalled()
  })

  it('broadcasts aborts and waits for all runtime tasks', async () => {
    const { redis, registry, service } = createService()
    await service.onModuleInit()
    const abortListener = redis.on.mock.calls[0][1] as (taskId: string) => void

    abortListener('task-1')
    await service.onModuleDestroy()

    expect(registry.abortTask).toHaveBeenCalledWith('task-1')
    expect(registry.waitForRunningTasks).toHaveBeenCalledOnce()
  })
})
