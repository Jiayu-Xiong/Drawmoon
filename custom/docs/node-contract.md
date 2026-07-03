# Node context contract (backend)

Workflow nodes can declare `metadata.archetype` and `metadata.contract` on the graph JSON.

## Prompt vs md (responsibility split)

| Channel | Role | Cached? |
|---------|------|---------|
| **prompt** | Template intent: what to do (stable across runs) | Yes (prefix cache when stable) |
| **md / files** | Concrete content + context for downstream | Read on demand via `workflow-io.read_file` |

- Do **not** repeat task instructions inside md handoff files.
- Downstream default: **reference manifest** (key → path → one-line summary), not full file inline.
- Use `mode: inline` only when a small slice is required; prefer anchor slices (see below).

## When to share session vs read md

- **intra** (inherit / forkFromCheckpoint): downstream continues the same logical thread and does **not** need a separate artifact file. Prompt stays intent-only; no md body in prompt.
- **inter** (reference manifest): downstream declares `contract.inputs` or `readRunFiles` and reads files via MCP.

Rule: if a downstream node does not declare consumption of an artifact, it should use intra session sharing, not md.

## md handoff schema

Optional front-matter lists logical slices:

```yaml
---
keys:
  - key: sectionMap
    anchor: Section plan
  - key: figures
    anchor: Figure plan
---

# Section plan
...

# Figure plan
...
```

Runtime `sliceByAnchor(text, "sectionMap")` resolves via front-matter or heading.

## Restore pipeline (zero extra tokens)

After each node completes:

1. Save raw stdout → `.workflow/raw/<nodeId>.md`
2. If canonical output path missing → try copy misplaced file on disk
3. Else → `restoreFromText` from raw (fenced code blocks / body)
4. Register canonical path on **blackboard** (`.workflow/blackboard.json`)

If a missing output is **consumed by a downstream node**, the run pauses with `needs-repair: <node> missing <path>`. Fix files in the workspace, then `continue` the run. The runtime re-checks files before resuming.

Optional missing outputs (no downstream consumer) log a warning and the run continues.

## Archetypes

| Archetype | IO MCP | Web MCP |
|-----------|--------|---------|
| planner | yes | yes |
| worker | yes | no |
| reviser | yes | no |
| merger | yes | no |
| reviewer | yes | yes |
| media | yes | no |
| gate | no | no |
| finalizer | yes | no |

Node ids like `architect-plan`, `section-*`, `figure-*` infer archetype when omitted.

## Contract example

```json
{
  "metadata": {
    "archetype": "worker",
    "contract": {
      "transport": "inter",
      "inputs": [
        { "key": "arch", "from": "contextpack", "mode": "reference", "required": true }
      ],
      "outputs": [
        { "key": "intro", "path": "iclr2026/sections/01-intro.tex", "criticality": "isolated" }
      ]
    }
  }
}
```

## System MCP

- `workflow-io`, `workflow-web` under `~/.drawmoon/library/mcp/`
- `WORKFLOW_WORKSPACE_ROOT` set per run when spawning OpenCode
