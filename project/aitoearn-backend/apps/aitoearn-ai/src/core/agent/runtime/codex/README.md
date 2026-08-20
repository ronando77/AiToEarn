# Codex runtime foundation

This directory contains the provider-neutral foundation for a future Codex-backed AiToEarn agent runtime.

## Phase 2A foundation

The current code intentionally does **not** register `codex` as a selectable `agent.runtime` and does not import `@openai/codex-sdk` yet.

It establishes the stable boundary needed before wiring the concrete SDK:

- a small `CodexClientPort` matching the Codex SDK thread API used by AiToEarn;
- start/resume thread selection from the existing task `sessionId`;
- `AbortSignal` forwarding;
- streamed Codex event normalization;
- task-to-thread binding for the active process.

Keeping the concrete SDK behind a port lets tests run without starting the Codex CLI and avoids coupling AiToEarn orchestration code to SDK-specific classes.

## Phase 2B local MCP bridge

The existing Claude runtime creates several MCP servers in-process with the Anthropic Agent SDK. Codex runs through the Codex CLI and needs MCP servers reachable through its own MCP configuration.

AiToEarn now exposes the active reusable local agent MCP servers through authenticated stateless Streamable HTTP endpoints under:

`POST /agent/mcp/:serverName`

Supported server names are:

- `mediaGeneration`
- `util`
- `aideo`
- `videoEdit`
- `dramaRecap`
- `videoUtils`
- `styleTransfer`
- `imageEdit`

The bridge does not copy tool implementations. It creates the existing MCP server for the authenticated user, connects it to a fresh Streamable HTTP transport for the request, and closes both after the response finishes.

### Remaining MCP work

`sessionTools` is intentionally not bridged yet. Its `setTitle` and `outputTaskResult` tools are created for a specific AiToEarn task, so the Codex runtime must expose them through a task-scoped endpoint or replace them with equivalent runtime orchestration before `agent.runtime: codex` is enabled.

The existing account/content/statistics/channels MCP servers are already HTTP-based and do not need this local bridge.

## Concrete SDK adapter

After task-scoped session tools and the dependency lockfile are ready, add a thin adapter that implements `CodexClientPort` with `@openai/codex-sdk`:

- `Codex.startThread()` -> `CodexClientPort.startThread()`
- `Codex.resumeThread()` -> `CodexClientPort.resumeThread()`
- `Thread.runStreamed()` -> `CodexThreadPort.runStreamed()`
- `Thread.id` -> `CodexThreadPort.id`

Then configure the Codex thread with the HTTP MCP endpoints above plus the existing server-side HTTP MCP endpoints. Only after that should `codex` be added to the selectable `agent.runtime` values.
