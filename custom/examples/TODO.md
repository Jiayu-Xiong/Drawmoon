# Examples Next Steps

Purpose: keep runnable workflow examples for the custom workflow system.

## Current State

Example JSON files already exist:

- `single-node-custom-command.json`
- `codex-build-node.json`
- `reasonix-plan-build-review.json`
- `fresh-vs-summary-context.json`
- `fork-two-agents-compare-diff.json`
- `files-aware-cache.json`

These have not all been validated against the running runtime.

## Immediate Next Tasks

1. Validate `single-node-custom-command.json`.

It should work on Windows with:

```json
"customCommand": "cmd.exe",
"customArgs": ["/c", "echo %AGENT_PROMPT%"]
```

2. Add expected outputs.

For each example, include comments in a companion `.md` file or add a README explaining:

- what should run
- which providers are required
- expected event types
- whether files may be modified

3. Mark provider-specific examples as pending until adapters work.

For now:

- `codex-build-node.json`: pending adapter verification
- `reasonix-plan-build-review.json`: pending adapter verification

4. Add a small smoke runner.

Create a script later that posts example JSON to:

```text
POST http://127.0.0.1:3456/workflow/run
```

or:

```text
POST http://127.0.0.1:3456/nodes/run
```

depending on example shape.

## Do Not Edit

- upstream examples or docs outside `custom/`

