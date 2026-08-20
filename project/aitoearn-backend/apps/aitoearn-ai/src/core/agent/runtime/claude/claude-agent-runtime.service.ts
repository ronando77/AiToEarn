import { Injectable } from '@nestjs/common'
import type { Observable } from 'rxjs'
import type { ContentGenerationTaskChunkVo } from '../../agent.vo'
import { AgentRuntimeService } from '../../services/agent-runtime.service'
import type { AgentRuntime, AgentRuntimeTaskParams } from '../agent-runtime.types'

@Injectable()
export class ClaudeAgentRuntimeService implements AgentRuntime {
  readonly name = 'claude' as const

  constructor(private readonly delegate: AgentRuntimeService) {}

  createContentGenerationTask(params: AgentRuntimeTaskParams): Observable<ContentGenerationTaskChunkVo> {
    return this.delegate.createContentGenerationTask(params)
  }

  abortTask(taskId: string): void {
    this.delegate.abortTask(taskId)
  }

  waitForRunningTasks(): Promise<void> {
    return this.delegate.waitForRunningTasks()
  }

  claudeQuery(
    ...args: Parameters<AgentRuntimeService['claudeQuery']>
  ): ReturnType<AgentRuntimeService['claudeQuery']> {
    return this.delegate.claudeQuery(...args)
  }
}
