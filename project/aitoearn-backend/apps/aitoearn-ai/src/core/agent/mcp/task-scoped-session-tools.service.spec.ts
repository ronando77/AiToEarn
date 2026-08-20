import { describe, expect, it, vi } from 'vitest'
import { TaskScopedSessionToolsService } from './task-scoped-session-tools.service'
import { UtilMcp } from './util.mcp'

function createService() {
  const contentGenerateRepository = {
    updateById: vi.fn(),
  }
  const aiAvailability = {}
  const utilMcp = new UtilMcp(
    contentGenerateRepository as never,
    aiAvailability as never,
  )
  const service = new TaskScopedSessionToolsService(
    utilMcp,
    aiAvailability as never,
  )

  return { service }
}

describe('TaskScopedSessionToolsService', () => {
  it('registers a task and creates fresh MCP servers for its owner', () => {
    const { service } = createService()
    const registration = service.register('task-1', 'user-1')

    expect(service.has('task-1')).toBe(true)
    expect(registration.taskId).toBe('task-1')
    expect(registration.createServer().instance).toBeDefined()
    expect(service.createServerForUser('task-1', 'user-1').instance).toBeDefined()
  })

  it('rejects access from another user', () => {
    const { service } = createService()
    service.register('task-1', 'user-1')

    expect(() => service.createServerForUser('task-1', 'user-2'))
      .toThrow('Session tools do not belong to user: user-2')
  })

  it('prevents duplicate registrations and removes registrations on cleanup', () => {
    const { service } = createService()
    service.register('task-1', 'user-1')

    expect(() => service.register('task-1', 'user-1'))
      .toThrow('Session tools already registered for task: task-1')

    service.unregister('task-1')

    expect(service.has('task-1')).toBe(false)
    expect(() => service.createServerForUser('task-1', 'user-1'))
      .toThrow('Session tools are not registered for task: task-1')
  })
})
