# Custom Development Handoff

This directory is the write area for the workflow local agent project.

Do not edit upstream opencode source files unless the user explicitly approves a later integration step.

## Current State

Environment:

- Bun is installed globally as `bun.cmd`.
- Use `bun.cmd`, not `bun`, in PowerShell. The `bun.ps1` shim is blocked by the current PowerShell execution policy.
- Root opencode dependencies were installed with `bun.cmd install`.

Running services verified:

- Original opencode web app: `http://localhost:3000/`
- Custom workflow frontend: `http://127.0.0.1:4322/`
- Custom workflow backend: `http://127.0.0.1:3456/health` (`backend/opencode`)

Runtime smoke test verified:

- `POST /nodes/run` works with the `custom` provider.
- A test node ran `cmd.exe /c echo %AGENT_PROMPT%`.
- The runtime streamed `start`, `cache`, `stdout`, and `complete` events.

Frontend build verified:

- `custom/workflow-frontend`: `bun.cmd run build` passes when run outside the sandbox.

## Files Already Adjusted

Only custom files were changed:

- `backend/opencode/package.json`
- `custom/workflow-frontend/package.json`
- `custom/opencode-plugin/package.json`
- `backend/opencode/src/server.ts`
- `backend/opencode/src/providers/custom.ts`
- `backend/opencode/src/providers/opencode.ts`

Why:

- Standalone `custom/*` packages could not resolve root `catalog:` versions, so they now use concrete versions copied from the root catalog.
- The runtime `start()` function only returned `app.fetch`; it now calls `Bun.serve`.
- Provider callbacks used `yield` inside event handlers; they now queue events and yield from the async generator.

## Start Commands

From `xy/` monorepo root:

```powershell
bun.cmd run dev:web
```

From `xy/backend/opencode`:

```powershell
bun.cmd run src/index.ts --port 3456 --data-dir ./data
```

From `xy/custom/workflow-frontend`:

```powershell
bun.cmd run dev --host 127.0.0.1 --port 4322
```

## Next Agent Priority

1. Verify the workflow frontend can actually run a node through `http://127.0.0.1:3456/nodes/run`.
2. Fix UI/runtime API mismatches found during that end-to-end click test.
3. Add or repair a real provider adapter, preferably `opencode`, then `codex` or `reasonix`.
4. Make the examples runnable by the runtime and frontend.
5. Add tests or scripted smoke checks for provider detection, custom node execution, cache hit/miss, and session inheritance.
6. Only after the custom layer works, revisit the opencode plugin bridge.

## Protected Upstream Paths

Treat these as read-only:

- `../packages/opencode`
- `../packages/core`
- `../packages/llm`
- `../packages/plugin`
- `../packages/sdk`
- `../packages/ui`
- `../packages/app`
- `../packages/web`
- root `package.json`
- root `bun.lock`

## Recent Improvements

- **Provider Command Binding System** – new architecture for binding arbitrary CLI commands to providers
  - `GET /commands` – list all bound commands (optionally filtered by `?provider=`)
  - `POST /commands/bind` – bind a new command at runtime (user-defined)
  - `POST /commands/run` – execute a command with streaming output
  - `POST /commands/run-sync` – execute and return full result
- 4 built-in commands for `codex`: version, features, model-config, help-exec (all verified)
- Command Explorer page (`/commands`) in frontend with provider selector, grouped commands, output panel
- Manual command binding via API – users can bind any CLI command to any provider
- GitHub Copilot example documented in the UI (needs `gh` CLI installed)
- Default node config now uses `custom` provider with `cmd.exe` (Windows-friendly)
- Runtime health indicator added to nav bar
- Codex provider adapter with non-token-consuming status endpoint

## Distance To Target

Prototype demo: about 80%.

Usable MVP: about 25%-30% remaining.

Production-quality workflow agent product: still 50%+ remaining.

The core foundation exists and runs. Codex provider adapter is registered, detected, and its status (model/features/sandbox) is queryable without consuming tokens. The `codex exec --json` streaming path is implemented but not yet end-to-end tested.

