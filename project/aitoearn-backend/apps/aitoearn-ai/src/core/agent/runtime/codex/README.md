# Codex runtime foundation

This directory contains the provider-neutral foundation for a future Codex-backed AiToEarn agent runtime.

## Phase 2A scope

The current code intentionally does **not** register `codex` as a selectable `agent.runtime` and does not import `@openai/codex-sdk` yet.

It establishes the stable boundary needed before wiring the concrete SDK:

- a small `CodexClientPort` matching the Codex SDK thread API used by AiToEarn;
- start/resume thread selection from the existing task `sessionId`;
- `AbortSignal` forwarding;
- streamed Codex event normalization;
- task-to-thread binding for the active process.

Keeping the concrete SDK behind a port lets tests run without starting the Codex CLI and avoids coupling AiToEarn orchestration code to SDK-specific classes.

## Why Codex is not selectable yet

The existing Claude runtime creates several MCP servers in-process with the Anthropic Agent SDK. Codex runs through the Codex CLI and needs MCP servers that are reachable through its own MCP configuration. Those in-process Claude SDK server objects cannot be passed directly to Codex.

Before enabling `agent.runtime: codex`, Phase 2B must expose or bridge the required AiToEarn local tools through a transport Codex can reach, while preserving the existing account/content/statistics/channels HTTP MCP services.

## Concrete SDK adapter

After the MCP bridge and dependency lockfile are ready, add a thin adapter that implements `CodexClientPort` with `@openai/codex-sdk`:

- `Codex.startThread()` -> `CodexClientPort.startThread()`
- `Codex.resumeThread()` -> `CodexClientPort.resumeThread()`
- `Thread.runStreamed()` -> `CodexThreadPort.runStreamed()`
- `Thread.id` -> `CodexThreadPort.id`

The rest of the runtime foundation should not need to change.
