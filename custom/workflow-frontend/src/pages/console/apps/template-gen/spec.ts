/**
 * Workflow template generation spec — embedded in LLM prompt and docs.
 * Three interaction intents + typed inputs; runtime picks delivery channel by delegate capability.
 */

export const TEMPLATE_NODE_ARCHETYPES = [
  "planner",
  "worker",
  "reviser",
  "merger",
  "reviewer",
  "media",
  "gate",
  "finalizer",
] as const

export const TEMPLATE_INTERACTION_INTENTS = ["continue", "handoff", "review"] as const

export const TEMPLATE_GENERATOR_RULES = `
## Your job
From a user brief, design a complete Drawmoon workflow UI template JSON.
Analyze the brief first — no fixed node caps.

## Output
Return ONLY one JSON object. No markdown fences, no commentary.

## I/O boundary
- No filesystem access. Output JSON only; host validates and writes to ~/.drawmoon/templates/workflows.

## Top-level required fields
id, name, description, workingDirectory, defaultAgentId, defaultAgentModeTemplateId, defaultLlmApiTemplateId,
stages[], columns[], nodes[], edges[], loopEdges[], branchGroups[], mergeGroups[], sharedSessions[], sessionGroups{}

## Interaction intents (pick ONE per node — host maps to runtime transport)

| Intent | When | Edge contextMode | Session | Inputs |
|--------|------|------------------|---------|--------|
| **continue** | Same text conversation, no artifact file needed | inherit | optional shared among text authors only | none |
| **handoff** | Pipeline: downstream reads upstream files (default) | artifacts | fresh | readRunFiles + contract.inputs |
| **review** | Isolated audit (reviewer, PDF/image review) | artifacts or fresh | fresh only | readRunFiles (typed paths only) |

Set runtimeOverrides.intent to "continue" | "handoff" | "review". Default by archetype: reviser→continue, reviewer→review, others→handoff.

## Brief analysis

| Topic | User says… | You do… | Silent default |
|-------|------------|---------|----------------|
| Node count | "3 sections", "5 steps" | Match count | Minimal graph (2–4) |
| Executor | CLI/Agent, API/画图, 人工 | agentModeTemplateId per node | opencode/kiro/codex for CLI; direct-api for API image/text |
| Same conversation | 同一会话/接着聊 | intent continue + shared session (text authors only) | handoff |
| Parallel | 并行/N路 | fork edges, separate lanes | serial |
| Review | 审稿/审核 | intent review, fresh, readRunFiles only | — |

## Per-node fields
id, name, kind, stageId, columnId, laneId, agentId, agentModeTemplateId, llmApiTemplateId (when API),
executionMode, promptTitle, promptPreview, outputContract, x, y, state, runtimeOverrides, artifacts[], session?

### promptPreview vs outputContract
- promptPreview: stable task intent (1–4 sentences). Never paste full documents.
- outputContract: artifact path + format. Content lives in files at runtime.

### runtimeOverrides (always set)
{
  "intent": "continue" | "handoff" | "review",
  "contextMode": "fresh" | "inherit" | "artifacts",
  "maxIterations": 2-12,
  "workingDirectory": ".",
  "archetype": "planner" | "worker" | "reviser" | "merger" | "reviewer" | "media" | "gate" | "finalizer",
  "readRunFiles": ["paper.pdf"],
  "contract": {
    "inputs": [{ "key": "manuscript", "from": "upstream-id:contextpack", "mode": "reference", "required": true }],
    "outputs": [{ "key": "review", "path": "review.md", "criticality": "optional" }]
  }
}

### Typed inputs (host picks delivery: path for CLI, base64 image for vision API)
- Text/markdown: .md .tex .txt — mode reference (default) or inline with slice for small excerpts only
- PDF: .pdf — reference only; reviewer gets path, delegate reads via tools
- Image: .png .jpg .webp — reference; vision API nodes may receive base64 attachment
- Do NOT put file bodies in promptPreview

### artifacts (producing nodes)
[{ "id": "out-1", "label": "review.md", "kind": "markdown", "path": "review.md", "href": "" }]

## Isolation (mandatory errors if violated)
- **review intent**: never shared session or inherit from authors. contextMode fresh or artifacts.
- **reviewer archetype**: same as review intent.
- **image/media nodes**: never inherit from text; handoff via readRunFiles only.
- **continue intent**: only consecutive same-modality text author nodes.

## Topology
Serial default (A→B→C). Parallel only when brief requires — separate lanes, merge with readRunFiles.

## Forbidden
- edge.contextMode "fork"
- Full upstream docs in promptPreview
- readRunFiles paths not produced upstream
- Multiple root nodes
- inherit/shared linking reviewers to authors or image nodes to text authors
`.trim()

export const TEMPLATE_MODIFIER_RULES = `
## Your job
Modify an existing Drawmoon workflow UI template JSON per user instructions.
Return ONLY the complete modified JSON. No markdown fences.

## I/O boundary
- No filesystem access. Host validates and writes via code.

## Modifier principles
- Apply changes precisely; preserve ids/topology/paths unless user asks to restructure.
- Every readRunFiles must match an upstream artifact path.
- Image nodes: modality "image", agentModeTemplateId "direct-api", matching llmApiTemplateId.

## Still required
${TEMPLATE_GENERATOR_RULES}
`.trim()

export function buildTemplateGeneratorPrompt(input: {
  brief: string
  templateId: string
  templateName: string
  agentModeId: string
  llmApiId?: string
}) {
  const id = input.templateId.trim() || input.templateName.trim() || "generated-workflow"
  const name = input.templateName.trim() || id
  return [
    "You are a workflow template generator for the Drawmoon console.",
    TEMPLATE_GENERATOR_RULES,
    "",
    `Use template id: ${id}`,
    `Use template name: ${name}`,
    `Use defaultAgentModeTemplateId: ${input.agentModeId}`,
    input.llmApiId ? `Use defaultLlmApiTemplateId: ${input.llmApiId}` : "",
    "",
    "User brief (analyze constraints below; apply defaults only where silent):",
    input.brief.trim(),
  ].join("\n")
}

export function buildTemplateModifierPrompt(input: {
  instructions: string
  template: Record<string, unknown>
  outputTemplateId?: string
  outputTemplateName?: string
  agentModeId: string
  llmApiId?: string
}) {
  const id = input.outputTemplateId?.trim() || String(input.template.id ?? "workflow")
  const name = input.outputTemplateName?.trim() || String(input.template.name ?? id)
  return [
    "You are a workflow template modifier for the Drawmoon console.",
    TEMPLATE_MODIFIER_RULES,
    "",
    `Keep or set template id: ${id}`,
    `Keep or set template name: ${name}`,
    `Default agentModeTemplateId for nodes that need one: ${input.agentModeId}`,
    input.llmApiId ? `Default llmApiTemplateId for nodes that need one: ${input.llmApiId}` : "",
    "",
    "Modification instructions (apply to the template below):",
    input.instructions.trim(),
    "",
    "Existing template JSON (modify this object in full):",
    JSON.stringify(input.template, null, 2),
  ].join("\n")
}
