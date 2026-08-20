import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { UserType } from '@yikart/common'
import { describe, expect, it, vi } from 'vitest'
import { McpServerName } from '../agent.constants'
import { AgentMcpHttpBridgeService } from './agent-mcp-http-bridge.service'

function createBridge() {
  const servers = {
    media: {} as McpServer,
    util: {} as McpServer,
    aideo: {} as McpServer,
    videoEdit: {} as McpServer,
    dramaRecap: {} as McpServer,
    videoUtils: {} as McpServer,
    styleTransfer: {} as McpServer,
    imageEdit: {} as McpServer,
    sessionTools: {} as McpServer,
  }

  const serverFactory = (server: McpServer) => ({
    createServer: vi.fn().mockReturnValue({ instance: server }),
  })
  const taskScopedSessionTools = {
    createServerForUser: vi.fn().mockReturnValue({ instance: servers.sessionTools }),
  }

  const bridge = new AgentMcpHttpBridgeService(
    serverFactory(servers.media) as never,
    serverFactory(servers.util) as never,
    serverFactory(servers.aideo) as never,
    serverFactory(servers.videoEdit) as never,
    serverFactory(servers.dramaRecap) as never,
    serverFactory(servers.videoUtils) as never,
    serverFactory(servers.styleTransfer) as never,
    serverFactory(servers.imageEdit) as never,
    taskScopedSessionTools as never,
  )

  return { bridge, servers, taskScopedSessionTools }
}

describe('AgentMcpHttpBridgeService', () => {
  it('creates a fresh server for each supported bridge name', () => {
    const { bridge, servers } = createBridge()

    expect(bridge.createServer(McpServerName.MediaGeneration, 'user-1', UserType.User)).toBe(servers.media)
    expect(bridge.createServer(McpServerName.Util, 'user-1', UserType.User)).toBe(servers.util)
    expect(bridge.createServer(McpServerName.Aideo, 'user-1', UserType.User)).toBe(servers.aideo)
    expect(bridge.createServer(McpServerName.VideoEdit, 'user-1', UserType.User)).toBe(servers.videoEdit)
    expect(bridge.createServer(McpServerName.DramaRecap, 'user-1', UserType.User)).toBe(servers.dramaRecap)
    expect(bridge.createServer(McpServerName.VideoUtils, 'user-1', UserType.User)).toBe(servers.videoUtils)
    expect(bridge.createServer(McpServerName.StyleTransfer, 'user-1', UserType.User)).toBe(servers.styleTransfer)
    expect(bridge.createServer(McpServerName.ImageEdit, 'user-1', UserType.User)).toBe(servers.imageEdit)
  })

  it('resolves task-scoped session tools with task and owner identity', () => {
    const { bridge, servers, taskScopedSessionTools } = createBridge()

    expect(bridge.createTaskScopedServer('task-1', 'user-1')).toBe(servers.sessionTools)
    expect(taskScopedSessionTools.createServerForUser).toHaveBeenCalledWith('task-1', 'user-1')
  })

  it('rejects session tools from the static bridge route', () => {
    const { bridge } = createBridge()

    expect(() => bridge.createServer(McpServerName.SessionTools, 'user-1', UserType.User))
      .toThrow('Unsupported agent MCP server: sessionTools')
  })
})
