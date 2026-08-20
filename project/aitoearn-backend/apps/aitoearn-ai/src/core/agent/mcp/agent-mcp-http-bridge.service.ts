import type { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { BadRequestException, Injectable } from '@nestjs/common'
import { UserType } from '@yikart/common'
import { McpServerName } from '../agent.constants'
import { ImageEditMcp } from './image-edit.mcp'
import { MediaMcp } from './media.mcp'
import { TaskScopedSessionToolsService } from './task-scoped-session-tools.service'
import { UtilMcp } from './util.mcp'
import { VideoUtilsMcp } from './video-utils.mcp'
import { AideoMcp } from './volcengine/aideo.mcp'
import { DramaRecapMcp } from './volcengine/drama-recap.mcp'
import { StyleTransferMcp } from './volcengine/style-transfer.mcp'
import { VideoEditMcp } from './volcengine/video-edit.mcp'

export const CODEX_BRIDGED_MCP_SERVERS = [
  McpServerName.MediaGeneration,
  McpServerName.Util,
  McpServerName.Aideo,
  McpServerName.VideoEdit,
  McpServerName.DramaRecap,
  McpServerName.VideoUtils,
  McpServerName.StyleTransfer,
  McpServerName.ImageEdit,
] as const

@Injectable()
export class AgentMcpHttpBridgeService {
  constructor(
    private readonly mediaMcp: MediaMcp,
    private readonly utilMcp: UtilMcp,
    private readonly aideoMcp: AideoMcp,
    private readonly videoEditMcp: VideoEditMcp,
    private readonly dramaRecapMcp: DramaRecapMcp,
    private readonly videoUtilsMcp: VideoUtilsMcp,
    private readonly styleTransferMcp: StyleTransferMcp,
    private readonly imageEditMcp: ImageEditMcp,
    private readonly taskScopedSessionTools: TaskScopedSessionToolsService,
  ) {}

  createServer(serverName: string, userId: string, userType: UserType): McpServer {
    const config = (() => {
      switch (serverName) {
        case McpServerName.MediaGeneration:
          return this.mediaMcp.createServer(userId, userType)
        case McpServerName.Util:
          return this.utilMcp.createServer()
        case McpServerName.Aideo:
          return this.aideoMcp.createServer(userId, userType)
        case McpServerName.VideoEdit:
          return this.videoEditMcp.createServer(userId, userType)
        case McpServerName.DramaRecap:
          return this.dramaRecapMcp.createServer(userId, userType)
        case McpServerName.VideoUtils:
          return this.videoUtilsMcp.createServer(userId, userType)
        case McpServerName.StyleTransfer:
          return this.styleTransferMcp.createServer(userId, userType)
        case McpServerName.ImageEdit:
          return this.imageEditMcp.createServer(userId, userType)
        default:
          throw new BadRequestException(`Unsupported agent MCP server: ${serverName}`)
      }
    })()

    return config.instance as unknown as McpServer
  }

  createTaskScopedServer(taskId: string, userId: string): McpServer {
    return this.taskScopedSessionTools.createServerForUser(taskId, userId).instance as unknown as McpServer
  }

  async handleRequest(
    serverName: string,
    userId: string,
    req: Request,
    res: Response,
    body: unknown,
  ): Promise<void> {
    const server = this.createServer(serverName, userId, UserType.User)
    await this.handleServerRequest(server, req, res, body)
  }

  async handleTaskScopedRequest(
    taskId: string,
    userId: string,
    req: Request,
    res: Response,
    body: unknown,
  ): Promise<void> {
    const server = this.createTaskScopedServer(taskId, userId)
    await this.handleServerRequest(server, req, res, body)
  }

  private async handleServerRequest(
    server: McpServer,
    req: Request,
    res: Response,
    body: unknown,
  ): Promise<void> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    let cleanedUp = false
    const cleanup = async () => {
      if (cleanedUp)
        return
      cleanedUp = true
      await transport.close()
      await server.close()
    }

    try {
      await server.connect(transport)
      res.once('finish', () => void cleanup())
      res.once('close', () => void cleanup())
      await transport.handleRequest(req, res, body)
    }
    catch (error) {
      await cleanup()
      throw error
    }
  }
}
