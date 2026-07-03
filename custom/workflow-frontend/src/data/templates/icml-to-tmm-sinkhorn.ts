import type { WorkflowEdge } from "@opencode-ai/backend-opencode/schema/types"
import type { NodeToolConstraints, WorkflowArtifact, WorkflowNode, WorkflowTemplate, NodeArchetype, InteractionIntent } from "../console-model"
import { convertBaseTemplate, providerAgentId } from "../template-converters"
import { migrateWorkflowTemplateIntents } from "@opencode-ai/backend-opencode/drawmoon/migrate-template-intents"
import { buildSharedSessions, sessionBindingFromStep } from "../session-utils"
import { WorkflowTemplateBase, type TemplateStep } from "../workflow-template"
import { paperWorkflowCwd } from "../../lib/repo-paths"

const TEMPLATE_ID = "icml-to-tmm-sinkhorn"
const PLAN_SESSION = "icml-tmm-architect"
const CWD = paperWorkflowCwd()

const GPT55_API = "kuaipao-gpt-5-5"
const GPT55_MODEL = "gpt-5.5"
const DEEPSEEK_FLASH_API = "deepseek-deepseek-v4-flash"
const DEEPSEEK_FLASH_MODEL = "deepseek-v4-flash"
const DEEPSEEK_PRO_API = "deepseek-deepseek-v4-pro"
const DEEPSEEK_PRO_MODEL = "deepseek-v4-pro"
const IMAGE_API = "kuaipao-gpt-image-2"
const IMAGE_MODEL = "gpt-image-2"

const HUMANIZER_SKILL = "humanizer"
const DRAW_SKILL = "drawio-grid-figures"

const SECTIONS = [
  { id: "section-intro-related", title: "Introduction & Related Work", icml: "Introduction + Related Work", file: "tmm/sections/01-intro-related.tex", y: 40 },
  { id: "section-methodology", title: "Methodology", icml: "Methodology", file: "tmm/sections/02-methodology.tex", y: 140 },
  { id: "section-theory", title: "Theoretical Framework", icml: "Theoretical Framework", file: "tmm/sections/03-theory.tex", y: 240 },
  { id: "section-experiments", title: "Experiments", icml: "Experiments", file: "tmm/sections/04-experiments.tex", y: 340 },
  { id: "section-conclusion", title: "Conclusion", icml: "Conclusion", file: "tmm/sections/05-conclusion.tex", y: 440 },
] as const

const OUTPUT_PATH_RULE = `**Output path rule (mandatory):** Write each deliverable ONLY to the exact path named in this prompt (tmm/..., reviews/..., tmm/build/...). Never write to the workspace root. Create parent directories if needed.

**Workspace sandbox (mandatory):** Read and write ONLY under the workflow working directory (\`paper/\` tree). Never read C:\\, user home, or paths outside the run workspace. Use relative paths from cwd; do not glob the filesystem root.`

const architectPrompt = `You are the lead architect converting an ICML 2026 submission into an IEEE Transactions on Multimedia (TMM) journal manuscript.

Working directory layout:
- Source: icml2026/example_paper.tex (+ .bib, figures)
- Target tree: paper/tmm/ (IEEEtran class)

Method rewrite (mandatory):
- Replace the original "modal distance" framing with **Sinkhorn iterative InfoNCE**:
  - Row-normalized transport plan P(b|a) from Sinkhorn iterations on a cost matrix
  - Contrastive InfoNCE objective tied to the transport plan (not static OT marginals alone)
  - Explicit baselines: Entropic OT and static Schrödinger Bridge with dual marginal constraints

Deliverables (write files, not chat-only):
1. journal-architecture.md — ICML section → TMM section map, naming, notation deltas, figure list, 10-page budget table
2. tmm/main.tex — IEEEtran skeleton with \\input{} for sections/
3. tmm/sections/*.tex — empty shells with correct \\section titles matching the map
4. tmm/references.bib — copy/adapt from ICML bib
5. method-rewrite-notes.md — bullet plan for Sinkhorn-InfoNCE equations and experiment wording

Read icml2026/example_paper.tex first. Output Markdown plans; do not draft full section prose here.

${OUTPUT_PATH_RULE}`

const sectionPrompt = (title: string, icml: string, outFile: string) => `You are a TMM section writer (isolated session — read plan files from disk, not chat history).

Section: ${title}
ICML source mapping: ${icml}
Output file: ${outFile}

${OUTPUT_PATH_RULE}

Steps:
1. Read journal-architecture.md and method-rewrite-notes.md; read matching ICML sections in icml2026/example_paper.tex
2. Draft LaTeX body into ${outFile} (use \\input-friendly fragments, no \\documentclass)
3. Apply the **humanizer** skill to narrative prose (not equations)
4. For Methodology/Theory: implement Sinkhorn iterative InfoNCE per method-rewrite-notes.md
5. Keep IEEE TMM tone; mark uncertain claims explicitly

Write LaTeX only to the target file; short completion note in chat.`

const layoutAuditPrompt = `Layout auditor: compile the TMM draft (fresh session — not the architect chat).

${OUTPUT_PATH_RULE}

1. Ensure tmm/main.tex includes all section inputs and figures/
2. Run latex build to tmm/build/draft.pdf
3. Write tmm/build/layout-audit.md listing overfull boxes, missing refs, figure placement issues
4. Patch critical LaTeX errors only`

const lengthAuditPrompt = `Length auditor for IEEE TMM (~10 pages main text excluding references).

1. Read tmm/build/draft.pdf (or rebuild if missing)
2. If body exceeds ~10 pages, trim redundancy in tmm/sections/*.tex (prose first, not equations)
3. Write tmm/build/length-audit.md with page count, cuts made, remaining risks
4. Rebuild draft.pdf after edits`

const figurePrompt = (index: number, role: string) => `Figure prompt engineer (#${index}).

Role: ${role}
Use the **${DRAW_SKILL}** skill workflow to produce tmm/figures/prompts/fig${index}-prompt.md:
- Grid-first draw.io / matplotlib SVG tile plan per skill references
- Tie visuals to Sinkhorn-InfoNCE method story (not legacy modal distance)
- Include alt text, color palette, and LaTeX \\includegraphics path targets under tmm/figures/

Do not render raster finals here; only prompt + composition spec.`

const figureRenderPrompt = (index: number) => `Generate publication figure ${index} from tmm/figures/prompts/fig${index}-prompt.md.

Output: tmm/figures/fig${index}.png (and optional .pdf if vector export exists).
No watermarks, no UI chrome, readable axis labels, colorblind-safe palette.`

export const round1MergePrompt = `Round-1 merge and compile.

**Figure inclusion (mandatory — do not skip):**
1. Copy raster renders into the tex tree:
   - \`figure-render-1.png\` (or \`figure-render-1-1.png\`) → \`tmm/figures/fig1.png\`
   - \`figure-render-2.png\` (or \`figure-render-2-1.png\`) → \`tmm/figures/fig2.png\`
2. In \`tmm/sections/02-methodology.tex\`, ensure a \`figure*\` environment with:
   \`\\includegraphics[width=\\linewidth]{fig1.png}\` (method overview from image render).
3. In \`tmm/sections/04-experiments.tex\`, ensure a \`figure*\` environment with:
   \`\\includegraphics[width=\\linewidth]{fig2.png}\` (results teaser from image render).
4. Keep existing vector figures (\`pipeline.pdf\`, \`teaser.pdf\`) only if they do not duplicate the raster figures; prefer the raster PNGs for round-1 review.
5. Verify both PNG files exist on disk before compiling; if missing, stop and report paths checked.

**Merge steps:**
1. Merge section tex, figures, and bibliography into \`tmm/main.tex\`
2. Resolve duplicate labels/refs across sections
3. Build **\`tmm/build/round1.pdf\`** (human review artifact)
4. Write \`tmm/build/round1-merge.md\` with: figures copied (paths), \\includegraphics lines added, page count, missing refs`

const kiroReviewPrompt = `Independent peer review (KIRO). **Fresh isolated session.**

${OUTPUT_PATH_RULE}

Read tmm/build/round1.pdf only (use tmm/main.tex + sections only if PDF missing).
Write reviews/kiro-review.md with sections: Summary, Strengths, Weaknesses, Must-fix (numbered), Nice-to-have, Score 1-10.
Focus on novelty of Sinkhorn-InfoNCE vs OT/SB baselines and multimedia relevance for TMM.`

const deepseekProReviewPrompt = `Independent peer review (DeepSeek Pro). **Fresh isolated session.**

${OUTPUT_PATH_RULE}

Read **only** tmm/build/round1.pdf (manuscript under review). Do not read other reviewers' notes or bulk tex trees.
Write reviews/deepseek-pro-review.md with: Summary, Strengths, Weaknesses, Must-fix (numbered), Nice-to-have, Score 1-10.
Be strict on empirical evidence, ablations, and clarity of transport-contrastive objective.`

const gpt55ReviewPrompt = `Independent meta-review (GPT-5.5). **Fresh isolated session.**

${OUTPUT_PATH_RULE}

Read **only** tmm/build/round1.pdf. Do not read reviews/ or other markdown notes — source manuscript only.
Write reviews/gpt55-review.md with: Summary, Strengths, Weaknesses, Must-fix, Nice-to-have, Score.
Emphasize structure, related work positioning, and reproducibility.`

const reviewIntersectionPrompt = `Review intersection agent — **fresh context** (read files from disk only).

Read:
- reviews/kiro-review.md
- reviews/deepseek-pro-review.md
- reviews/gpt55-review.md

Write reviews/review-intersection.md containing ONLY items that appear as Must-fix (or equivalent severity) in **all three** reviews.
Format:
## Consensus must-fix
1. ...
## Consensus themes (optional)
- ...
## Dropped (single-reviewer only)
- ...

Also write reviews/review-intersection.json as { "mustFix": string[], "themes": string[] }`

const revisionPlanPrompt = `Revision planner — **fresh isolated context** (no upstream chat).

Read from disk:
- journal-architecture.md
- method-rewrite-notes.md
- reviews/review-intersection.md
- tmm/build/round1-merge.md
- tmm/main.tex and section files under tmm/sections/

Write tmm/build/revision-plan.md:
- Numbered edit tasks with target file paths
- Map each task to consensus review items
- Preserve Sinkhorn-InfoNCE method story; do not replan architecture`

const revisionMajorPrompt = `Major revision pass — **fresh context** + **humanizer** skill.

Read tmm/build/revision-plan.md and execute every task once on LaTeX sources.
Apply humanizer to narrative prose (not equations).
Write tmm/build/revision-major-log.md listing task → action taken.
Do not start a second revision round.`

const finalPdfPrompt = `Final PDF build — **fresh isolated context**.

Compile tmm/build/final.pdf from the current tex tree.
Write tmm/build/final-build.md with page count, missing refs, and figure inclusion checklist.
No prose rewriting — build/audit only.`

const humanGatePrompt = `Human review gate — submit for peer review?

Open **tmm/build/round1.pdf** in the artifacts panel (round-1 merged draft).
When Sinkhorn-InfoNCE method rewrite, length, and figures look correct, click **Continue** to submit.
The workflow will run three parallel reviews (KIRO, DeepSeek Pro, GPT-5.5), intersect must-fix items, then one revision pass.`

const draftInquiryPrompt = `Draft clarification — merged manuscript

Review **tmm/build/round1.pdf** and **round1-merge.md** in the artifacts panel.
Reply with any clarifications on method wording, figures, or length; your reply is injected into downstream review and revision context.
If nothing to add, reply "No additions" and continue.`

const humanizerConstraints: NodeToolConstraints = { forcedSkills: [HUMANIZER_SKILL] }
const drawSkillConstraints: NodeToolConstraints = { forcedSkills: [DRAW_SKILL] }

function textStep(
  id: string,
  label: string,
  meaning: string,
  prompt: string,
  mode: TemplateStep["mode"],
  contextMode: TemplateStep["contextMode"],
  sessionPolicy: TemplateStep["sessionPolicy"],
  x: number,
  y: number,
  outputFile: string,
  extra: Partial<TemplateStep> = {},
): TemplateStep {
  return {
    id,
    label,
    meaning,
    provider: "opencode",
    mode,
    contextMode,
    transport: "belt",
    prompt,
    subagentFiles: [],
    cacheFiles: [],
    x,
    y,
    status: "waiting",
    duration: "-",
    maxIterations: mode === "plan" ? 12 : mode === "agent" ? 4 : 8,
    allowFileWrites: true,
    sessionPolicy,
    sessionKey: sessionPolicy === "shared" ? PLAN_SESSION : id,
    promptFile: outputFile,
    ...extra,
  }
}

function kiroReviewStep(id: string, label: string, prompt: string, x: number, y: number, outputFile: string): TemplateStep {
  return {
    id,
    label,
    meaning: "KIRO CLI independent review, fresh session.",
    provider: "kiro",
    mode: "review",
    contextMode: "fresh",
    transport: "belt",
    prompt,
    subagentFiles: [],
    cacheFiles: [],
    customCommand: "kiro-cli",
    customArgs: ["chat", "--no-interactive", "--wrap", "never", "--trust-tools=fs_read,fs_write", "--agent", "kiro_default", "{{prompt}}"],
    x,
    y,
    status: "waiting",
    duration: "-",
    maxIterations: 1,
    allowFileWrites: false,
    sessionPolicy: "fresh",
    sessionKey: id,
    promptFile: outputFile,
  }
}

function imageStep(id: string, label: string, x: number, y: number, prompt: string): TemplateStep {
  return {
    id,
    label,
    meaning: "GPT Image 2 figure render from upstream prompt.",
    provider: "custom",
    mode: "chat",
    contextMode: "fresh",
    transport: "belt",
    prompt,
    subagentFiles: [],
    cacheFiles: [],
    x,
    y,
    status: "waiting",
    duration: "-",
    maxIterations: 1,
    allowFileWrites: false,
    sessionPolicy: "fresh",
    promptFile: `figures/prompts/${id}.md`,
  }
}

const sectionSteps: TemplateStep[] = SECTIONS.map((section, index) => textStep(
  section.id,
  section.title,
  `DeepSeek Flash section writer + humanizer; fresh session reads plan files`,
  sectionPrompt(section.title, section.icml, section.file),
  "build",
  "fresh",
  "fresh",
  360,
  section.y,
  section.file,
  { turnOrder: index + 2 },
))

const steps: TemplateStep[] = [
  textStep("architect-plan", "Architect Plan", "IO planner: TMM skeleton + Sinkhorn-InfoNCE allocation JSON", architectPrompt, "plan", "fresh", "fresh", 120, 240, "journal-architecture.md", { turnOrder: 1 }),
  ...sectionSteps,
  textStep("layout-audit", "Layout Audit", "Build draft PDF + layout audit", layoutAuditPrompt, "build", "artifacts", "fresh", 600, 180, "tmm/build/layout-audit.md"),
  textStep("length-audit", "Length Audit (~10pp)", "Trim to TMM page budget", lengthAuditPrompt, "build", "artifacts", "fresh", 600, 300, "tmm/build/length-audit.md"),
  textStep("figure-prompt-1", "Figure 1 Prompt", "Method overview prompt (drawio skill)", figurePrompt(1, "Sinkhorn-InfoNCE pipeline overview"), "build", "artifacts", "fresh", 600, 420, "tmm/figures/prompts/fig1-prompt.md"),
  textStep("figure-prompt-2", "Figure 2 Prompt", "Experiment teaser prompt (drawio skill)", figurePrompt(2, "Main result / ablation teaser"), "build", "artifacts", "fresh", 600, 520, "tmm/figures/prompts/fig2-prompt.md"),
  imageStep("figure-render-1", "Figure 1 Render", 860, 420, figureRenderPrompt(1)),
  imageStep("figure-render-2", "Figure 2 Render", 860, 520, figureRenderPrompt(2)),
  textStep("round1-merge", "Round 1 Merge", "Merge tex + compile round1.pdf", round1MergePrompt, "build", "artifacts", "fresh", 1080, 300, "tmm/build/round1-merge.md"),
  kiroReviewStep("kiro-review", "KIRO Review", kiroReviewPrompt, 1380, 120, "reviews/kiro-review.md"),
  textStep("deepseek-pro-review", "DeepSeek Pro Review", "OpenCode objective reviewer + DeepSeek Pro", deepseekProReviewPrompt, "review", "fresh", "fresh", 1380, 300, "reviews/deepseek-pro-review.md"),
  textStep("gpt55-review", "GPT-5.5 Review", "OpenCode objective reviewer + GPT-5.5", gpt55ReviewPrompt, "review", "fresh", "fresh", 1380, 480, "reviews/gpt55-review.md"),
  textStep("review-intersection", "Review Intersection", "Consensus must-fix across three reviews", reviewIntersectionPrompt, "agent", "fresh", "fresh", 1620, 300, "reviews/review-intersection.md"),
  textStep("revision-plan", "Revision Plan", "Fresh planner: draft + intersected reviews", revisionPlanPrompt, "plan", "fresh", "fresh", 1860, 180, "tmm/build/revision-plan.md"),
  textStep("revision-major", "Major Revision", "Fresh major pass + humanizer", revisionMajorPrompt, "build", "fresh", "fresh", 1860, 300, "tmm/build/revision-major-log.md"),
  textStep("final-pdf", "Final PDF", "Fresh final PDF build", finalPdfPrompt, "build", "fresh", "fresh", 1860, 420, "tmm/build/final-build.md"),
]

const edges: WorkflowEdge[] = [
  ...SECTIONS.map((section) => ({ from: "architect-plan", to: section.id, contextMode: "artifacts" as const })),
  ...SECTIONS.map((section) => ({ from: section.id, to: "layout-audit", contextMode: "artifacts" as const })),
  { from: "layout-audit", to: "length-audit", contextMode: "artifacts" },
  { from: "length-audit", to: "figure-prompt-1", contextMode: "artifacts" },
  { from: "length-audit", to: "figure-prompt-2", contextMode: "artifacts" },
  { from: "figure-prompt-1", to: "figure-render-1", contextMode: "fresh" },
  { from: "figure-prompt-2", to: "figure-render-2", contextMode: "fresh" },
  { from: "length-audit", to: "round1-merge", contextMode: "artifacts" },
  { from: "figure-render-1", to: "round1-merge", contextMode: "artifacts" },
  { from: "figure-render-2", to: "round1-merge", contextMode: "artifacts" },
  { from: "round1-merge", to: "draft-inquiry", contextMode: "artifacts" },
  { from: "draft-inquiry", to: "submit-review-gate", contextMode: "artifacts" },
  { from: "submit-review-gate", to: "kiro-review", contextMode: "fresh" },
  { from: "submit-review-gate", to: "deepseek-pro-review", contextMode: "fresh" },
  { from: "submit-review-gate", to: "gpt55-review", contextMode: "fresh" },
  { from: "kiro-review", to: "review-intersection", contextMode: "artifacts" },
  { from: "deepseek-pro-review", to: "review-intersection", contextMode: "artifacts" },
  { from: "gpt55-review", to: "review-intersection", contextMode: "artifacts" },
  { from: "review-intersection", to: "revision-plan", contextMode: "fresh" },
  { from: "revision-plan", to: "revision-major", contextMode: "fresh" },
  { from: "revision-major", to: "final-pdf", contextMode: "fresh" },
]

export class IcmlToTmmSinkhornTemplate extends WorkflowTemplateBase {
  constructor() {
    super({
      id: TEMPLATE_ID,
      name: "ICML → TMM (Sinkhorn InfoNCE)",
      description: "Plan → parallel sections → layout/length → dual figures → round1 PDF → human gate → 3 reviews → intersection → one revision.",
      cwd: CWD,
      cacheMode: "off",
      defaultSubagent: {
        provider: "opencode",
        mode: "build",
        contextMode: "fresh",
        maxIterations: 8,
        allowFileWrites: true,
        systemPromptFile: "opencode://workflow-selected",
        contextFiles: [],
      },
      steps,
      edges,
    })
  }
}

export const icmlToTmmSinkhornTemplate = new IcmlToTmmSinkhornTemplate()

function artifact(id: string, label: string, kind: WorkflowArtifact["kind"], relPath: string): WorkflowArtifact {
  return { id, label, kind, path: relPath, href: "" }
}

function opencodeTextNode(
  step: TemplateStep,
  columnId: string,
  laneId: string,
  agentModeTemplateId: string,
  llmApiTemplateId: string,
  model: string,
  toolConstraints?: NodeToolConstraints,
  artifacts: WorkflowArtifact[] = [],
  readRunFiles?: string[],
  contextFiles?: string[],
  cacheFiles?: string[],
  archetype?: NodeArchetype,
): WorkflowNode {
  const arch: NodeArchetype = archetype ?? (step.mode === "plan" ? "planner" : step.id.includes("review") ? "reviewer" : "worker")
  const intent: InteractionIntent = arch === "reviewer" ? "review" : arch === "planner" ? "handoff" : readRunFiles?.length ? "handoff" : step.sessionPolicy === "shared" ? "continue" : "handoff"
  return {
    id: step.id,
    name: step.label,
    kind: step.mode === "plan" ? "plan" : step.id.includes("review") ? "verify" : "agent-mode",
    stageId: `${TEMPLATE_ID}-stage`,
    columnId,
    laneId,
    agentId: providerAgentId.opencode ?? "agent-paper",
    executionMode: "agent-mode",
    modality: "text",
    agentModeTemplateId,
    cliTemplateId: "opencode-cli",
    runtimeMode: step.mode,
    llmApiTemplateId,
    promptTitle: step.label,
    promptPreview: step.prompt,
    outputContract: step.meaning,
    artifacts,
    x: step.x,
    y: step.y,
    state: "waiting",
    session: sessionBindingFromStep(step),
    toolConstraints,
    runtimeOverrides: {
      contextMode: intent === "continue" ? "inherit" : "fresh",
      intent,
      archetype: arch,
      maxIterations: step.maxIterations,
      workingDirectory: CWD,
      model,
      responseFormat: "markdown",
      ...(readRunFiles?.length ? { readRunFiles } : {}),
      ...(contextFiles ? { contextFiles } : {}),
      ...(cacheFiles ? { cacheFiles } : {}),
    },
  }
}

function inquiryNode(): WorkflowNode {
  return {
    id: "draft-inquiry",
    name: "Draft Clarification",
    kind: "condition",
    stageId: `${TEMPLATE_ID}-stage`,
    columnId: `${TEMPLATE_ID}-c-inquiry`,
    laneId: `${TEMPLATE_ID}-l-inquiry`,
    agentId: "agent-editor",
    executionMode: "inquiry",
    promptTitle: "Draft inquiry",
    promptPreview: draftInquiryPrompt,
    outputContract: "User clarification injected before submit review.",
    artifacts: [
      artifact("round1-pdf", "Round 1 Manuscript PDF", "pdf", "tmm/build/round1.pdf"),
      artifact("round1-merge-md", "Round 1 merge notes", "markdown", "tmm/build/round1-merge.md"),
    ],
    x: 1150,
    y: 300,
    state: "waiting",
    runtimeOverrides: { contextMode: "artifacts", intent: "handoff", archetype: "gate" },
  }
}

function humanGateNode(): WorkflowNode {
  return {
    id: "submit-review-gate",
    name: "Human Review — Submit?",
    kind: "condition",
    stageId: `${TEMPLATE_ID}-stage`,
    columnId: `${TEMPLATE_ID}-c-gate`,
    laneId: `${TEMPLATE_ID}-l-gate`,
    agentId: "agent-editor",
    executionMode: "human-gate",
    promptTitle: "Human review gate",
    promptPreview: humanGatePrompt,
    outputContract: "Pause until user continues to submit for peer review.",
    artifacts: [
      artifact("round1-pdf", "Round 1 Manuscript PDF", "pdf", "tmm/build/round1.pdf"),
      artifact("round1-merge-md", "Round 1 merge notes", "markdown", "tmm/build/round1-merge.md"),
    ],
    x: 1230,
    y: 300,
    state: "waiting",
    runtimeOverrides: { contextMode: "artifacts", intent: "handoff", archetype: "gate" },
  }
}

export function buildIcmlToTmmSinkhornUiTemplate(): WorkflowTemplate {
  const base = convertBaseTemplate(icmlToTmmSinkhornTemplate)
  const stageId = `${TEMPLATE_ID}-stage`
  const columns = [
    { id: `${TEMPLATE_ID}-c-plan`, name: "Architect", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-plan`, name: "plan", nodeIds: ["architect-plan"] }] },
    {
      id: `${TEMPLATE_ID}-c-sections`,
      name: "Parallel Sections",
      stageId,
      lanes: SECTIONS.map((section) => ({ id: `${TEMPLATE_ID}-l-${section.id}`, name: section.id, nodeIds: [section.id] })),
    },
    {
      id: `${TEMPLATE_ID}-c-audit`,
      name: "Audit",
      stageId,
      lanes: [
        { id: `${TEMPLATE_ID}-l-layout`, name: "layout", nodeIds: ["layout-audit"] },
        { id: `${TEMPLATE_ID}-l-length`, name: "length", nodeIds: ["length-audit"] },
      ],
    },
    {
      id: `${TEMPLATE_ID}-c-figures`,
      name: "Figures",
      stageId,
      lanes: [
        { id: `${TEMPLATE_ID}-l-fig1`, name: "fig1", nodeIds: ["figure-prompt-1", "figure-render-1"] },
        { id: `${TEMPLATE_ID}-l-fig2`, name: "fig2", nodeIds: ["figure-prompt-2", "figure-render-2"] },
      ],
    },
    { id: `${TEMPLATE_ID}-c-merge`, name: "Round 1", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-merge`, name: "merge", nodeIds: ["round1-merge"] }] },
    { id: `${TEMPLATE_ID}-c-inquiry`, name: "Inquiry", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-inquiry`, name: "inquiry", nodeIds: ["draft-inquiry"] }] },
    { id: `${TEMPLATE_ID}-c-gate`, name: "Human Gate", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-gate`, name: "gate", nodeIds: ["submit-review-gate"] }] },
    {
      id: `${TEMPLATE_ID}-c-reviews`,
      name: "Peer Review",
      stageId,
      lanes: [
        { id: `${TEMPLATE_ID}-l-kiro`, name: "kiro", nodeIds: ["kiro-review"] },
        { id: `${TEMPLATE_ID}-l-ds`, name: "deepseek", nodeIds: ["deepseek-pro-review"] },
        { id: `${TEMPLATE_ID}-l-gpt`, name: "gpt55", nodeIds: ["gpt55-review"] },
      ],
    },
    { id: `${TEMPLATE_ID}-c-intersect`, name: "Intersection", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-intersect`, name: "intersect", nodeIds: ["review-intersection"] }] },
    {
      id: `${TEMPLATE_ID}-c-revise`,
      name: "Revision",
      stageId,
      lanes: [
        { id: `${TEMPLATE_ID}-l-plan`, name: "plan", nodeIds: ["revision-plan"] },
        { id: `${TEMPLATE_ID}-l-major`, name: "major", nodeIds: ["revision-major"] },
        { id: `${TEMPLATE_ID}-l-final`, name: "final", nodeIds: ["final-pdf"] },
      ],
    },
  ]

  const sectionNodes = SECTIONS.map((section, index) => opencodeTextNode(
    sectionSteps[index]!,
    columns[1]!.id,
    columns[1]!.lanes[index]!.id,
    "opencode-paper-section",
    DEEPSEEK_FLASH_API,
    DEEPSEEK_FLASH_MODEL,
    humanizerConstraints,
    [artifact(`${section.id}-tex`, section.file, "latex", section.file)],
    ["journal-architecture.md", "method-rewrite-notes.md"],
  ))

  const nodes: WorkflowNode[] = [
    opencodeTextNode(steps[0]!, columns[0]!.id, columns[0]!.lanes[0]!.id, "custom-io-planner", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, undefined, [
      artifact("journal-architecture", "journal-architecture.md", "markdown", "journal-architecture.md"),
      artifact("method-notes", "method-rewrite-notes.md", "markdown", "method-rewrite-notes.md"),
    ]),
    ...sectionNodes,
    opencodeTextNode(steps[6]!, columns[2]!.id, columns[2]!.lanes[0]!.id, "opencode-paper-compile", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, undefined, [
      artifact("layout-audit", "layout-audit.md", "markdown", "tmm/build/layout-audit.md"),
      artifact("draft-pdf", "draft.pdf", "pdf", "tmm/build/draft.pdf"),
    ]),
    opencodeTextNode(steps[7]!, columns[2]!.id, columns[2]!.lanes[1]!.id, "opencode-paper-compile", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, undefined, [
      artifact("length-audit", "length-audit.md", "markdown", "tmm/build/length-audit.md"),
    ]),
    opencodeTextNode(steps[8]!, columns[3]!.id, columns[3]!.lanes[0]!.id, "opencode-build", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, drawSkillConstraints, [
      artifact("fig1-prompt", "fig1-prompt.md", "markdown", "tmm/figures/prompts/fig1-prompt.md"),
    ]),
    opencodeTextNode(steps[9]!, columns[3]!.id, columns[3]!.lanes[1]!.id, "opencode-build", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, drawSkillConstraints, [
      artifact("fig2-prompt", "fig2-prompt.md", "markdown", "tmm/figures/prompts/fig2-prompt.md"),
    ]),
    {
      id: "figure-render-1",
      name: "Figure 1 Render",
      kind: "llm-step",
      stageId,
      columnId: columns[3]!.id,
      laneId: columns[3]!.lanes[0]!.id,
      agentId: "agent-kuaipao",
      executionMode: "llm-api",
      modality: "image",
      agentModeTemplateId: "direct-api",
      cliTemplateId: "direct-api-cli",
      llmApiTemplateId: IMAGE_API,
      promptTitle: "Figure 1 Render",
      promptPreview: figureRenderPrompt(1),
      outputContract: steps[10]!.meaning,
      artifacts: [artifact("fig1-png", "fig1.png", "image", "tmm/figures/fig1.png")],
      x: steps[10]!.x,
      y: steps[10]!.y,
      state: "waiting",
      session: sessionBindingFromStep(steps[10]!),
      runtimeOverrides: { contextMode: "fresh", workingDirectory: CWD, model: IMAGE_MODEL, responseFormat: "text", readRunFiles: ["tmm/figures/prompts/fig1-prompt.md"] },
    },
    {
      id: "figure-render-2",
      name: "Figure 2 Render",
      kind: "llm-step",
      stageId,
      columnId: columns[3]!.id,
      laneId: columns[3]!.lanes[1]!.id,
      agentId: "agent-kuaipao",
      executionMode: "llm-api",
      modality: "image",
      agentModeTemplateId: "direct-api",
      cliTemplateId: "direct-api-cli",
      llmApiTemplateId: IMAGE_API,
      promptTitle: "Figure 2 Render",
      promptPreview: figureRenderPrompt(2),
      outputContract: steps[11]!.meaning,
      artifacts: [artifact("fig2-png", "fig2.png", "image", "tmm/figures/fig2.png")],
      x: steps[11]!.x,
      y: steps[11]!.y,
      state: "waiting",
      session: sessionBindingFromStep(steps[11]!),
      runtimeOverrides: { contextMode: "fresh", workingDirectory: CWD, model: IMAGE_MODEL, responseFormat: "text", readRunFiles: ["tmm/figures/prompts/fig2-prompt.md"] },
    },
    opencodeTextNode(steps[12]!, columns[4]!.id, columns[4]!.lanes[0]!.id, "opencode-build", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, undefined, [
      artifact("round1-pdf", "round1.pdf", "pdf", "tmm/build/round1.pdf"),
      artifact("round1-merge-md", "round1-merge.md", "markdown", "tmm/build/round1-merge.md"),
    ], [
      "journal-architecture.md",
    ]),
    inquiryNode(),
    humanGateNode(),
    {
      id: "kiro-review",
      name: "KIRO Review",
      kind: "verify",
      stageId,
      columnId: columns[7]!.id,
      laneId: columns[7]!.lanes[0]!.id,
      agentId: "agent-kiro-cli",
      executionMode: "cli",
      cliTemplateId: "kiro-cli",
      agentModeTemplateId: "kiro-cli-review",
      runtimeMode: "review",
      promptTitle: "KIRO Review",
      promptPreview: kiroReviewPrompt,
      outputContract: steps[13]!.meaning,
      artifacts: [artifact("kiro-review", "kiro-review.md", "markdown", "reviews/kiro-review.md")],
      x: steps[13]!.x,
      y: steps[13]!.y,
      state: "waiting",
      session: sessionBindingFromStep(steps[13]!),
      runtimeOverrides: {
        contextMode: "fresh",
        workingDirectory: CWD,
        model: "qwen3-coder-next",
        customCommand: "kiro-cli",
        customArgs: steps[13]!.customArgs,
      },
    },
    opencodeTextNode(steps[14]!, columns[7]!.id, columns[7]!.lanes[1]!.id, "opencode-paper-reviewer", DEEPSEEK_PRO_API, DEEPSEEK_PRO_MODEL, undefined, [
      artifact("ds-review", "deepseek-pro-review.md", "markdown", "reviews/deepseek-pro-review.md"),
    ], undefined, []),
    opencodeTextNode(steps[15]!, columns[7]!.id, columns[7]!.lanes[2]!.id, "opencode-paper-reviewer", GPT55_API, GPT55_MODEL, undefined, [
      artifact("gpt-review", "gpt55-review.md", "markdown", "reviews/gpt55-review.md"),
    ], undefined, []),
    opencodeTextNode(steps[16]!, columns[8]!.id, columns[8]!.lanes[0]!.id, "opencode-paper-planner", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, undefined, [
      artifact("intersection-md", "review-intersection.md", "markdown", "reviews/review-intersection.md"),
      artifact("intersection-json", "review-intersection.json", "json", "reviews/review-intersection.json"),
    ], ["reviews/kiro-review.md", "reviews/deepseek-pro-review.md", "reviews/gpt55-review.md"]),
    opencodeTextNode(steps[17]!, columns[9]!.id, columns[9]!.lanes[0]!.id, "opencode-paper-planner", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, undefined, [
      artifact("revision-plan", "revision-plan.md", "markdown", "tmm/build/revision-plan.md"),
    ], ["journal-architecture.md", "method-rewrite-notes.md", "reviews/review-intersection.md", "tmm/build/round1-merge.md"]),
    opencodeTextNode(steps[18]!, columns[9]!.id, columns[9]!.lanes[1]!.id, "opencode-paper-section", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, humanizerConstraints, [
      artifact("revision-major-log", "revision-major-log.md", "markdown", "tmm/build/revision-major-log.md"),
    ], ["tmm/build/revision-plan.md"]),
    opencodeTextNode(steps[19]!, columns[9]!.id, columns[9]!.lanes[2]!.id, "opencode-paper-compile", DEEPSEEK_FLASH_API, DEEPSEEK_FLASH_MODEL, undefined, [
      artifact("final-pdf", "final.pdf", "pdf", "tmm/build/final.pdf"),
      artifact("final-build", "final-build.md", "markdown", "tmm/build/final-build.md"),
    ], ["tmm/main.tex"]),
  ]

  const uiEdges: WorkflowTemplate["edges"] = edges.map((edge, index) => ({
    id: `${TEMPLATE_ID}-e${index + 1}`,
    from: edge.from,
    to: edge.to,
    kind: edge.from === "architect-plan" && edge.to.startsWith("section-") ? "branch" as const
      : edge.from.startsWith("section-") && edge.to === "layout-audit" ? "merge" as const
        : edge.from === "length-audit" && edge.to.startsWith("figure-") ? "branch" as const
          : edge.from === "submit-review-gate" && edge.to.endsWith("-review") ? "branch" as const
            : ["kiro-review", "deepseek-pro-review", "gpt55-review"].includes(edge.from) && edge.to === "review-intersection" ? "merge" as const
              : "normal" as const,
    color: "rgb(140,197,223)",
    annotation: edge.contextMode,
    contextMode: edge.contextMode,
  }))

  return migrateWorkflowTemplateIntents({
    ...base,
    name: "ICML → TMM (Sinkhorn InfoNCE)",
    description: icmlToTmmSinkhornTemplate.description,
    workingDirectory: CWD,
    defaultAgentModeTemplateId: "custom-io-planner",
    defaultLlmApiTemplateId: DEEPSEEK_FLASH_API,
    agentModeTemplateIds: [
      "custom-io-planner",
      "opencode-paper-section",
      "opencode-paper-compile",
      "opencode-paper-reviewer",
      "opencode-build",
      "kiro-cli-review",
    ],
    llmApiTemplateIds: [GPT55_API, DEEPSEEK_FLASH_API, DEEPSEEK_PRO_API, IMAGE_API],
    stages: [{ id: stageId, name: "ICML → TMM", color: "rgb(140,197,223)", columnIds: columns.map((column) => column.id) }],
    columns,
    nodes,
    edges: uiEdges,
    branchGroups: [
      { id: `${TEMPLATE_ID}-b-sections`, from: "architect-plan", to: SECTIONS.map((section) => section.id) },
      { id: `${TEMPLATE_ID}-b-figures`, from: "length-audit", to: ["figure-prompt-1", "figure-prompt-2"] },
      { id: `${TEMPLATE_ID}-b-reviews`, from: "submit-review-gate", to: ["kiro-review", "deepseek-pro-review", "gpt55-review"] },
    ],
    mergeGroups: [
      { id: `${TEMPLATE_ID}-m-sections`, from: SECTIONS.map((section) => section.id), to: "layout-audit" },
      { id: `${TEMPLATE_ID}-m-round1`, from: ["length-audit", "figure-render-1", "figure-render-2"], to: "round1-merge" },
      { id: `${TEMPLATE_ID}-m-reviews`, from: ["kiro-review", "deepseek-pro-review", "gpt55-review"], to: "review-intersection" },
    ],
    sharedSessions: buildSharedSessions(nodes, { edges: uiEdges, nodes }),
    sessionGroups: {},
  } as unknown as Record<string, unknown>) as WorkflowTemplate
}
