# Runbook

Quick reference for running, testing, and troubleshooting the custom workflow local agent system.

## Install Dependencies

Each `custom/*` package is standalone and needs its own install:

```powershell
# From xy/ monorepo root
cd backend/opencode
bun.cmd install

cd ../../custom/workflow-frontend
bun.cmd install

cd ../opencode-plugin
bun.cmd install
```

## Start Services

### 1. Backend (backend/opencode)

```powershell
# Terminal 1 – from xy/backend/opencode
bun.cmd run src/index.ts --port 3456 --data-dir ./data
```

Expected output:

```
[Agent Runtime] Starting on http://localhost:3456
[Agent Runtime] Data directory: ./data

  🚀 Agent Runtime ready at http://localhost:3456
  📂 Providers: custom, opencode
  💾 Cache mode: input-only
```

### 2. Workflow Frontend

```powershell
# Terminal 2 – from xy/custom/workflow-frontend
bun.cmd run dev --host 127.0.0.1 --port 4322
```

The frontend is now at `http://127.0.0.1:4322/`.

> **Note**: If Vite fails with `spawn EPERM`, run it outside any sandbox. The esbuild binary needs child process permissions.

## Health Checks

### Runtime

```powershell
curl.exe http://127.0.0.1:3456/health
# → {"status":"ok","timestamp":"..."}
```

### Frontend Proxy

```powershell
curl.exe http://127.0.0.1:4322/api/health
# → {"status":"ok","timestamp":"..."}
```

## Smoke Test

Run the automated smoke test:

```powershell
# From xy/backend/opencode (runtime must be running on port 3456)
bun.cmd run smoke:tool-isolation
```

Expected output:

```
🧪 Local Agent Runtime Smoke Test

  ✅ GET /health returns ok
  ✅ GET /providers returns provider list
  ✅ POST /nodes/run with custom provider streams events
  ✅ Cache: second run with same config returns cached result
  ✅ GET /cache returns entries, DELETE /cache clears them
  ✅ GET /sessions returns session list
  ✅ GET /traces returns trace list

📊 Results: 7 passed, 0 failed
```

## Manual Test (PowerShell)

```powershell
$body = @{
  config = @{
    provider = "custom"
    mode = "chat"
    cwd = "."
    prompt = "hello from workflow"
    contextMode = "fresh"
    customCommand = "cmd.exe"
    customArgs = @("/c", "echo %AGENT_PROMPT%")
    timeoutMs = 10000
  }
  bypassCache = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:3456/nodes/run" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"
```

## Common Failures

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `bun: command not found` | Bun not installed or not in PATH | Use `bun.cmd` instead of `bun` |
| `EPERM` on Vite start | esbuild blocked by sandbox | Run outside sandbox |
| `ECONNREFUSED :3456` | Runtime not started | Start runtime first |
| `Cannot find module 'glob'` | Dependencies not installed | Run `bun.cmd install` in `backend/opencode/` |
| `No response body` from API | Runtime URL wrong | Check proxy setting in `vite.config.ts` |
| Cache never hits | `bypassCache: true` set every time | Set `bypassCache: false` |
| Provider shows unavailable | CLI not in PATH | Install the CLI or use `custom` provider |

## Cache Troubleshooting

Check current cache entries:

```powershell
curl.exe http://127.0.0.1:3456/cache
```

Clear all cache:

```powershell
curl.exe -X DELETE http://127.0.0.1:3456/cache
```

## End-to-End UI Flow

1. Start runtime (Terminal 1)
2. Start frontend (Terminal 2)
3. Open `http://127.0.0.1:4322/`
4. Check the nav bar shows green "Runtime online" dot
5. Click "Providers" to see detected providers
6. Click "Canvas" to return
7. Select the default node (it should show "custom" provider)
8. Click "Run" – logs should stream in the Run Log panel
9. Verify: start → cache → stdout → complete events appear
10. Click "Cache" to see the cached entry

## Environment

- **OS**: Windows
- **Runtime**: Bun (use `bun.cmd` in PowerShell)
- **Node**: Bun's built-in Node.js compatibility
- **Project root**: `xy/` (monorepo root for this product)
- **Runtime URL**: `http://127.0.0.1:3456`
- **Frontend URL**: `http://127.0.0.1:4322`
