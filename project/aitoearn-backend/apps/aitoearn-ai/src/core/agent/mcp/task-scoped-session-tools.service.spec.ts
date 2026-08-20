import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it, vi } from 'vitest'
import { TaskScopedSessionToolsService } from './task-scoped-session-tools.service'
import { UtilMcp, UtilToolName } from './util.mcp'

function createService() {
  const contentGenerateRepository = {
    updateById: vi.fn(),
  }
  const aiAvailability = {
    execute: vi.fn().mockImplementation((_context: unknown, handler: () => unknown) => handler()),
  }
  const utilMcp = new UtilMcp(
    contentGenerateRepository as never,
    aiAvailability as never,
  )
  const service = new TaskScopedSessionToolsService(
    utilMcp,
    aiAvailability as never,
  )

  return { contentGenerateRepository, service }
}

interface TestTool {
  name: string
  handler: (args: Record<string, unknown>, context: Record<string, unknown>) => Promise<CallToolResult>
}

function getTool(
  registration: ReturnType<TaskScopedSessionToolsService['register']>,
  name: UtilToolName,
): TestTool {
  const server = registration.createServer() as unknown as { tools: TestTool[] }
  const tool = server.tools.find(candidate => candidate.name === name)
  if (!tool)
    throw new Error(`Missing test tool: ${name}`)
  return tool
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of stream) {
    values.push(value)
  }
  return values
}

describe('taskScopedSessionToolsService', () => {
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
      .toThrow('Session tools are not registered for task: task-1')
  })

  it('does not reveal whether a task belongs to another user', () => {
    const { service } = createService()
    service.register('task-1', 'user-1')

    const getStatus = (taskId: string) => {
      try {
        service.createServerForUser(taskId, 'user-2')
      }
      catch (error) {
        return (error as { getStatus: () => number }).getStatus()
      }
    }

    expect(getStatus('task-1')).toBe(404)
    expect(getStatus('missing-task')).toBe(404)
  })

  it('prevents duplicate registrations and removes registrations on cleanup', async () => {
    const { service } = createService()
    service.register('task-1', 'user-1')

    expect(() => service.register('task-1', 'user-1'))
      .toThrow('Session tools already registered for task: task-1')

    await service.unregister('task-1')

    expect(service.has('task-1')).toBe(false)
    expect(() => service.createServerForUser('task-1', 'user-1'))
      .toThrow('Session tools are not registered for task: task-1')
  })

  it('keeps the latest outputTaskResult while active and rejects stale servers after cleanup', async () => {
    const { service } = createService()
    const registration = service.register('task-1', 'user-1')
    const outputTaskResult = getTool(registration, UtilToolName.OutputTaskResult)
    const firstResult = { type: 'mediaOnly' as const, action: 'none' as const, medias: [] }
    const latestResult = {
      type: 'mediaOnly' as const,
      action: 'none' as const,
      medias: [{ type: 'IMAGE' as const, url: 'https://example.com/latest.png' }],
    }

    await outputTaskResult.handler({ result: firstResult }, {})
    await outputTaskResult.handler({ result: latestResult }, {})
    expect(registration.getTaskResult()).toEqual(latestResult)

    await service.unregister('task-1')
    const staleCall = await outputTaskResult.handler({ result: firstResult }, {})

    expect(staleCall.isError).toBe(true)
    expect(registration.getTaskResult()).toEqual(latestResult)
  })

  it('completes titleUpdate$ and rejects stale title writes after cleanup', async () => {
    const { contentGenerateRepository, service } = createService()
    const registration = service.register('task-1', 'user-1')
    const setTitle = getTool(registration, UtilToolName.SetTitle)
    const complete = vi.fn()
    registration.titleUpdate$.subscribe({ complete })

    await service.unregister('task-1')
    const staleCall = await setTitle.handler({ title: 'Too late' }, {})

    expect(complete).toHaveBeenCalledOnce()
    expect(staleCall.isError).toBe(true)
    expect(contentGenerateRepository.updateById).not.toHaveBeenCalled()
  })

  it('drains an in-flight title update before completing titleUpdate$', async () => {
    const { contentGenerateRepository, service } = createService()
    let finishUpdate: (() => void) | undefined
    contentGenerateRepository.updateById.mockImplementation(() => new Promise<void>((resolve) => {
      finishUpdate = resolve
    }))
    const registration = service.register('task-1', 'user-1')
    const setTitle = getTool(registration, UtilToolName.SetTitle)
    const events: string[] = []
    registration.titleUpdate$.subscribe({
      next: chunk => events.push(chunk.title),
      complete: () => events.push('complete'),
    })

    const titleCall = setTitle.handler({ title: 'In flight' }, {})
    await vi.waitFor(() => expect(contentGenerateRepository.updateById).toHaveBeenCalledOnce())
    const unregister = service.unregister('task-1')

    expect(service.has('task-1')).toBe(false)
    expect(events).toEqual([])
    finishUpdate?.()
    await Promise.all([titleCall, unregister])

    expect(events).toEqual(['In flight', 'complete'])
  })

  it('cleans up every active registration when the module shuts down', async () => {
    const { service } = createService()
    const firstComplete = vi.fn()
    const secondComplete = vi.fn()
    service.register('task-1', 'user-1').titleUpdate$.subscribe({ complete: firstComplete })
    service.register('task-2', 'user-2').titleUpdate$.subscribe({ complete: secondComplete })

    await service.onModuleDestroy()

    expect(service.has('task-1')).toBe(false)
    expect(service.has('task-2')).toBe(false)
    expect(firstComplete).toHaveBeenCalledOnce()
    expect(secondComplete).toHaveBeenCalledOnce()
  })

  it('registers before task execution and unregisters after success', async () => {
    const { service } = createService()

    const values = await collect(service.runTaskScoped('task-1', 'user-1', async function* (registration) {
      expect(service.has('task-1')).toBe(true)
      expect(registration.taskId).toBe('task-1')
      yield 'done'
    }))

    expect(values).toEqual(['done'])
    expect(service.has('task-1')).toBe(false)
  })

  it('unregisters when task execution fails', async () => {
    const { service } = createService()

    const stream = service.runTaskScoped('task-1', 'user-1', async function* () {
      throw new Error('Codex failed')
    })

    await expect(collect(stream)).rejects.toThrow('Codex failed')
    expect(service.has('task-1')).toBe(false)
  })

  it('unregisters when task consumption is aborted', async () => {
    const { service } = createService()
    const stream = service.runTaskScoped('task-1', 'user-1', async function* () {
      yield 'started'
      yield 'not-consumed'
    })

    await expect(stream.next()).resolves.toEqual({ value: 'started', done: false })
    expect(service.has('task-1')).toBe(true)

    await stream.return(undefined)

    expect(service.has('task-1')).toBe(false)
  })

  it('does not unregister a replacement registration from an older task finalizer', async () => {
    const { service } = createService()
    const stream = service.runTaskScoped('task-1', 'user-1', async function* () {
      yield 'started'
      yield 'not-consumed'
    })

    await stream.next()
    await service.unregister('task-1')
    const replacement = service.register('task-1', 'user-1')

    await stream.return(undefined)

    expect(service.has('task-1')).toBe(true)
    expect(service.createServerForUser('task-1', 'user-1').instance).toBeDefined()
    await service.unregister(replacement.taskId)
  })
})
