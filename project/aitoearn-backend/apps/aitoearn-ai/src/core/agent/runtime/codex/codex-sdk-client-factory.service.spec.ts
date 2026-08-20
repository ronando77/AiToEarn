import type { Codex, Thread } from '@openai/codex-sdk'
import { describe, expect, it, vi } from 'vitest'
import { McpServerName } from '../../agent.constants'
import { CODEX_BRIDGED_MCP_SERVERS } from '../../mcp/agent-mcp-http-bridge.service'
import {
  CodexSdkClientAdapter,
  CodexSdkClientFactoryService,
  CodexSdkThreadAdapter,
} from './codex-sdk-client-factory.service'

describe('codex SDK adapters', () => {
  it('forwards start, resume, and streamed turn calls through the official SDK', async () => {
    const events = (async function* () {
      yield { type: 'turn.started' as const }
    })()
    const sdkThread = {
      id: 'thread-1',
      runStreamed: vi.fn().mockResolvedValue({ events }),
    } as unknown as Thread
    const sdkClient = {
      startThread: vi.fn().mockReturnValue(sdkThread),
      resumeThread: vi.fn().mockReturnValue(sdkThread),
    } as unknown as Codex
    const adapter = new CodexSdkClientAdapter(sdkClient)

    const started = adapter.startThread({ model: 'gpt-5.3-codex' })
    const resumed = adapter.resumeThread('thread-1')
    const streamed = await started.runStreamed('hello', { signal: new AbortController().signal })

    expect(started).toBeInstanceOf(CodexSdkThreadAdapter)
    expect(resumed.id).toBe('thread-1')
    expect(sdkClient.startThread).toHaveBeenCalledWith({ model: 'gpt-5.3-codex' })
    expect(sdkClient.resumeThread).toHaveBeenCalledWith('thread-1', undefined)
    expect(sdkThread.runStreamed).toHaveBeenCalledWith('hello', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(streamed.events).toBe(events)
  })

  it('configures every authenticated HTTP MCP bridge for a task', async () => {
    const adapter = await new CodexSdkClientFactoryService().create({
      taskId: 'task-1',
      headers: { authorization: 'Bearer token' },
    })
    const sdk = (adapter as unknown as {
      client: {
        options: {
          config: { mcp_servers: Record<string, unknown> }
          env: Record<string, string>
        }
      }
    }).client
    const servers = sdk.options.config.mcp_servers

    expect(Object.keys(servers)).toEqual([
      ...CODEX_BRIDGED_MCP_SERVERS,
      McpServerName.SessionTools,
      McpServerName.Account,
      McpServerName.Content,
      McpServerName.Statistics,
      McpServerName.Channels,
    ])
    expect(servers[McpServerName.SessionTools]).toMatchObject({
      url: expect.stringContaining('/agent/mcp/sessionTools/task-1'),
      env_http_headers: { authorization: 'AITOEARN_CODEX_MCP_HEADER_0' },
      required: true,
    })
    expect(sdk.options.env.AITOEARN_CODEX_MCP_HEADER_0).toBe('Bearer token')
    expect(sdk.options.env.NO_PROXY.split(',')).toEqual(expect.arrayContaining(['127.0.0.1', 'localhost', '::1']))
    expect(sdk.options.env.no_proxy).toBe(sdk.options.env.NO_PROXY)
    expect(JSON.stringify(sdk.options.config)).not.toContain('Bearer token')
  })
})
