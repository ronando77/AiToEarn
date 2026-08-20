import type { z } from 'zod'
import type {
  AgentMessageVo,
  ContentGenerationTaskChunkVo,
} from '../../agent.vo'
import type { CodexRuntimeUsage } from './codex-runtime.types'
import type { CodexThreadItem } from './codex-sdk.types'
import { randomUUID } from 'node:crypto'
import { getExceptionPayload } from '@yikart/common'
import { ContentGenerationTaskStatus } from '@yikart/mongodb'
import {
  AgentMessageType,
  AgentMessageVoHelper,
  ContentGenerationTaskAgentChunkVo,
  ContentGenerationTaskChunkVoSchema,
  ContentGenerationTaskErrorChunkVo,
  ContentGenerationTaskInitChunkVo,
  ContentGenerationTaskKeepAliveChunkVo,
  ContentGenerationTaskResultUnionSchema,
} from '../../agent.vo'

type TaskResult = z.infer<typeof ContentGenerationTaskResultUnionSchema>

interface CompatibleMessageChunk {
  message: AgentMessageVo
  chunk: ContentGenerationTaskChunkVo
}

export class CodexSseCompatibilityService {
  validateChunk<TChunk extends ContentGenerationTaskChunkVo>(chunk: TChunk): TChunk {
    ContentGenerationTaskChunkVoSchema.parse(chunk)
    return chunk
  }

  createInitChunk(taskId: string): ContentGenerationTaskChunkVo {
    return this.validateChunk(ContentGenerationTaskInitChunkVo.create({
      type: AgentMessageType.Init,
      taskId,
      messages: undefined,
    }))
  }

  createKeepAliveChunk(): ContentGenerationTaskChunkVo {
    return this.validateChunk(ContentGenerationTaskKeepAliveChunkVo.create({
      type: AgentMessageType.KeepAlive,
    }))
  }

  createAssistantChunk(item: Extract<CodexThreadItem, { type: 'agent_message' }>, model?: string): CompatibleMessageChunk {
    const message = AgentMessageVoHelper.create({
      type: AgentMessageType.Assistant,
      uuid: item.id,
      message: {
        id: item.id,
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: item.text }],
      },
    })

    return {
      message,
      chunk: this.validateChunk(ContentGenerationTaskAgentChunkVo.create({
        type: AgentMessageType.Assistant,
        message,
      })),
    }
  }

  createResultChunk(
    finalResponse: string,
    taskResult: TaskResult | undefined,
    usage: CodexRuntimeUsage,
  ): CompatibleMessageChunk {
    const message = AgentMessageVoHelper.create({
      type: AgentMessageType.Result,
      subtype: 'success',
      uuid: randomUUID(),
      is_error: false,
      num_turns: 1,
      message: finalResponse,
      result: taskResult,
      usage: {
        input_tokens: usage.inputTokens,
        cache_read_input_tokens: usage.cachedInputTokens,
        cache_creation_input_tokens: usage.cacheWriteInputTokens,
        output_tokens: usage.outputTokens,
      },
    })

    return {
      message,
      chunk: this.validateChunk(ContentGenerationTaskAgentChunkVo.create({
        type: AgentMessageType.Result,
        message,
      })),
    }
  }

  createErrorChunk(error: unknown): ContentGenerationTaskErrorChunkVo {
    const payload = getExceptionPayload(error)
    return this.validateChunk(ContentGenerationTaskErrorChunkVo.create({
      type: AgentMessageType.Error,
      ...payload,
      timestamp: Date.now(),
    }))
  }

  getSuccessStatus(taskResult: TaskResult | undefined): ContentGenerationTaskStatus.Completed | ContentGenerationTaskStatus.RequiresAction {
    const resultArray = taskResult ? (Array.isArray(taskResult) ? taskResult : [taskResult]) : []
    const requiresAction = resultArray.some(item => (
      ['createChannel', 'updateChannel', 'loginChannel'].includes(item.action)
    ))
    return requiresAction
      ? ContentGenerationTaskStatus.RequiresAction
      : ContentGenerationTaskStatus.Completed
  }
}
