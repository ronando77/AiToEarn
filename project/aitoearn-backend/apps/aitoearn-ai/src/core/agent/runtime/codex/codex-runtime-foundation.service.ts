import type { CodexClientPort } from './codex-sdk.types'
import type { CodexRuntimeEvent, CodexRuntimeTurnParams } from './codex-runtime.types'
import { mapCodexSdkEvent } from './codex-event.mapper'
import { CodexSessionService } from './codex-session.service'

export class CodexRuntimeFoundationService {
  constructor(
    private readonly client: CodexClientPort,
    private readonly sessions: CodexSessionService,
  ) {}

  async *runTurn(params: CodexRuntimeTurnParams): AsyncGenerator<CodexRuntimeEvent> {
    const sessionId = this.sessions.resolve(params.taskId, params.sessionId)
    const thread = sessionId
      ? this.client.resumeThread(sessionId, params.threadOptions)
      : this.client.startThread(params.threadOptions)

    const { events } = await thread.runStreamed(params.input, {
      signal: params.signal,
      outputSchema: params.outputSchema,
    })

    for await (const sdkEvent of events) {
      const runtimeEvent = mapCodexSdkEvent(sdkEvent)
      if (runtimeEvent.type === 'session.started') {
        this.sessions.bind(params.taskId, runtimeEvent.sessionId)
      }
      yield runtimeEvent
    }
  }
}
