import { Injectable, OnModuleDestroy } from '@nestjs/common'

export const CODEX_SESSION_ID_PREFIX = 'codex:'

export function isCodexSessionId(sessionId: string): boolean {
  return sessionId.startsWith(CODEX_SESSION_ID_PREFIX)
}

export function serializeCodexSessionId(threadId: string): string {
  return `${CODEX_SESSION_ID_PREFIX}${threadId}`
}

export function parseCodexSessionId(sessionId: string): string | undefined {
  return isCodexSessionId(sessionId)
    ? sessionId.slice(CODEX_SESSION_ID_PREFIX.length)
    : undefined
}

@Injectable()
export class CodexSessionService implements OnModuleDestroy {
  private readonly taskThreads = new Map<string, string>()

  bind(taskId: string, threadId: string): void {
    this.taskThreads.set(taskId, threadId)
  }

  resolve(taskId: string, persistedSessionId?: string): string | undefined {
    return this.taskThreads.get(taskId) ?? persistedSessionId
  }

  unbind(taskId: string): void {
    this.taskThreads.delete(taskId)
  }

  has(taskId: string): boolean {
    return this.taskThreads.has(taskId)
  }

  clear(): void {
    this.taskThreads.clear()
  }

  onModuleDestroy(): void {
    this.clear()
  }
}
