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

AiToEarn exposes the reusable local agent MCP servers through authenticated stateless Streamable HTTP endpoints under:

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

The existing account/content/statistics/channels MCP servers are already HTTP-based and do not need this local bridge.

## Phase 2C task-scoped session tools bridge

`setTitle` and `outputTaskResult` are different from the reusable MCP tools because they belong to one AiToEarn task execution. `TaskScopedSessionToolsService` provides a runtime-owned registry for them.

An active runtime registers a task with:

- `taskId`;
- owner `userId`;
- the task-local `outputTaskResult` state;
- the existing `setTitle` observable lifecycle;
- a factory that creates fresh SessionTools MCP server instances.

Codex can then access that task's tools through:

`POST /agent/mcp/sessionTools/:taskId`

The endpoint checks that the authenticated user owns the registration before returning a server, and returns no task-scoped server after the runtime unregisters the task.

The current Claude runtime intentionally keeps its existing in-process SessionTools path in this phase. The concrete Codex runtime adapter must call `register()` before starting a Codex turn and `unregister()` in its task finalizer. This keeps the new HTTP bridge isolated from current Claude production behavior while making the task-scoped transport available for Codex.

## Concrete SDK adapter

The remaining integration step is a thin adapter that implements `CodexClientPort` with `@openai/codex-sdk` and owns the TaskScoped SessionTools registration lifecycle:

- `Codex.startThread()` -> `CodexClientPort.startThread()`
- `Codex.resumeThread()` -> `CodexClientPort.resumeThread()`
- `Thread.runStreamed()` -> `CodexThreadPort.runStreamed()`
- `Thread.id` -> `CodexThreadPort.id`
- runtime start -> `TaskScopedSessionToolsService.register()`
- runtime finalize -> `TaskScopedSessionToolsService.unregister()`

Then configure the Codex thread with the local HTTP MCP endpoints above, the task-scoped SessionTools endpoint, and the existing server-side HTTP MCP endpoints. Only after that should `codex` be added to the selectable `agent.runtime` values.
