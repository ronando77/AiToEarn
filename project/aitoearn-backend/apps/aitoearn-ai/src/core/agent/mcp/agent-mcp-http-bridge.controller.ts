import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { Request, Response } from 'express'
import { AgentMcpHttpBridgeService } from './agent-mcp-http-bridge.service'

@ApiTags('Agent/MCP Bridge')
@Controller('agent/mcp')
export class AgentMcpHttpBridgeController {
  constructor(private readonly bridge: AgentMcpHttpBridgeService) {}

  @Post(':serverName')
  async handlePost(
    @GetToken() token: TokenInfo,
    @Param('serverName') serverName: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.bridge.handleRequest(serverName, token.id, req, res, body)
  }
}
