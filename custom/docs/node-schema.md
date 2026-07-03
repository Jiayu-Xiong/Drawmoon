# Node Schema

This document describes the workflow node configuration and output models.

## Node Config

```typescript
interface AgentNodeConfig {
  provider: "opencode" | "codex" | "reasonix" | "copilot" | "custom"
  mode: "chat" | "agent" | "build" | "plan" | "review"
  cwd: string
  prompt: string
  systemPromptFile?: string
  buildPromptFile?: string
  plannerFile?: string
  subagentFiles?: string[]
  contextFiles?: string[]
  cacheFiles?: string[]
  maxIterations?: number
  timeoutMs?: number
  allowFileWrites?: boolean
  contextMode: ContextMode
  customCommand?: string
  customArgs?: string[]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `provider` | Yes | Target agent CLI |
| `mode` | Yes | Execution mode |
| `cwd` | Yes | Working directory |
| `prompt` | Yes | Main instruction text |
| `systemPromptFile` | No | Path to system prompt override |
| `buildPromptFile` | No | Path to build-specific prompt |
| `plannerFile` | No | Path to planner prompt |
| `subagentFiles` | No | Paths to subagent config files |
| `contextFiles` | No | Glob patterns for context files |
| `cacheFiles` | No | Glob patterns for cache-sensitive files |
| `maxIterations` | No | Max iterations (default: 10) |
| `timeoutMs` | No | Timeout in ms (default: 300000) |
| `allowFileWrites` | No | Allow file system writes |
| `contextMode` | Yes | How to inherit upstream context |
| `customCommand` | No | Custom CLI command (for `custom` provider) |
| `customArgs` | No | Custom CLI arguments |

## Node Output

```typescript
interface AgentNodeOutput {
  text: string
  sessionId?: string
  summary?: string
  diff?: string
  artifacts?: Artifact[]
  traceId: string
  cache: CacheInfo
  metadata: RunMetadata
}
```

### Fields

| Field | Description |
|-------|-------------|
| `text` | Full output text |
| `sessionId` | Native session ID (if provider supports resume) |
| `summary` | Truncated summary for downstream inheritance |
| `diff` | Git diff if file changes detected |
| `artifacts` | Collected artifacts (files, references) |
| `traceId` | Unique trace identifier |
| `cache` | Cache hit/miss info |
| `metadata` | Timing, exit code, cancellation status |

## Context Modes

| Mode | Description |
|------|-------------|
| `fresh` | Start a clean agent context |
| `inherit` | Continue the upstream session (when supported) |
| `fork` | Copy upstream context and branch execution |
| `summary` | Pass only the upstream summary text |
| `artifacts` | Pass only explicit outputs (diff, files, JSON) |
