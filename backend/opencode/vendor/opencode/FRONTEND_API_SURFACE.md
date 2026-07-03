# Custom Workflow Frontend API Surface

The rewritten frontend should treat these runtime endpoints as the stable contract. Vite proxies `/api/*` to the local runtime on `http://localhost:3456`.

## Runtime Status

- `GET /api/health` checks whether the local runtime is alive.
- `GET /api/providers` returns detected local CLI providers and capabilities.
- `GET /api/cli/info` returns Codex version/model/quota probes, Copilot model/context probes, editor extension detection, and registered commands.
- `GET /api/codex/status` returns Codex CLI status without running an agent prompt.

## Workflow Execution

- `POST /api/nodes/run` streams NDJSON events for one node.
  - Body: `{ config, bypassCache }`
  - Events include `start`, `stdout`, `stderr`, `progress`, `cache`, `artifact`, `diff`, `error`, `complete`.
- `POST /api/workflow/run` streams NDJSON events for the full workflow graph.
  - Body: `{ graph, bypassCache }`
  - Graph: `{ nodes, edges }`

## Custom CLI Commands

- `GET /api/commands` lists all provider command bindings.
- `GET /api/commands?provider=<id>` lists commands for one provider.
- `POST /api/commands/bind` adds a user-defined command binding.
- `POST /api/commands/run` streams command output as NDJSON.
- `POST /api/commands/run-sync` returns a full command result.

## Inspection And Cache

- `GET /api/sessions` and `GET /api/sessions/:id` inspect context/session state.
- `GET /api/traces` and `GET /api/traces/:id` inspect previous run traces.
- `GET /api/cache` lists cache entries.
- `DELETE /api/cache` clears cache entries.

## Frontend Direction

The old opencode UI should not be revived in `custom/workflow-frontend`. Build a separate Solid interface around this contract:

- A blue sky and cloud workspace background from `styles/Layout_Template`.
- Liquid glass surfaces from `styles/(UI)glass_style`.
- Workflow node cards, plus buttons, and flowing edges from `styles/FlowNode`.
- Editing and execution states from `styles/(FLow)workflow_status`.
