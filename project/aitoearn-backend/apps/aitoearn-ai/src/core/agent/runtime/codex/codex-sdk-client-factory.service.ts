import type { Codex, Thread } from '@openai/codex-sdk'
import type {
  CodexClientFactoryParams,
  CodexClientFactoryPort,
  CodexClientPort,
  CodexInput,
  CodexThreadOptions,
  CodexThreadPort,
  CodexTurnOptions,
} from './codex-sdk.types'
import { Injectable } from '@nestjs/common'
import { config, runtimeProcessEnvironment } from '../../../../config'
import { McpServerName } from '../../agent.constants'
import { CODEX_BRIDGED_MCP_SERVERS } from '../../mcp/agent-mcp-http-bridge.service'

export class CodexSdkThreadAdapter implements CodexThreadPort {
  constructor(private readonly thread: Thread) {}

  get id(): string | null {
    return this.thread.id
  }

  async runStreamed(input: CodexInput, options?: CodexTurnOptions) {
    return await this.thread.runStreamed(input, options)
  }
}

export class CodexSdkClientAdapter implements CodexClientPort {
  constructor(private readonly client: Codex) {}

  startThread(options?: CodexThreadOptions): CodexThreadPort {
    return new CodexSdkThreadAdapter(this.client.startThread(options))
  }

  resumeThread(id: string, options?: CodexThreadOptions): CodexThreadPort {
    return new CodexSdkThreadAdapter(this.client.resumeThread(id, options))
  }
}

@Injectable()
export class CodexSdkClientFactoryService implements CodexClientFactoryPort {
  async create(params: CodexClientFactoryParams): Promise<CodexClientPort> {
    const { Codex } = await import('@openai/codex-sdk')
    const globalPrefix = config.globalPrefix ? `/${config.globalPrefix.replace(/^\/+|\/+$/g, '')}` : ''
    const localBaseUrl = `http://127.0.0.1:${config.port}${globalPrefix}`
    const serverBaseUrl = config.serverClient.baseUrl.replace(/\/+$/g, '')
    const headerEnvironment = Object.fromEntries(
      Object.entries(params.headers).map(([, value], index) => [
        `AITOEARN_CODEX_MCP_HEADER_${index}`,
        value,
      ]),
    )
    const environmentHeaders = Object.fromEntries(
      Object.keys(params.headers).map((headerName, index) => [
        headerName,
        `AITOEARN_CODEX_MCP_HEADER_${index}`,
      ]),
    )
    const noProxy = [...new Set([
      runtimeProcessEnvironment['NO_PROXY'],
      runtimeProcessEnvironment['no_proxy'],
      '127.0.0.1',
      'localhost',
      '::1',
    ].flatMap(value => value?.split(',') ?? []).map(value => value.trim()).filter(Boolean))].join(',')
    const httpServer = (url: string) => ({
      url,
      env_http_headers: environmentHeaders,
      required: true,
    })

    const mcpServers = Object.fromEntries([
      ...CODEX_BRIDGED_MCP_SERVERS.map(serverName => [
        serverName,
        httpServer(`${localBaseUrl}/agent/mcp/${serverName}`),
      ]),
      [
        McpServerName.SessionTools,
        httpServer(`${localBaseUrl}/agent/mcp/sessionTools/${params.taskId}`),
      ],
      [McpServerName.Account, httpServer(`${serverBaseUrl}/account/mcp`)],
      [McpServerName.Content, httpServer(`${serverBaseUrl}/content/mcp`)],
      [McpServerName.Statistics, httpServer(`${serverBaseUrl}/statistics/mcp`)],
      [McpServerName.Channels, httpServer(`${serverBaseUrl}/channels/mcp`)],
    ])

    return new CodexSdkClientAdapter(new Codex({
      baseUrl: config.agent.baseUrl,
      apiKey: config.agent.apiKey,
      env: {
        ...runtimeProcessEnvironment,
        NO_PROXY: noProxy,
        no_proxy: noProxy,
        ...headerEnvironment,
      },
      config: {
        mcp_servers: mcpServers,
      },
    }))
  }
}
