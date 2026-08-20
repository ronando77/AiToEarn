export class CodexSessionService {
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

  clear(): void {
    this.taskThreads.clear()
  }
}
