import { Injectable } from '@nestjs/common'
import type { AgentRuntime, AgentRuntimeName } from './agent-runtime.types'
import { ClaudeAgentRuntimeService } from './claude/claude-agent-runtime.service'

@Injectable()
export class AgentRuntimeRegistry {
  private readonly runtimes: Map<AgentRuntimeName, AgentRuntime>

  constructor(claudeRuntime: ClaudeAgentRuntimeService) {
    this.runtimes = new Map<AgentRuntimeName, AgentRuntime>([
      [claudeRuntime.name, claudeRuntime],
    ])
  }

  get<TRuntime extends AgentRuntime = AgentRuntime>(name: AgentRuntimeName): TRuntime {
    const runtime = this.runtimes.get(name)
    if (!runtime) {
      throw new Error(`Unsupported agent runtime: ${name}`)
    }
    return runtime as TRuntime
  }
}
