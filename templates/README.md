# Templates

Importable JSON starters for the workflow console. The **frontend** (`custom/workflow-frontend`) is the product core; these files show how to register Agent Modes, LLM APIs, and Workflows.

中文说明见 [`README.zh-CN.md`](README.zh-CN.md)。

## Prerequisites

1. Start the backend: `cd backend/opencode && bun install && bun run dev -- --port 3456 --data-dir ./data`
2. Start the frontend: `cd custom/workflow-frontend && bun install && bun run dev`
3. Open http://127.0.0.1:4322

Set `DEEPSEEK_API_KEY` (or your provider key) in the environment before running workflows that call an LLM.

## Directory layout

| Folder | File | Purpose |
|--------|------|---------|
| `agent-mode/` | `opencode-chat-starter.json` | OpenCode chat agent strategy |
| `llm-api/` | `deepseek-v4-flash-starter.json` | DeepSeek v4 flash HTTP binding |
| `workflow/` | `opencode-deepseek-chat-starter.json` | Two-node shared-session chat demo |

Each subfolder has its own README with panel-specific steps.

## Recommended import order

1. **LLM API** → `llm-api/deepseek-v4-flash-starter.json`
2. **Agent Mode** → `agent-mode/opencode-chat-starter.json`
3. **Workflow** → `workflow/opencode-deepseek-chat-starter.json`

The workflow template references template ids `opencode-chat-starter` and `deepseek-v4-flash-starter`. Import those first or the canvas will show missing bindings.

## How to import (UI)

| Template type | Panel | Action |
|---------------|-------|--------|
| Agent Mode | **Agent Modes** | Import JSON / paste file contents |
| LLM API | **LLM API** | Import JSON |
| Workflow | **Workflows** | Import JSON |

After import, open the workflow on the canvas, confirm each node’s **Agent Mode** and **LLM API** bindings, set **Working directory** if needed (`WORKFLOW_CWD` env or edit per node), then run.

## Built-in templates (no import)

The frontend also ships built-in templates (e.g. `opencode-tool-isolation-smoke` for skill/MCP isolation). Use **Workflows → Templates** in the UI. For isolation smoke, install probe entities from **Tools → Install isolation smoke probes** first.

## Advanced

- **Working directory**: defaults to the `xy/` monorepo root at dev time. Override with `WORKFLOW_CWD=/path/to/project`.
- **Persistence**: imported templates are stored under `~/.drawmoon/` via the backend registry API.
- **Examples**: see `custom/examples/` for lower-level runtime JSON (single-node runs).
