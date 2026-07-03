# Workflow Frontend Next Steps

Purpose: provide the replacement workflow UI without editing upstream opencode frontend packages.

## Current State

Working:

- Standalone Vite/Solid app starts at `http://127.0.0.1:4322/`.
- Production build passes with `bun.cmd run build`.
- The app has pages/components for workflow canvas, node editor, run log, trace viewer, cache inspector, and provider settings.

Known environment note:

- Vite may fail with `spawn EPERM` inside the sandbox because esbuild starts a child process. Run dev/build outside the sandbox when necessary.

## Immediate Next Tasks

1. End-to-end UI click test.

Run:

- runtime at `http://127.0.0.1:3456`
- frontend at `http://127.0.0.1:4322`

Then use the UI to:

- create or select a custom command node
- run it
- see streaming logs
- see final result
- see cache status
- open trace/result details

2. Fix API mismatches.

Compare `src/api.ts` with runtime endpoints in `../../backend/opencode/src/server.ts`.

Runtime currently exposes:

- `GET /providers`
- `POST /nodes/run`
- `POST /workflow/run`
- `GET /sessions`
- `GET /sessions/:id`
- `GET /traces`
- `GET /traces/:id`
- `GET /cache`
- `DELETE /cache`
- `GET /health`

3. Improve node editor defaults.

Default custom provider config should be runnable on Windows:

```json
{
  "provider": "custom",
  "mode": "chat",
  "customCommand": "cmd.exe",
  "customArgs": ["/c", "echo %AGENT_PROMPT%"],
  "contextMode": "fresh"
}
```

4. Add visible connection health.

Show:

- runtime online/offline
- provider availability
- current runtime URL
- last run id
- last trace id

5. Add artifact/diff panels only after node execution is stable.

Do not spend time polishing advanced panels before the basic run loop works.

## Useful Commands

```powershell
bun.cmd install
bun.cmd run dev --host 127.0.0.1 --port 4322
bun.cmd run build
```

## Do Not Edit

- `../../packages/app`
- `../../packages/web`
- `../../packages/ui`
- root workspace config

