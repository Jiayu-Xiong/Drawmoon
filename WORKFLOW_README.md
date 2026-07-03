# Workflow Local Agent (xy)

**Frontend-first** workflow orchestration on top of [OpenCode](https://github.com/anomalyco/opencode). The SolidJS console in `custom/workflow-frontend/` is the product core; `backend/opencode/` is the sidecar HTTP runtime.

中文文档：[WORKFLOW_README.zh-CN.md](WORKFLOW_README.zh-CN.md)

## Repository layout

```
xy/
  custom/
    workflow-frontend/     # SolidJS UI (core product)
    opencode-plugin/       # Optional OpenCode bridge plugin
    examples/              # Low-level runtime JSON samples
    docs/                  # Architecture & runbook
  backend/
    opencode/              # Workflow runtime (port 3456) + vendored upstream OpenCode
      vendor/opencode/     # Upstream monorepo (packages/, scripts/, READMEs, …)
  templates/               # Importable agent / LLM / workflow JSON
```

## Quick start

### 1. Backend

```bash
cd backend/opencode
bun install
bun run dev -- --port 3456 --data-dir ./data
```

### 2. Frontend

```bash
cd custom/workflow-frontend
bun install
bun run dev
```

Open http://127.0.0.1:4322 — the UI proxies `/api` to the backend.

### 3. Templates

Import starters from [`templates/`](templates/README.md):

1. LLM API → `templates/llm-api/deepseek-v4-flash-starter.json`
2. Agent Mode → `templates/agent-mode/opencode-chat-starter.json`
3. Workflow → `templates/workflow/opencode-deepseek-chat-starter.json`

Set `DEEPSEEK_API_KEY` before running LLM-backed workflows.

### ICML → TMM (Sinkhorn InfoNCE)

Built-in template id: **`icml-to-tmm-sinkhorn`** (no JSON import). Paper sources live in repo sibling `paper/` (`icml2026/` → `tmm/`).

```bat
set WORKFLOW_PAPER_CWD=C:\path\to\paper
cd backend\opencode && bun run install:paper-skills
```

Flow: GPT-5.5 architect → 5× DeepSeek Flash sections (humanizer) → layout/length audit → 2× figure prompts (drawio skill) + gpt-image-2 → **round1.pdf** → **human gate (submit for review)** → KIRO + DeepSeek Pro + GPT-5.5 reviews → intersection → one revision pass (architect context).

## Environment

| Variable | Purpose |
|----------|---------|
| `WORKFLOW_CWD` | Default working directory for workflow nodes |
| `DEEPSEEK_API_KEY` | DeepSeek API templates |
| `KUAIPAO_API_KEY` | Optional Kuaipao-compatible gateway |

Local registry data: `~/.drawmoon/` (not committed).

## Tests

```bash
cd backend/opencode
bun test
bun run smoke:tool-isolation   # skill/MCP isolation (needs running server + API key)
```

## Publishing to GitHub

See [GITHUB_UPLOAD.md](GITHUB_UPLOAD.md) for what to include, exclude, and verify before push.

## License

MIT — see package licenses. Upstream OpenCode components retain their respective licenses.
