# OpenCode Plugin Bridge Next Steps

Purpose: provide a thin bridge between opencode and the custom workflow system.

## Current State

The plugin bridge has source and package scaffolding, but it has not been validated end to end.

This should remain thin. Do not move runtime execution logic into the plugin.

## Immediate Next Tasks

1. Delay plugin work until the standalone frontend/runtime loop works.

Before touching the plugin, confirm:

- frontend can run a custom node
- runtime can run a real provider adapter
- trace/cache/session results are visible

2. Read upstream plugin examples.

Reference only:

- `../../packages/plugin/src/example.ts`
- `../../packages/plugin/src/example-workspace.ts`
- `../../packages/plugin/src/index.ts`

3. Validate package dependencies.

This package still references workspace packages:

- `@opencode-ai/plugin`
- `@opencode-ai/sdk`

If standalone install fails, either:

- run it from root workspace context, or
- postpone plugin validation until integration is approved.

4. Minimal bridge target.

The bridge should only:

- detect project root
- know runtime URL
- optionally start/connect to sidecar runtime
- open or announce workflow frontend URL
- pass cwd/session metadata

## Do Not Edit

- `../../packages/plugin`
- `../../packages/opencode`
- `../../packages/app`
- root workspace config unless the user approves integration

