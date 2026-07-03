# Provider Adapters

This document describes the provider adapter interface and how to add new providers.

## Interface

```typescript
interface AgentProviderAdapter {
  id: ProviderId
  detect(): Promise<ProviderInfo>
  prepare(input: AgentRunSpec): Promise<PreparedRun>
  execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent>
  parse(events: RunEvent[]): Promise<AgentNodeOutput>
  capabilities: ProviderCapabilities
}
```

## Built-in Providers

### Custom Command (`custom`)

The simplest provider. Executes an arbitrary CLI command and returns its stdout.

- Config: `customCommand` + `customArgs`
- Detection: Always available
- Capabilities: No session resume, no file ops, streaming yes

Use for: running any CLI tool as a workflow node.

### OpenCode (`opencode`)

Runs the opencode CLI agent in non-interactive mode.

- Detection: Checks if `opencode` is in PATH
- Supports: `--non-interactive`, `--agent`, `--build`, `--plan`, `--system-prompt`, `--max-iterations`, `--allow-writes`
- Capabilities: File ops, streaming, cancellation

Use for: most workflow nodes that need opencode's agent capabilities.

## Adding a New Provider

To add a new provider (e.g., Codex, Reasonix, Copilot):

1. Create a new file in `src/providers/` (e.g., `codex.ts`)
2. Implement the `AgentProviderAdapter` interface
3. Register it in `src/providers/index.ts`
4. Add it to the `ProviderId` type in `src/schema/types.ts`

### Example: Minimal Provider

```typescript
import type { AgentProviderAdapter, ProviderInfo, AgentRunSpec, PreparedRun, RunEvent, AgentNodeOutput } from "../schema/types.js"

export const myProvider: AgentProviderAdapter = {
  id: "my-tool",
  capabilities: {
    nonInteractive: true,
    sessionResume: false,
    streaming: true,
    cancellation: true,
    fileOps: false,
    fork: false,
    maxIterations: 1,
    contextModes: ["fresh", "summary"],
    metadata: {},
  },

  async detect(): Promise<ProviderInfo> {
    return {
      id: "my-tool",
      name: "My Tool",
      version: "1.0",
      available: true,
      path: "my-tool",
      capabilities: this.capabilities,
    }
  },

  async prepare(input: AgentRunSpec): Promise<PreparedRun> {
    return {
      command: "my-tool",
      args: ["--prompt", input.config.prompt],
      env: { ...process.env as Record<string, string> },
      cwd: input.config.cwd,
      timeoutMs: input.config.timeoutMs ?? 300_000,
    }
  },

  async *execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent> {
    // Spawn process, yield events
  },

  async parse(events: RunEvent[]): Promise<AgentNodeOutput> {
    // Build output from collected events
  },
}
```

## Provider Detection

The `detect()` method checks whether the provider CLI is available on the system:

- Check PATH for the executable
- Run `--version` to verify it works
- Return availability, version, and path

The frontend displays provider detection results and disables unavailable providers in the UI.

## Capability-Driven Execution

The runtime uses capability flags to determine execution strategy:

- If `streaming` is false, collect all output before yielding events
- If `sessionResume` is false, simulate session continuation via summary/artifacts
- If `cancellation` is false, the process cannot be interrupted mid-execution
