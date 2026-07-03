<p align="center">
  <img src="logo.png" alt="Drawmoon" width="180" />
</p>

<h1 align="center">Drawmoon</h1>

<p align="center">
  A frontend-first workflow orchestrator for multi-agent LLM &amp; CLI pipelines,
  built on top of <a href="https://github.com/anomalyco/opencode">OpenCode</a>.
</p>

---

Drawmoon lets you design a graph of agent/LLM/CLI nodes on a visual console and run
it end to end: planners fan out to parallel workers, artifacts hand off between
nodes, human-review gates pause for approval, and independent reviewers converge on
a consensus before a final build. It is provider-agnostic — mix OpenCode agents,
direct LLM API calls (DeepSeek, GPT-5.5, GPT Image), and local CLIs (KIRO, Codex,
Copilot) in a single run.

- **Visual console** — SolidJS UI to build, run, pause, resume, and inspect workflows.
- **Deterministic control flow** — waves, retries, branch/merge, human gates, inquiries.
- **Any provider** — API keys or auto-detected local CLIs, per node.
- **Real artifacts** — Markdown, LaTeX/PDF, and images produced on disk with per-node token accounting.

## Repository layout

```
xy/
  custom/
    workflow-frontend/     # SolidJS console (core product)
    opencode-plugin/       # Optional OpenCode bridge plugin
    docs/                  # Architecture & runbooks
  backend/
    opencode/              # Workflow runtime (HTTP, port 3456)
      vendor/opencode/     # Vendored upstream OpenCode
  templates/               # Importable agent / LLM / workflow JSON
  demos/                   # Real run results (see below)
```

## Quick start

### 1. Backend runtime

```bash
cd backend/opencode
bun install
bun run dev -- --port 3456 --data-dir ./data
```

### 2. Frontend console

```bash
cd custom/workflow-frontend
bun install
bun run dev
```

Open the printed Vite URL (the console proxies `/api` to the backend on port 3456).

### 3. Import a template

Start from [`templates/`](templates/README.md):

| Type | Starter |
|------|---------|
| LLM API | `templates/llm-api/deepseek-v4-flash-starter.json` |
| Agent Mode | `templates/agent-mode/opencode-chat-starter.json` |
| Workflow | `templates/workflow/opencode-deepseek-chat-starter.json` |

Provide credentials via environment variables (e.g. `DEEPSEEK_API_KEY`,
`KUAIPAO_API_KEY`) or a local `api` file. **No keys are committed to this repo.**

Full setup, environment variables, and tests: [WORKFLOW_README.md](WORKFLOW_README.md)
(中文：[WORKFLOW_README.zh-CN.md](WORKFLOW_README.zh-CN.md)).

## Demos

Two complete, unedited runs are checked in under [`demos/`](demos/README.md), each
with its execution template, per-node token usage, execution entities, and the real
output artifacts.

| Demo | Pipeline | Nodes | Total tokens | Output |
|------|----------|:-----:|:------------:|--------|
| [ICLR paper](demos/iclr-audiorwkv/) | Plan → parallel sections + figures → merge/compile → human gate → 4 reviews → revision | 25 | ~6.42M | Camera-ready `final.pdf` + 3 figures |
| [Xuanhuan novel + cover](demos/xuanhuan-novel-4grid/) | Plan → 4 forked chapters → final edit → cover image | 7 | ~0.95M | `final-novel.pdf` + AI cover |

<p align="center">
  <img src="demos/iclr-audiorwkv/outputs/figures/fig1.png" alt="ICLR method figure" width="46%" />
  <img src="demos/xuanhuan-novel-4grid/outputs/cover.png" alt="Novel cover" width="24%" />
</p>

## License

MIT. Vendored upstream OpenCode components retain their respective licenses.
