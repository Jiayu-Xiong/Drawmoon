# Custom Workflow Local Agent System

Workflow orchestration on top of OpenCode. **Frontend first:** `workflow-frontend/` is the product core; `backend/opencode/` is the sidecar runtime.

> Full stack guide: [`../WORKFLOW_README.md`](../WORKFLOW_README.md) · 中文 [`../WORKFLOW_README.zh-CN.md`](../WORKFLOW_README.zh-CN.md)  
> Templates: [`../templates/README.md`](../templates/README.md)

## Directory Structure

```
custom/
  workflow-frontend/          # SolidJS UI (core)
  opencode-plugin/          # Thin OpenCode bridge
  examples/                 # Runnable workflow JSON
  docs/                     # Architecture notes
```

Runtime code lives at **`../backend/opencode/`** (Hono HTTP server on port 3456). Upstream OpenCode is vendored at **`../backend/opencode/vendor/opencode/`** (includes `packages/opencode` for the provider adapter).

## Quick Start

### 1. Start the backend

```bash
cd ../backend/opencode
bun install
bun run dev -- --port 3456 --data-dir ./data
```

### 2. Start the frontend

```bash
cd custom/workflow-frontend
bun install
bun run dev
```

### 3. Open the UI

Visit http://localhost:4322

### 4. Load templates

Import JSON from [`../templates/`](../templates/) via Agent Modes / LLM API / Workflows panels.

### 5. Register the plugin (optional)

```json
{
  "plugin": ["@opencode-ai/custom-workflow-plugin"]
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/providers` | List detected providers |
| POST | `/nodes/run` | Execute a single node (SSE stream) |
| POST | `/workflow/run` | Execute a full workflow graph (SSE stream) |
| GET | `/sessions` | List sessions |
| GET | `/sessions/:id` | Get session details |
| GET | `/traces` | List traces |
| GET | `/traces/:id` | Get trace details |
| GET | `/cache` | List cache entries |
| DELETE | `/cache` | Clear all cache |
| GET | `/health` | Health check |

## Development Principles

1. **No upstream edits**: Custom product code stays in `custom/` and `backend/opencode/`.
2. **Sidecar architecture**: Runtime is a separate process, not embedded in the UI.
3. **Provider adapter pattern**: Each CLI agent has an adapter (config → command → events → result).
4. **Cache-first**: Node-level caching with deterministic keys.
5. **Session simulation**: Context inheritance via summary/artifacts.

## Environment

| Variable | Purpose |
|----------|---------|
| `WORKFLOW_CWD` | Default node working directory |
| `WORKFLOW_PAPER_CWD` | Optional cwd for journal-paper demo |
| `DEEPSEEK_API_KEY` | DeepSeek LLM API templates |
