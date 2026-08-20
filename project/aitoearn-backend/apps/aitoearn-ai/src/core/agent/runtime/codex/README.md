# Codex runtime

This directory contains the provider-neutral foundation and concrete Codex-backed AiToEarn agent runtime.

## Runtime foundation

The foundation isolates the SDK thread API behind `CodexClientPort`; the concrete adapter is registered as the selectable `agent.runtime=codex` implementation while Claude remains the default.

It establishes the stable boundary used by the concrete SDK:

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

The current Claude runtime intentionally keeps its existing in-process SessionTools path in this phase. The concrete Codex runtime adapter must execute its turn inside `runTaskScoped()`. That wrapper registers before invoking the Codex execution callback and unregisters in an async-generator `finally`, including success, error, and early-consumer-return/abort paths. This keeps the new HTTP bridge isolated from current Claude production behavior while making the task-scoped transport available for Codex.

## Concrete SDK adapter

The concrete adapter uses `@openai/codex-sdk` and owns the TaskScoped SessionTools registration lifecycle:

- `Codex.startThread()` -> `CodexClientPort.startThread()`
- `Codex.resumeThread()` -> `CodexClientPort.resumeThread()`
- `Thread.runStreamed()` -> `CodexThreadPort.runStreamed()`
- `Thread.id` -> `CodexThreadPort.id`
- runtime execution -> `TaskScopedSessionToolsService.runTaskScoped()`
- registration callback -> merge `titleUpdate$` and read `getTaskResult()` when building AiToEarn output chunks

Each task-specific SDK client configures the local HTTP MCP endpoints above, the task-scoped SessionTools endpoint, and the existing server-side HTTP MCP endpoints before starting or resuming its thread.

Request-scoped authentication headers are passed through Codex `env_http_headers`. Each ephemeral SDK client receives a task-local child-process environment, so command-line config contains only environment variable names and never the Bearer/Cookie values. The child environment starts with the normal runtime environment because the SDK disables environment inheritance whenever its `env` option is provided.

## Session ownership and deployment

Codex thread IDs are persisted in the existing task `sessionId` field as `codex:<thread-id>`. Resume routing treats only that prefix as Codex-owned and strips it before calling `resumeThread()`. Existing bare session IDs remain Claude-owned, so legacy Claude tasks cannot be resumed by Codex and no database runtime field or migration is required.

The Codex SDK stores thread state under `CODEX_HOME` (normally `~/.codex/sessions`). This implementation is runnable for local and single-instance development. A multi-pod or restart-safe production rollout still requires persistent `CODEX_HOME` storage or equivalent object-storage synchronization. Claude remains the default runtime.
