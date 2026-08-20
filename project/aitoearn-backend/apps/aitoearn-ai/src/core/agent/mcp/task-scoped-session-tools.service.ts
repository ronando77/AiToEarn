import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import type { Observable } from 'rxjs'
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { z } from 'zod'
import { AiAvailabilityService } from '../../ai-availability'
import { McpServerName } from '../agent.constants'
import {
  ContentGenerationTaskResultSchema,
  ContentGenerationTaskResultUnionSchema,
  ContentGenerationTaskTitleUpdatedChunkVo,
} from '../agent.vo'
import { successResult, wrapTool } from './mcp.utils'
import { UtilMcp, UtilToolName } from './util.mcp'

type TaskResult = z.infer<typeof ContentGenerationTaskResultUnionSchema>

export interface TaskScopedSessionToolsRegistration {
  readonly taskId: string
  readonly titleUpdate$: Observable<ContentGenerationTaskTitleUpdatedChunkVo>
  createServer: () => McpSdkServerConfigWithInstance
  getTaskResult: () => TaskResult | undefined
}

interface TaskScopedSessionToolsEntry extends TaskScopedSessionToolsRegistration {
  readonly ownerUserId: string
  complete: () => void
}

@Injectable()
export class TaskScopedSessionToolsService {
  private readonly logger = new Logger(TaskScopedSessionToolsService.name)
  private readonly entries = new Map<string, TaskScopedSessionToolsEntry>()

  constructor(
    private readonly utilMcp: UtilMcp,
    private readonly aiAvailability: AiAvailabilityService,
  ) {}

  register(taskId: string, ownerUserId: string): TaskScopedSessionToolsRegistration {
    if (this.entries.has(taskId)) {
      throw new ConflictException(`Session tools already registered for task: ${taskId}`)
    }

    let taskResult: TaskResult | undefined

    const outputTaskResultTool = wrapTool(
      this.logger,
      UtilToolName.OutputTaskResult,
      'output task result JSON, the result will be included in the completion message.',
      ContentGenerationTaskResultSchema.shape,
      async (args) => {
        taskResult = args.result
        return successResult('Task result submitted successfully')
      },
      this.aiAvailability,
    )

    const [setTitleTool, titleUpdate$, completeTitleUpdate] = this.utilMcp.createSetTitleTool(taskId)

    const entry: TaskScopedSessionToolsEntry = {
      taskId,
      ownerUserId,
      titleUpdate$,
      createServer: () => createSdkMcpServer({
        name: McpServerName.SessionTools,
        version: '1.0.0',
        tools: [outputTaskResultTool, setTitleTool],
      }),
      getTaskResult: () => taskResult,
      complete: completeTitleUpdate,
    }

    this.entries.set(taskId, entry)
    return entry
  }

  createServerForUser(taskId: string, userId: string): McpSdkServerConfigWithInstance {
    const entry = this.getEntry(taskId)
    if (entry.ownerUserId !== userId) {
      throw new ForbiddenException(`Session tools do not belong to user: ${userId}`)
    }
    return entry.createServer()
  }

  unregister(taskId: string): void {
    const entry = this.entries.get(taskId)
    if (!entry)
      return

    entry.complete()
    this.entries.delete(taskId)
  }

  has(taskId: string): boolean {
    return this.entries.has(taskId)
  }

  private getEntry(taskId: string): TaskScopedSessionToolsEntry {
    const entry = this.entries.get(taskId)
    if (!entry) {
      throw new NotFoundException(`Session tools are not registered for task: ${taskId}`)
    }
    return entry
  }
}
