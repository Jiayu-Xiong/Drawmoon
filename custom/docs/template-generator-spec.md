# Workflow template generator spec

LLM-facing rules live in `workflow-frontend/src/pages/console/apps/template-gen/spec.ts` (`TEMPLATE_GENERATOR_RULES`).
Zero-token validation: `backend/opencode/src/drawmoon/template-validator.ts` + `POST /drawmoon/templates/workflows/validate`.

## Interaction intents (template-facing)

Templates declare `runtimeOverrides.intent` — one of three semantic intents (host maps to runtime transport):

| Intent | Use when | Maps to |
|--------|----------|---------|
| `continue` | Same text conversation, no artifact file | intra / inherit / shared session |
| `handoff` | Pipeline file delivery (default) | inter / artifacts / readRunFiles |
| `review` | Isolated audit (reviewer, PDF review) | fresh + typed readRunFiles only |

Archetype defaults: reviser→continue, reviewer→review, others→handoff.

## Typed inputs

Declare paths in `readRunFiles` or `contract.inputs`. Host classifies by extension:

- text/markdown (`.md`, `.tex`, …) — reference default; inline only for small slices
- PDF (`.pdf`) — path reference; delegate reads via file tools
- image (`.png`, `.jpg`, …) — path for CLI; base64 attachment for vision API delegates

Runtime delivery: `backend/opencode/src/workflow-runs/context/delivery/` (OOP descriptors + strategies).

## Isolation (validator errors)

- Reviewer / review intent: no inherit or shared session with authors
- Image nodes: no inherit from text; handoff via readRunFiles only

## User input vs generator output

Users provide a **brief** (goal, stages, optional constraints). The generator **analyzes the brief** before designing the graph.

| Decision | Source of truth |
|----------|-----------------|
| Node count | User-stated count/structure if present; else minimal graph for the goal. **No hard upper limit.** |
| CLI vs API vs gate | User says "CLI/Agent", "API/画图", "人工" → match; else **cli** for agent work, **llm-api** for image/audio/API-only, **human-gate** for approval |
| Shared context | User says "同一会话/共享上下文" → intent `continue` + shared session among text authors only; else **handoff** |
| Serial vs parallel | User says "并行/N 路" → parallel lanes; "一步一步/先…再…" → serial; else **serial** chain |
| Node roles | Inferred from stage purpose (`archetype`) |
| Deliverables | `artifacts[]` + `outputContract` + `contract.outputs` |
| Task intent | `promptPreview` only — never full documents |

Explicit user constraints always override defaults.

## prompt vs md (aligns with `node-contract.md`)

- **promptPreview** — what to do (stable, cacheable intent).
- **artifacts / outputContract** — what file this node produces.
- At runtime, content lives in workspace files; downstream reads via delegate tools or typed delivery layer.

## Zero-token validation (before save)

`validateWorkflowUiTemplate` checks structure, isolation errors, and capability warnings for PDF/image inputs.

**Persistence:** LLM outputs JSON only (`allowFileWrites: false`). The frontend/backend validates and **code** writes `~/.drawmoon/templates/workflows/`.

## Runtime mapping

`workflowToRuntimeGraph` copies `runtimeOverrides.archetype`, `runtimeOverrides.intent`, and `runtimeOverrides.contract` into node `metadata` for the context module (`workflow-runs/context/`).
