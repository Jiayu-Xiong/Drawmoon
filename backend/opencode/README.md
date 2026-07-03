# backend/opencode

Sidecar HTTP runtime for the workflow frontend. Implements providers, workflow runs, LLM API discovery, Drawmoon registry persistence, and tool-isolation smoke probes.

**Not the product UI** — the frontend lives in `custom/workflow-frontend/`.

## Run

```bash
bun install
bun run dev -- --port 3456
```

Health: `GET http://127.0.0.1:3456/health`

## Vendored OpenCode CLI

Upstream lives at `vendor/opencode/`. The workflow provider spawns:

`bun run --cwd packages/opencode …` from **that monorepo root** (not from `xy/packages/`).

After clone or if CLI fails with `preload not found` / missing `packages/core`:

```bash
cd backend/opencode
bun run install:vendor-opencode
```

This runs `bun install` in `vendor/opencode/` (requires a complete `packages/` tree). Interactive TUI dev still uses `bun run dev` inside `vendor/opencode` with Solid preload; headless workflow runs use a preload-free `packages/opencode/bunfig.toml`.

Restart the runtime after vendor install or provider changes.

## Scripts

| Script | Description |
|--------|-------------|
| `bun test` | Unit tests |
| `bun run install:vendor-opencode` | Install vendored OpenCode workspace deps |
| `bun run install:paper-skills` | Install humanizer + drawio skills to ~/.drawmoon |
| `bun run smoke:tool-isolation` | End-to-end skill/MCP isolation smoke |
| `bun run smoke:tool-isolation:config` | Config validation only |

## Package exports

Consumed by the frontend via `@opencode-ai/backend-opencode`:

- `./schema/types` — shared workflow types
- `./drawmoon/isolation-smoke-probes` — isolation probe constants
- `./llm-api` — LLM client helpers

Vite aliases this package to `src/` during dev; `workflow-frontend/package.json` lists a `file:` dependency.

## Layout

```
src/                      # Workflow runtime (this package)
vendor/opencode/          # Vendored upstream OpenCode monorepo
  packages/opencode/      # OpenCode CLI used by providers/
  README*.md              # Upstream localized docs
scripts/
  tool-isolation-smoke.ts
  mcp-isolation-probe.ts
```

## Data directory

Sessions, workflow runs, cache, and traces live under **`~/.drawmoon/runtime`** (default). Optional `--data-dir` must stay inside `~/.drawmoon/`; repo-local `./data` is rejected.

Templates, library, and registry also sync under `~/.drawmoon/` via API routes.

## Related docs

- [../../WORKFLOW_README.md](../../WORKFLOW_README.md)
- [../../templates/README.md](../../templates/README.md)
- [../../custom/docs/runbook.md](../../custom/docs/runbook.md)
