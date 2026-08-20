import type { AgentRuntime, AgentRuntimeName } from './agent-runtime.types'
import { Injectable } from '@nestjs/common'
import { ClaudeAgentRuntimeService } from './claude/claude-agent-runtime.service'
import { CodexAgentRuntimeService } from './codex/codex-agent-runtime.service'

@Injectable()
export class AgentRuntimeRegistry {
  private readonly runtimes: Map<AgentRuntimeName, AgentRuntime>

  constructor(
    claudeRuntime: ClaudeAgentRuntimeService,
    codexRuntime: CodexAgentRuntimeService,
  ) {
    this.runtimes = new Map<AgentRuntimeName, AgentRuntime>([
      [claudeRuntime.name, claudeRuntime],
      [codexRuntime.name, codexRuntime],
    ])
  }

  get<TRuntime extends AgentRuntime = AgentRuntime>(name: AgentRuntimeName): TRuntime {
    const runtime = this.runtimes.get(name)
    if (!runtime) {
      throw new Error(`Unsupported agent runtime: ${name}`)
    }
    return runtime as TRuntime
  }

  abortTask(taskId: string): void {
    for (const runtime of this.runtimes.values())
      runtime.abortTask(taskId)
  }

  async waitForRunningTasks(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map(runtime => runtime.waitForRunningTasks()))
  }
}
