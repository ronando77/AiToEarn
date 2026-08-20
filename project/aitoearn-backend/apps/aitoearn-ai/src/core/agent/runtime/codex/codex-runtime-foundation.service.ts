import type { CodexRuntimeEvent, CodexRuntimeTurnParams } from './codex-runtime.types'
import type { CodexClientFactoryPort } from './codex-sdk.types'
import { Inject, Injectable } from '@nestjs/common'
import { mapCodexSdkEvent } from './codex-event.mapper'
import { CODEX_CLIENT_FACTORY } from './codex-runtime.tokens'
import { CodexSessionService } from './codex-session.service'

@Injectable()
export class CodexRuntimeFoundationService {
  constructor(
    @Inject(CODEX_CLIENT_FACTORY) private readonly clientFactory: CodexClientFactoryPort,
    private readonly sessions: CodexSessionService,
  ) {}

  async* runTurn(params: CodexRuntimeTurnParams): AsyncGenerator<CodexRuntimeEvent> {
    const client = await this.clientFactory.create(params.client)
    const sessionId = this.sessions.resolve(params.taskId, params.sessionId)
    const thread = sessionId
      ? client.resumeThread(sessionId, params.threadOptions)
      : client.startThread(params.threadOptions)

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
