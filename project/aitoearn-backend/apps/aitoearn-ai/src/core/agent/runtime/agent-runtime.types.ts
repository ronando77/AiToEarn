import type { UserType } from '@yikart/common'
import type { Request, Response } from 'express'
import type { Observable } from 'rxjs'
import type { CreateContentGenerationTaskDto } from '../agent.dto'
import type { ContentGenerationTaskChunkVo } from '../agent.vo'

export const AGENT_RUNTIME_NAMES = ['claude'] as const

export type AgentRuntimeName = typeof AGENT_RUNTIME_NAMES[number]

export interface AgentRuntimeTaskParams {
  userId: string
  userType: UserType
  dto: CreateContentGenerationTaskDto
  abortController: AbortController
  req: Request
  res: Response
}

export interface AgentRuntime {
  readonly name: AgentRuntimeName

  createContentGenerationTask(params: AgentRuntimeTaskParams): Observable<ContentGenerationTaskChunkVo>

  abortTask(taskId: string): void

  waitForRunningTasks(): Promise<void>
}
