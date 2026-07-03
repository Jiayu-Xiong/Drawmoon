# Security Model

This document describes the security considerations for the workflow local agent system.

## Local Command Execution

The runtime executes CLI commands in the specified working directory. This is inherently powerful and potentially dangerous.

### Safeguards

1. **Working directory isolation**: Commands run in the configured `cwd`, not an arbitrary system path
2. **Timeout enforcement**: All commands have a configurable timeout (default: 5 minutes)
3. **Cancellation**: Running commands can be cancelled via `AbortController`
4. **No network exposure**: The runtime binds to localhost by default (port 3456)
5. **File write visibility**: The `allowFileWrites` flag must be explicitly enabled per node

### File Write Permissions

Nodes can write files only when `allowFileWrites` is set to `true`:

```json
{
  "allowFileWrites": true
}
```

Without this flag, any file writes attempted by the agent will fail (providing the provider enforces this restriction).

## Data Storage

The runtime stores data in the configured `dataDir` (default: `./data`):

```
{dataDir}/
  cache/      # Cache entries (SHA-256 keyed JSON files)
  sessions/   # Session state (ULID-keyed JSON files)
  traces/     # Run traces (ULID-keyed JSON files)
```

### Data Sensitivity

- Cache entries contain agent output text, which may include sensitive information
- Session data includes prompts, messages, and results
- Traces contain all run events including full stdout/stderr

### Data Retention

- Cache entries persist until manually cleared
- Session data persists indefinitely
- Trace data persists indefinitely

Consider adding a TTL or cleanup policy for production use.

## API Security

The runtime API is designed for local-only access:

- Binds to `localhost` by default (not `0.0.0.0`)
- No authentication (local network only)
- CORS is enabled (for the frontend dev server)

**Production recommendation**: If exposing the runtime beyond localhost, add:

1. API token authentication
2. HTTPS
3. Rate limiting
4. Request validation

## Permission Model

The current implementation has a binary permission model per node:

- **No file writes**: Safe mode, agent can only read and respond
- **File writes allowed**: Agent can create/modify files in the workspace

Future versions could add:

- **Pattern-based permissions**: Allow writes only to specific directories or file patterns
- **Read-only patterns**: Prevent reading sensitive files (e.g., `.env`, `secrets`)
- **Command confirmation**: Require manual approval for certain commands
- **Diff preview**: Show expected file changes before applying them

## Git Diff Capture

When file changes occur, the runtime captures a git diff automatically (if the working directory is a git repository). This diff is stored in the node output and session state.

Diffs are visible in:
- The run log (as `diff` events)
- The session summary
- The trace record

## Safe Command Configuration

For the `custom` provider, consider these best practices:

1. **Explicit commands**: Use absolute paths or well-known command names
2. **Limited arguments**: Avoid passing user input directly as arguments
3. **Read-only when possible**: Use `--dry-run` or similar flags for dangerous commands
4. **Timeout**: Always set a reasonable timeout

## Environment Variables

The runtime passes the following environment variables to provider processes:

- `AGENT_PROMPT`: The node prompt text
- `AGENT_PROMPT_FILE`: Path to a temp file containing the prompt
- `AGENT_CWD`: Working directory
- `AGENT_MODE`: Agent mode (chat/agent/build/plan/review)
- `AGENT_SESSION_ID`: Session ID (if available)
- `AGENT_UPSTREAM_SUMMARY`: Upstream summary (if inheriting)

These are passed from the parent process environment, so any secrets in the parent environment will be inherited.
