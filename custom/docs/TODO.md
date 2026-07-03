# Custom Docs Next Steps

Purpose: keep design notes accurate as the custom workflow layer becomes real.

## Current State

Architecture docs already exist:

- `architecture.md`
- `node-schema.md`
- `session-model.md`
- `cache-model.md`
- `provider-adapters.md`
- `security.md`

## Immediate Next Tasks

1. Update docs after code validation.

Do not let docs drift from runtime behavior. In particular, confirm:

- exact runtime endpoint names
- actual provider capabilities
- cache hit/miss behavior
- session inheritance behavior
- Windows command examples

2. Add a short runbook.

Create `runbook.md` with:

- install commands
- start commands
- health checks
- smoke test request
- common failures and fixes

3. Document environment limitations.

Mention:

- use `bun.cmd` on PowerShell
- direct `bun` may be blocked by execution policy
- Vite/esbuild may require running outside the sandbox

4. Document real adapter flags only after testing.

Do not claim `opencode`, `codex`, or `reasonix` flags work until they are verified locally.

## Do Not Edit

- `../../packages/docs`
- upstream README files

