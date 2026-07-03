# Architecture

This document describes the architecture of the custom workflow local agent system.

## Overview

```
┌─────────────────────────────────────────────────────┐
│                   Workflow Frontend                  │
│              (SolidJS + Vite, port 4322)              │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Workflow     │  │ Node Editor  │  │ Run Log     │ │
│  │ Canvas       │  │ Panel        │  │ Panel       │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                  │        │
│         └─────────────────┼──────────────────┘        │
│                           │                           │
│                    HTTP/SSE Stream                    │
└───────────────────────────┼───────────────────────────┘
                            │
┌───────────────────────────┼───────────────────────────┐
│              Local Agent Runtime (Hono, port 3456)     │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Runtime      │  │ Session     │  │ Trace       │ │
│  │ Engine       │  │ Manager     │  │ Store       │ │
│  └──────┬───────┘  └──────────────┘  └─────────────┘ │
│         │                                              │
│  ┌──────┴─────────────────────────────────────────┐   │
│  │              Cache System                       │   │
│  │  (off / input-only / files-aware modes)         │   │
│  └──────┬─────────────────────────────────────────┘   │
│         │                                              │
│  ┌──────┴─────────────────────────────────────────┐   │
│  │           Provider Adapters                     │   │
│  │  ┌────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │ Custom │ │ OpenCode │ │ Codex/Reasonix/  │  │   │
│  │  │ CLI    │ │ Adapter  │ │ Copilot (future) │  │   │
│  │  └───┬────┘ └────┬─────┘ └──────────────────┘  │   │
│  └──────┼───────────┼──────────────────────────────┘   │
└─────────┼───────────┼──────────────────────────────────┘
          │           │
          │     ┌─────┴────────┐
          │     │  opencode    │
          │     │  CLI process │
          │     └──────────────┘
          │
     ┌────┴──────┐
     │  Custom    │
     │  CLI       │
     │  (sh, etc) │
     └───────────┘
```

## Layers

### 1. Workflow Frontend (`custom/workflow-frontend/`)

A standalone SolidJS + Vite application. It provides the visual workflow editor, node configuration panel, run log, trace viewer, cache inspector, and provider settings screens.

The frontend communicates with the runtime exclusively through HTTP/SSE streaming. It never calls CLI processes directly.

### 2. Backend OpenCode Runtime (`backend/opencode/`)

A Hono-based HTTP server that owns all agent execution logic:

- **Runtime Engine**: Orchestrates node execution (prepare → execute → parse → cache → trace)
- **Session Manager**: Creates and tracks sessions across workflow nodes
- **Trace Store**: Records all run events for replay and debugging
- **Cache System**: Node-level caching with three modes
- **Provider Adapters**: Translate generic node configs into concrete CLI commands

### 3. OpenCode Plugin Bridge (`custom/opencode-plugin/`)

A thin plugin that registers an opencode command to launch/connect to the workflow frontend. It auto-starts the runtime sidecar when opencode starts. The plugin contains no workflow logic – it delegates everything to the runtime.

### 4. Provider Adapters

Each adapter implements:

```typescript
interface AgentProviderAdapter {
  id: ProviderId
  detect(): Promise<ProviderInfo>
  prepare(input: AgentRunSpec): Promise<PreparedRun>
  execute(run: PreparedRun): AsyncIterable<RunEvent>
  parse(events: RunEvent[]): Promise<AgentNodeOutput>
  capabilities: ProviderCapabilities
}
```

## Data Flow

1. User creates/modifies workflow nodes in the frontend canvas
2. User clicks "Run" → frontend sends node config or full graph to the runtime
3. Runtime checks cache → if miss, resolves session context
4. Runtime calls `provider.prepare()` to build the CLI command
5. Runtime spawns the CLI process and streams stdout/stderr as events
6. Runtime calls `provider.parse()` to build the final result
7. Result is stored in cache and trace; session is updated
8. Events are streamed back to the frontend over SSE
9. If running a workflow, the next node receives the upstream output

## Key Design Decisions

- **Sidecar runtime**: The runtime runs as a separate process, not embedded in opencode. This keeps the custom layer completely independent.
- **Streaming events**: All run output is event-streamed, enabling real-time log display in the frontend.
- **Session simulation**: Since most CLIs don't support native session resume, we simulate continuation by passing upstream summaries/artifacts as system prompt context.
- **Cache-first**: Node-level caching prevents redundant executions. The cache key is deterministic and explainable.
- **No upstream edits**: The entire custom layer lives in `custom/`. No opencode source files are modified.
