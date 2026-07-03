# GitHub upload guide

Checklist for publishing the **workflow product slice** of `xy/` without leaking secrets or personal paths.

中文摘要见文末 **中文摘要** 一节。

## What to publish (recommended product repo)

Publish a repo rooted at `xy/` (or a subtree) containing at least:

| Path | Role |
|------|------|
| `custom/workflow-frontend/` | **Core** — SolidJS UI |
| `backend/opencode/` | Workflow runtime + vendored upstream OpenCode (`vendor/opencode/`) |
| `WORKFLOW_README.md`, `WORKFLOW_README.zh-CN.md` | Top-level docs |
| `GITHUB_UPLOAD.md` | This file |

You may trim unused packages under `backend/opencode/vendor/opencode/packages/` (e.g. `console`, `desktop`) if you only ship the workflow product.

## Do NOT commit

| Item | Reason |
|------|--------|
| `**/node_modules/` | Install via `bun install` |
| `**/dist/` | Build output |
| `backend/opencode/data/` | Local runtime DB, cache, traces |
| `**/*.ndjson` debug logs | May contain prompts |
| `.env`, `.env.local` | Secrets |
| Parent repo `api/` or any `api` key files | Real API keys |
| `opencode.json` with personal plugins | Local config (listed in root `.gitignore`) |
| `~/.drawmoon/` | User registry — never in repo |
| Windows user paths (`D:\...`, usernames) | Use `WORKFLOW_CWD` instead |

## `.gitignore` essentials

Ensure these patterns exist (see `xy/.gitignore` and `backend/opencode/.gitignore`):

```gitignore
node_modules/
dist/
.env
.env.local
backend/opencode/data/
*.ndjson
```

Add repo-specific ignores for any local key directories outside `xy/`.

## Pre-push audit

Run from `xy/`:

```bash
# Personal Windows paths (should return nothing in product paths)
rg "D:\\\\Projs|D:/Projs" custom backend templates --glob "!node_modules"

# Hardcoded API keys (should only hit test fixtures in upstream packages)
rg "sk-[a-zA-Z0-9]{20,}" custom backend templates --glob "!node_modules"

# Deprecated runtime copy
test ! -d custom/local-agent-runtime && echo "OK: no runtime duplicate"
```

Manual checks:

- [ ] `DEEPSEEK_API_KEY` / `KUAIPAO_API_KEY` only referenced via `apiKeyEnv`, not literal values
- [ ] `templates/` JSON contains no secrets
- [ ] `custom/workflow-frontend` resolves backend via `@opencode-ai/backend-opencode` / `backend/opencode`
- [ ] README paths use relative dirs, not machine-specific absolutes

## Suggested repo structure on GitHub

```
your-org/workflow-frontend/    # or workflow-agent
  README.md                      # Link to WORKFLOW_README.md
  custom/workflow-frontend/
  backend/opencode/
    vendor/opencode/             # vendored upstream (optional trim)
  templates/
```

### Option A — Full `xy/` subtree

Push entire `xy/` with a root `README.md` pointing to `WORKFLOW_README.md`.

### Option B — Split repos

- `workflow-frontend` — UI only; depend on published `@opencode-ai/backend-opencode`
- `backend-opencode` — runtime npm package

For Option B, update `workflow-frontend/package.json` `file:` dependency to the published version.

## First-time setup for clones

```bash
cd backend/opencode && bun install && bun run dev -- --port 3456 --data-dir ./data
cd custom/workflow-frontend && bun install && bun run dev
```

Import templates from `templates/` per [templates/README.md](templates/README.md).

## CI suggestions

- `cd backend/opencode && bun test`
- `cd custom/workflow-frontend && bun run build` (if build script exists)
- Optional: `bun run smoke:tool-isolation:config` (config-only, no LLM)

## License & attribution

- Product code: MIT (see package.json files)
- `packages/opencode`: follow upstream OpenCode license
- Do not remove upstream NOTICE files when vendoring

---

## 中文摘要

**应上传**：`custom/workflow-frontend`、`backend/opencode`、`templates`、`packages/opencode`（若使用 opencode 提供方）、文档。

**勿上传**：`node_modules`、`dist`、本地 `data/`、`.env`、父目录 `api/` 密钥文件、个人绝对路径、调试 ndjson。

**推送前**：用 `rg` 搜 `D:\Projs` 和真实 `sk-` 密钥；确认无 `custom/local-agent-runtime` 重复副本。

**克隆后**：两端 `bun install`，启动后端 3456 + 前端 4322，按 `templates/` 顺序导入 JSON。
