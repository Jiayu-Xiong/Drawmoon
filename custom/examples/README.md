# Workflow Examples

This directory contains runnable workflow examples for the local agent runtime.

## How to Run

### Via API (any example)

```powershell
# Replace "single-node-custom-command.json" with your chosen example
$body = Get-Content "single-node-custom-command.json" -Raw
Invoke-RestMethod -Uri "http://127.0.0.1:3456/workflow/run" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"
```

### Via Frontend

1. Start the runtime and frontend (see [runbook](../docs/runbook.md))
2. Open `http://127.0.0.1:4322/` in a browser
3. Open the Run Log panel
4. Paste the workflow JSON into the editor
5. Click "Run Node"

## Example Index

| Example | Provider | Nodes | Context Mode | Status |
|---------|----------|-------|-------------|--------|
| `single-node-custom-command.json` | custom | 1 | fresh | ✅ Verified |
| `codex-build-node.json` | opencode | 1 | fresh | ⏳ Pending adapter verification |
| `reasonix-plan-build-review.json` | opencode | 3 | fresh → summary → summary | ⏳ Pending adapter verification |
| `fresh-vs-summary-context.json` | opencode | 3 | fresh, summary, fresh | ⏳ Pending adapter verification |
| `fork-two-agents-compare-diff.json` | opencode | 4 | fresh → summary → summary | ⏳ Pending adapter verification |
| `files-aware-cache.json` | opencode | 1 | fresh | ⏳ Pending adapter verification |

## Status Key

- ✅ **Verified**: Has been tested against the running runtime
- ⏳ **Pending**: Requires a working opencode adapter (not yet verified)

## Notes

- All examples use `opencode` as the provider except `single-node-custom-command.json`.
- The `opencode` provider adapter flags (`--non-interactive`, `--prompt-file`, etc.) have not been verified against the actual opencode CLI. Update the adapter in `../../backend/opencode/src/providers/opencode.ts` once the real flags are confirmed.
- Examples with `allowFileWrites: true` may create or modify files in the specified `cwd`.
