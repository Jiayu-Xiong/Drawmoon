# Drawmoon Architecture

This document explains how Drawmoon is put together — the processes, the execution
model, how a run flows through the system, and where data lives. It is meant to be
read top to bottom; for setup and usage see the [README](README.md).

Drawmoon is two cooperating processes plus a private data directory:

- a **console** (a SolidJS single-page app) where you author and watch workflows, and
- a **runtime** (a Bun/Hono HTTP service) that actually executes them.

Everything a run produces — templates, registries, run records, artifacts — lives
under `~/.drawmoon` in your home directory, never in the repository.

## System overview

```
Browser  ──  http://127.0.0.1:4322
   │         Workflow Console (SolidJS + Vite)
   │         calls /api/*  ──▶  Vite dev proxy
   ▼
Runtime  ──  http://127.0.0.1:3456   (Bun + Hono)
   │         scheduling · sessions · provider dispatch · artifacts · IO allocator
   ├──▶  Providers
   │       ├─ CLI subprocesses:  opencode / codex / copilot / kiro / claude
   │       └─ LLM APIs (HTTP):   OpenAI-compatible endpoints, image/audio
   └──▶  ~/.drawmoon/            templates · registry · library · runs · outputs
```

The console never talks to a model directly. It sends intent (start a run, answer a
gate, retry a node) to the runtime over HTTP and streams results back with
Server-Sent Events. The runtime owns all execution and all disk writes.

## Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| **Workflow Console** | `custom/workflow-frontend/` | The product UI: author the graph, launch/pause/resume/retry runs, watch streaming output, inspect artifacts and token usage, manage templates, and configure providers/keys. |
| **Runtime** | `backend/opencode/src/` | Bun + Hono service (port `3456`): the scheduler, session/context handoff, provider adapters, the IO allocator, artifact persistence, and the Drawmoon registry/library API. |
| **OpenCode plugin** | `custom/opencode-plugin/` | Optional bridge that exposes Drawmoon workflow tooling inside an OpenCode session. |
| **Vendored OpenCode** | `backend/opencode/vendor/opencode/` | Upstream OpenCode, vendored read-only so the runtime can spawn its CLI. Keeps its own MIT license; product code never edits it. |
| **Data directory** | `~/.drawmoon/` | All personal state: imported templates, provider registry, capability library, runtime data-dir, run records, and published outputs. |

## The execution model: everything is an Agent Mode

Drawmoon has a single execution abstraction. The runtime never has a special code
path for "an OpenCode agent" versus "a raw API call" versus "a CLI tool" — it only
ever runs an **Agent Mode**, and the mode's `strategyKind` decides how it is driven.

```
node → executionMode → Agent Mode (strategyKind) → provider
                        ├─ "cli"    → an installed CLI (opencode / codex / kiro / copilot / claude)
                        └─ "custom" → a virtual executor
                                      └─ direct-api → the node's LLM API binding (HTTP)
```

A **direct API call** ("直连") is not a bypass — it is the built-in `direct-api`
Agent Mode (`provider: "direct-api"`), a *virtual CLI* whose model and endpoint come
straight from the node's LLM API template. That means a node can be re-pointed from a
local CLI to a hosted API (or the reverse) by swapping its Agent Mode alone, with no
change to the graph, the prompt, or the artifact contract.

### Inheritance

Agent Modes form an inheritance chain. A derived mode names a parent through
`inheritsFromAgentModeId`; at read time the runtime walks the chain from base to leaf
and merges layer by layer (`resolveMergedAgentModeTemplate`):

- non-empty fields on the child win; empty fields inherit from the parent;
- `constraints` (forced/allowed tools, skills, MCP servers) merge key by key;
- `fieldPolicy` marks each field `editable`, `inherited`, or locked, which is what the
  console uses to decide what a workflow author may still override.

For example `custom-io-planner` inherits from `opencode-plan` and only overrides the
system prompt and tool constraints; its tools, retry policy, and iteration limits all
come from the base mode.

## Workflow graph and scheduler

A workflow is a JSON graph of **nodes** wired by **edges**. Nodes are grouped into
visual **stages/columns** (a Kanban layout that has no effect on execution).

The scheduler (`workflow-runs/runner` + `graph-scheduler`) runs the graph in **waves**:
on each wave it selects every node whose upstreams are satisfied and runs them in
parallel, then advances. Fan-out and join are declared explicitly:

- **branch groups** — one node fans out to several parallel workers;
- **merge groups** — several workers join into one downstream node.

Each node carries an **archetype** (`planner`, `worker`, `merger`, `reviewer`,
`gate`, `media`) that drives failure semantics: a hard-failure archetype (e.g. a
planner or gate) fails the whole run, while a soft-failure worker lets sibling
branches continue. Retries exist at two levels — per-node transient retries and
whole-batch retries — and any node can be re-run individually with `retryNode`.

**Human gates** pause a run for approval; **planner inquiries** pause to ask the
operator a question. Both are resumed through the runtime API, and both survive across
process restarts because run state is persisted after every transition.

## Context handoff

Edges (and nodes) declare how much context flows downstream:

- `fresh` — start with a clean context;
- `summary` — receive a compressed summary of the upstream work;
- `artifacts` — read specific declared files from upstream;
- `fork` — branch off a shared session so several nodes share history.

Sessions (`session.ts`, `session-utils`) implement shared/forked histories so, for
example, four chapter workers can each fork the planner's session.

## The IO planner

Multi-node pipelines that must produce a coherent file tree (a paper, a book) use the
special `custom-io-planner` Agent Mode. Its first output block is a JSON **allocation
plan** that the runtime *hard-executes*:

1. the planner emits the plan to `.workflow/allocation-plan.json`;
2. the runtime creates every declared folder before any worker runs;
3. each worker writes a **flat** staging file (no subdirectories);
4. the runtime deterministically **migrates** each flat file to its final `dest` and
   validates that every declared file exists — missing `critical` files trigger a
   repair gate.

This removes path collisions between parallel workers and makes the final layout
predictable no matter what each agent decides to name things.

## Providers

The runtime dispatches each node to a provider adapter under
`backend/opencode/src/providers/`:

- **CLI adapters** (`opencode`, `codex`, `copilot`, `kiro`) translate a node config
  into a command, stream the subprocess events, and normalize the result. Local CLIs
  are **auto-detected** on `PATH`; the console shows their live health and version.
- **HTTP adapters** (`custom`, `openai` + `src/llm-api/`) implement the unified LLM
  client used by `direct-api` and by Agent Modes that resolve their model against an
  LLM API template. Keys are read from environment variables (or a local `api` file)
  via `apiKeyEnv` and are never inlined into templates.

## Data and persistence

Nothing personal lives in the repo. All of it is under `~/.drawmoon/`:

| Path | Contents |
|------|----------|
| `templates/workflows/*.json` | Imported personal workflows (paper, journal, novel, …). |
| `templates/nodes/`, `templates/profiles/` | Node/agent-mode/LLM-API fragments and path-alias profiles. |
| `registry/` | Detected CLI / agent-mode / LLM-API registry overrides. |
| `library/` | Skills, MCP servers, and custom tool definitions. |
| `runtime/` | Backend data-dir: `workflow-runs/` (one JSON record per run) and `cache/`. |
| `workflow/{run-key}/` | A run's isolated working tree: `.workflow/` state + product artifacts. |
| `workflow-output/` | Published outputs, e.g. `runs/{runId}/final.pdf`. |

Each **run record** stores the normalized graph, per-node status/result, artifact
references, and a `TokenUsage` breakdown (input / output / cache-read / cache-write /
total) per node and for the whole run.

## Key data flows

**Template load**

1. the console calls `ensureTemplateBootstrap()` to register built-ins;
2. it hydrates personal templates via `GET /drawmoon/templates/workflows`;
3. imported JSON is registered and workflow entities are rebound to their templates.

**Run execution**

1. the console `POST`s to `/workflow-runs`;
2. `runner.executeRun` schedules waves and runs each node through a provider or the
   direct LLM path;
3. the console subscribes to `/workflow-runs/:id/stream` (SSE) for live output;
4. on `node_started`, the runtime refreshes the relevant CLI so the console's
   provider health stays current.

## Directory map (high level)

```
xy/
├── README.md                     # product landing page
├── arch.md                       # this document
├── LICENSE                       # CC BY-NC 4.0 (+ vendored MIT)
├── templates/                    # importable starter JSON (llm-api / agent-mode / workflow)
├── demos/                        # two complete real runs (templates, usage, outputs)
├── docs/screenshots/             # images used by the README
├── custom/
│   ├── workflow-frontend/        # the console (SolidJS + Vite) — product core
│   └── opencode-plugin/          # optional OpenCode bridge
└── backend/
    └── opencode/
        ├── src/                  # the runtime (scheduler, providers, drawmoon, llm-api)
        └── vendor/opencode/      # vendored upstream OpenCode (read-only)
```

## Design principles

1. **One execution abstraction.** Everything is an Agent Mode; CLIs and direct API
   calls differ only by `strategyKind`.
2. **Frontend-first.** The console is the product; the runtime is a headless sidecar.
3. **No upstream edits.** Vendored OpenCode stays read-only; product code lives in
   `custom/` and `backend/opencode/src/`.
4. **Deterministic control flow.** Waves, explicit branch/merge, and the IO planner
   make runs reproducible regardless of model output.
5. **Nothing personal in the repo.** Keys, templates, and run history live under
   `~/.drawmoon/`.
