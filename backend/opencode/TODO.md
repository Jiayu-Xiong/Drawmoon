# Local Agent Runtime Next Steps

Purpose: execute workflow nodes by running local CLI agents.

## Current State

Working:

- Hono/Bun server starts with `Bun.serve`.
- Health endpoint works: `GET http://127.0.0.1:3456/health`.
- Provider endpoint works: `GET http://127.0.0.1:3456/providers`.
- `custom` provider can spawn a process and stream stdout.
- `POST /nodes/run` smoke test passed with `cmd.exe /c echo %AGENT_PROMPT%`.
- Cache event is emitted before execution.

Known fixes already made:

- Removed invalid `yield` from stdout/stderr callbacks by using an event queue.
- Added `complete` event in `custom` provider.
- Replaced fake `start()` with real `Bun.serve`.
- Replaced `catalog:` dependencies with concrete versions for standalone installs.

## Immediate Next Tasks

1. Add a scripted smoke test.

Create a script that:

- starts or assumes runtime at `127.0.0.1:3456`
- calls `/health`
- calls `/providers`
- posts a `custom` node
- asserts stdout contains the prompt
- asserts a `complete` event exists

2. Validate cache behavior.

Run the same node twice with `bypassCache: false`.

Expected:

- first run: cache miss
- second run: cache hit or clear explanation why not

3. Validate sessions.

Create a two-node test:

- Node A returns text.
- Node B uses `contextMode: "summary"` or `contextMode: "artifacts"`.
- Confirm upstream summary/artifacts are passed to the second execution.

4. Repair or complete `opencode` provider.

Check actual opencode CLI flags before assuming:

- non-interactive mode
- prompt file support
- build/plan agent selection
- max iterations
- write permissions

If flags do not match, update the adapter and docs. Keep this work inside `backend/opencode`.

5. Add provider adapters later.

After `opencode` works, add:

- `codex`
- `reasonix`
- `copilot`

Each adapter should report capabilities and degrade gracefully when the CLI is missing.

## Useful Commands

```powershell
bun.cmd install
bun.cmd run src/index.ts --port 3456 --data-dir ./data
```

Smoke request shape:

```json
{
  "config": {
    "provider": "custom",
    "mode": "chat",
    "cwd": ".",
    "prompt": "hello from workflow",
    "contextMode": "fresh",
    "customCommand": "cmd.exe",
    "customArgs": ["/c", "echo %AGENT_PROMPT%"],
    "timeoutMs": 10000
  },
  "bypassCache": true
}
```

## Do Not Edit

- `../../packages/opencode`
- `../../packages/core`
- `../../packages/llm`
- `../../packages/sdk`
- root workspace config

