import type { WorkflowEdge } from "@opencode-ai/backend-opencode/schema/types"
import type {
  InteractionIntent,
  NodeArchetype,
  NodeToolConstraints,
  WorkflowArtifact,
  WorkflowNode,
  WorkflowTemplate,
} from "../console-model"
import { convertBaseTemplate, providerAgentId } from "../template-converters"
import { getAgentModeTemplate } from "../template-registry"
import { normalizeTemplateLlmBindings } from "../node-llm-binding"
import { DIRECT_API_MODE_ID } from "../agent-mode-templates/direct-llm-modes"
import { migrateWorkflowTemplateIntents } from "@opencode-ai/backend-opencode/drawmoon/migrate-template-intents"
import { buildSharedSessions, sessionBindingFromStep } from "../session-utils"
import { WorkflowTemplateBase, type TemplateStep } from "../workflow-template"

const TEMPLATE_ID = "audiorwkv-iclr-pyramid"
const WORKSPACE_KEY = "workflow/audiorwkv-iclr"

/** Per-node executor default: agent mode defines allowed APIs/models; optional fields pick this node's default. */
interface NodeBinding {
  agentModeTemplateId: string
  llmApiTemplateId?: string
  cliModelId?: string
  plannerInquiry?: boolean
  inquiryQuestionsFile?: string
  inquiryReplyFile?: string
}

const NODE_BINDINGS: Record<string, NodeBinding> = {
  "architect-plan": {
    agentModeTemplateId: "custom-io-planner",
    llmApiTemplateId: "deepseek-deepseek-v4-pro",
    plannerInquiry: true,
    inquiryQuestionsFile: "arch-clarification-questions.md",
    inquiryReplyFile: "arch-inquiry-reply.md",
  },
  "section-intro": { agentModeTemplateId: "opencode-paper-section", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "section-related-work": { agentModeTemplateId: "opencode-paper-section", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "section-methodology": { agentModeTemplateId: "opencode-paper-section", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "section-experiments": { agentModeTemplateId: "opencode-paper-section", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "section-conclusion": { agentModeTemplateId: "opencode-paper-section", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "body-text": { agentModeTemplateId: "opencode-paper-section", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "layout-audit": { agentModeTemplateId: "opencode-paper-compile", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "length-audit": { agentModeTemplateId: "opencode-paper-compile", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "figure-prompt-1": { agentModeTemplateId: "opencode-build", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "experiment-figure-prompt": { agentModeTemplateId: "opencode-build", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "teaser-figure-prompt": { agentModeTemplateId: "opencode-build", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "figure-render-1": { agentModeTemplateId: "direct-api", llmApiTemplateId: "kuaipao-gpt-image-2" },
  "experiment-figure-render": { agentModeTemplateId: "direct-api", llmApiTemplateId: "kuaipao-gpt-image-2" },
  "teaser-figure-render": { agentModeTemplateId: "direct-api", llmApiTemplateId: "kuaipao-gpt-image-2" },
  "round1-merge": { agentModeTemplateId: "opencode-paper-compile", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "kiro-review-ds": { agentModeTemplateId: "kiro-cli-review", cliModelId: "deepseek-3.2" },
  "kiro-review-mm": { agentModeTemplateId: "kiro-cli-review", cliModelId: "minimax-m2.5" },
  "kiro-review-qwen": { agentModeTemplateId: "kiro-cli-review", cliModelId: "qwen3-coder-next" },
  "deepseek-pro-review": { agentModeTemplateId: "opencode-paper-reviewer", llmApiTemplateId: "deepseek-deepseek-v4-pro" },
  "review-intersection": { agentModeTemplateId: "opencode-paper-planner", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "revision-plan": { agentModeTemplateId: "opencode-paper-planner", llmApiTemplateId: "deepseek-deepseek-v4-pro" },
  "revision-major": { agentModeTemplateId: "opencode-paper-section", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
  "final-pdf": { agentModeTemplateId: "opencode-paper-compile", llmApiTemplateId: "deepseek-deepseek-v4-flash" },
}

const HUMANIZER_SKILL = "humanizer"
const DRAW_SKILL = "drawio-grid-figures"

const SECTIONS = [
  { id: "section-intro", title: "Introduction", prl: "Introduction", file: "iclr2026/sections/01-intro.tex", y: 60 },
  { id: "section-related-work", title: "Related Work", prl: "Related Work", file: "iclr2026/sections/02-related-work.tex", y: 140 },
  { id: "section-methodology", title: "Methodology", prl: "Method / Methodology", file: "iclr2026/sections/03-methodology.tex", y: 220 },
  { id: "section-experiments", title: "Experiments", prl: "Results / Experiments", file: "iclr2026/sections/04-experiments.tex", y: 300 },
  { id: "section-conclusion", title: "Conclusion", prl: "Conclusion + Discussion", file: "iclr2026/sections/05-conclusion.tex", y: 380 },
] as const

const FIGURES = [
  { promptId: "figure-prompt-1", renderId: "figure-render-1", index: 1, promptTitle: "方法图 Prompt", renderTitle: "方法图 Render", role: "AudioRWKV pipeline overview", y: 500, lane: "method" },
  { promptId: "experiment-figure-prompt", renderId: "experiment-figure-render", index: 2, promptTitle: "实验图 Prompt", renderTitle: "实验图 Render", role: "Main result and ablation figure", y: 580, lane: "experiment" },
  { promptId: "teaser-figure-prompt", renderId: "teaser-figure-render", index: 3, promptTitle: "Teaser Prompt", renderTitle: "Teaser Render", role: "Paper teaser / graphical abstract", y: 660, lane: "teaser" },
] as const

const FIGURE_PROMPT_IDS = FIGURES.map((f) => f.promptId)
const FIGURE_RENDER_IDS = FIGURES.map((f) => f.renderId)
const FIGURE_PNG_PATHS = FIGURES.map((f) => `iclr2026/figures/fig${f.index}.png`)

const LATEX_FIGURE_WIRING_RULE = `**LaTeX figure wiring (all three PNGs — mandatory for every PDF compile):**
journal-architecture.md must define a **Figure LaTeX map** (planner-owned). Default placement unless overridden:
| File | Section tex | Float label | Typical width |
| fig1.png | iclr2026/sections/03-methodology.tex | \\label{fig:method} | 0.95\\linewidth |
| fig2.png | iclr2026/sections/04-experiments.tex | \\label{fig:results} | \\linewidth |
| fig3.png | iclr2026/sections/01-intro.tex | \\label{fig:teaser} | 0.85\\linewidth |

For each PNG that exists under iclr2026/figures/, insert a proper float in the mapped section:
\\begin{figure}[t]
  \\centering
  \\includegraphics[width=<width>]{figures/figN.png}
  \\caption{<caption from journal-architecture or fig summary>}
  \\label{fig:...}
\\end{figure}
Use paths relative to iclr2026/main.tex. Cross-ref with \\ref{fig:method}, \\ref{fig:results}, \\ref{fig:teaser} where the outline calls for it.
After every latex_build, run **pdf_audit** and confirm all three figures render in the PDF (not just listed in tex).`

const SANDBOX_RULE = `**Workspace sandbox (mandatory):** Read and write ONLY inside the run workspace (workflow save directory) and mounted inputs (\`audiorwkv/\` read-only source tree). Never read C:\\\\, user home, or any path outside these roots. Use relative paths from cwd; do not glob the filesystem root.`

const OUTPUT_PATH_RULE = `**Output path rule (mandatory):** Write each deliverable ONLY to the exact path named in this prompt (\`iclr2026/...\`, \`reviews/...\`). Never write to the workspace root except flat planner staging files required by the IO manifest. Create parent directories if needed.

${SANDBOX_RULE}`

const architectPrompt = `You are the lead architect converting the AudioRWKV PRL manuscript into an ICLR 2026 submission (IO Collaboration Planner with built-in author inquiry).

**Built-in inquiry (two phases on this node):**
1. **Phase 1** — Read audiorwkv/PRL/cas-dc-template.tex; use **workflow-web** MCP to skim official **ICLR 2026** author guidelines (page/section limits, template URL) so questions reflect real constraints. Write **arch-clarification-questions.md** with EXACTLY this structure and NOTHING more:
   - **## Clarification questions** — EXACTLY 3 numbered questions (never more), each one sentence ending with \`?\`, no bullet sub-questions. Pick only the 3 highest-impact unknowns that block the paper architecture.
   - **## Architecture for confirmation** — ONE concise proposed paper architecture (PRL→ICLR section map + figure plan) written as a short bulleted proposal, ending with a single yes/no confirmation question (\`Confirm this architecture, or state changes?\`).
   - **## Execution summary** — ≤6 lines.
   Do NOT exceed 3 clarification questions under any circumstance. Stop without IO JSON, venue-requirements.md, or iclr2026/ files. The workflow pauses for the author to reply.
2. **Phase 2** — After author reply (in arch-inquiry-reply.md), only when the workflow resumes with an authorized UI reply:
   - Use **workflow-web** MCP to fetch official **ICLR 2026** author guidelines. Write **venue-requirements.md** (planner-owned) with URLs and constraints.
   - Download the official LaTeX kit from GitHub (ICLR/Master-Template, \`iclr2026/\` folder) via \`webfetch\` and save under \`iclr2026/\` without modifying .sty files:
     - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/iclr2026_conference.sty
     - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/iclr2026_conference.bst
     - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/natbib.sty
     - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/fancyhdr.sty
     - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/math_commands.tex
     - (reference shell) https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/iclr2026_conference.tex
   - Build \`iclr2026/main.tex\` with \\usepackage[submission]{iclr2026_conference}; reference the kit in journal-architecture.md.
   - Emit the IO allocation JSON manifest and planner-owned architecture artifacts below.

Source (read-only mount):
- audiorwkv/PRL/cas-dc-template.tex (+ figures, bib as needed)

Target tree (write under run workspace):
- iclr2026/ (ICLR style skeleton; section bodies come from downstream workers via flat→dest migration)

ICLR section structure (mandatory — exactly five section writers, no extra chapters):
1. Introduction → flat \`section-intro.md\` → dest \`iclr2026/sections/01-intro.tex\` — producer: section-intro
2. Related Work → \`section-related-work.md\` → \`iclr2026/sections/02-related-work.tex\` — producer: section-related-work
3. Methodology → \`section-methodology.md\` → \`iclr2026/sections/03-methodology.tex\` — producer: section-methodology
4. Experiments → \`section-experiments.md\` → \`iclr2026/sections/04-experiments.tex\` — producer: section-experiments
5. Conclusion → \`section-conclusion.md\` → \`iclr2026/sections/05-conclusion.tex\` — producer: section-conclusion

Do NOT create a standalone Pyramid / pyramid-framing section. Fold any PRL pyramid narrative into the five sections above per journal-architecture.md.

**Planner ownership (critical):** Do **not** write prose or section bodies under \`iclr2026/sections/*.tex\` — those paths are owned by section-* workers (flat staging + runtime migration). You may create \`iclr2026/main.tex\`, \`iclr2026/references.bib\`, and markdown plans only where producer is architect-plan.

Your FIRST output block must be the IO allocation JSON manifest. Example shape (producer ids must match exactly):
\`\`\`json
{
  "writeRoot": ".",
  "folders": ["iclr2026/sections"],
  "files": [
    { "flat": "section-intro.md", "dest": "iclr2026/sections/01-intro.tex", "producer": "section-intro", "criticality": "critical" },
    { "flat": "section-related-work.md", "dest": "iclr2026/sections/02-related-work.tex", "producer": "section-related-work", "criticality": "critical" },
    { "flat": "section-methodology.md", "dest": "iclr2026/sections/03-methodology.tex", "producer": "section-methodology", "criticality": "critical" },
    { "flat": "section-experiments.md", "dest": "iclr2026/sections/04-experiments.tex", "producer": "section-experiments", "criticality": "critical" },
    { "flat": "section-conclusion.md", "dest": "iclr2026/sections/05-conclusion.tex", "producer": "section-conclusion", "criticality": "critical" }
  ]
}
\`\`\`
Never use producer names like "architect" or "planner" — only the five section node ids above plus planner-owned files (venue-requirements.md, journal-architecture.md, method-rewrite-notes.md, iclr2026/main.tex, iclr2026/references.bib) with producer "architect-plan".

Then produce planner-owned artifacts:
1. venue-requirements.md — ICLR 2026 official constraints from workflow-web research
2. journal-architecture.md — **full paper architecture**: PRL → ICLR section map, **per-section outline** (5–15 bullet targets per section writer), notation table, **Figure LaTeX map** (fig1–fig3 → target section file, caption stub, width, \\label), page budget
3. iclr2026/figures/fig1-summary.md — **method figure brief** (planner-owned): panel layout, key elements, labels, color notes; figure-prompt-1 expands this into draw.io spec
4. iclr2026/figures/fig2-summary.md — **experiment figure brief** (planner-owned): main result / ablation layout; experiment-figure-prompt expands this
5. iclr2026/figures/fig3-summary.md — **teaser figure brief** (planner-owned): one-panel graphical abstract / highlight reel; teaser-figure-prompt expands this
6. iclr2026/main.tex — ICLR skeleton with \\input{} for the five section paths (no section prose)
7. iclr2026/references.bib — adapted from PRL sources
8. method-rewrite-notes.md — AudioRWKV framing notes for downstream writers

Do **not** write iclr2026/figures/prompts/*.md or raster PNGs — those belong to figure-prompt / figure-render nodes.

Read audiorwkv/PRL/cas-dc-template.tex first. Do not draft full section prose on this node.

${OUTPUT_PATH_RULE}`

const humanGatePrompt = `Human review gate — submit for peer review?

Open **iclr2026/build/round1.pdf** in the artifacts panel (round-1 merged draft).
When method wording, figures, and length look correct, click **Continue** to submit.
The workflow will run four parallel reviews (3× KIRO CLI + DeepSeek V4 Pro), intersect must-fix items, then one revision pass.`

const flatStagingName = (sectionId: string) => `${sectionId}.md`

const sectionPrompt = (title: string, prl: string, sectionId: string, destFile: string) => `You are a section writer (isolated session — read plan files from disk, not chat history).

Section: ${title}
PRL source mapping: ${prl}
Flat staging file (write HERE): ${flatStagingName(sectionId)}
Runtime migrates to: ${destFile}

${OUTPUT_PATH_RULE}

Steps:
1. Read journal-architecture.md, venue-requirements.md, and method-rewrite-notes.md; read matching PRL content under audiorwkv/PRL/
2. Draft LaTeX body into **${flatStagingName(sectionId)}** at workspace root only (\\input-friendly fragments, no \\documentclass). Do NOT write directly to ${destFile}.
3. Apply the **humanizer** skill to narrative prose (not equations)
4. Keep venue tone from venue-requirements.md; mark uncertain claims explicitly

Write LaTeX only to the flat staging file; short completion note in chat.`

const bodyTextPrompt = `正文整合 — merge gate after all five section writers (fresh session).

${OUTPUT_PATH_RULE}

1. Read all five flat staging files (section-intro.md … section-conclusion.md) plus journal-architecture.md and venue-requirements.md
2. Verify terminology, notation, and cross-section references are consistent (no contradictory claims between sections)
3. Write **iclr2026/build/body-text-check.md** with per-section pass/fail and any blocking issues
4. Only patch a section flat file when fixing a **critical** inconsistency; log each edit in body-text-check.md

Do not rewrite prose for style — that belongs to section writers and humanizer.`

const layoutAuditPrompt = `Layout auditor: compile and audit **round-1 PDF with all figures** (fresh session).

${OUTPUT_PATH_RULE}

${LATEX_FIGURE_WIRING_RULE}

1. Read iclr2026/build/round1.pdf (produced by round1-merge). If missing, read iclr2026/main.tex + sections and verify all three \\includegraphics blocks exist, then **latex_build** → iclr2026/build/round1.pdf
2. Run **pdf_audit** on round1.pdf: overfull boxes, float placement, figure captions readable, no missing figure files
3. Write iclr2026/build/layout-audit.md — per-figure status (fig1–fig3 visible in PDF?), overfull list, float issues
4. Patch only critical LaTeX float/sizing errors in section tex, rebuild round1.pdf

Do not compile a text-only draft that omits figures — all three PNGs must appear in the audited PDF.`

const lengthAuditPrompt = `Length auditor for ICLR main text (~8–9 pages excluding references).

${LATEX_FIGURE_WIRING_RULE}

1. Read iclr2026/build/round1.pdf (must include fig1–fig3 in layout — rebuild via latex_build if figures missing from PDF)
2. If body exceeds budget, trim redundancy in iclr2026/sections/*.tex (prose first, not equations); preserve figure floats
3. Write iclr2026/build/length-audit.md with page count, cuts made, figure page share, remaining risks
4. Rebuild round1.pdf after edits using latex_build + pdf_audit`

const figurePrompt = (index: number, role: string) => `Figure prompt engineer (#${index}).

Role: ${role}
**Mandatory inputs (read from disk):** iclr2026/figures/fig${index}-summary.md (planner figure brief), journal-architecture.md, method-rewrite-notes.md.

Expand the planner brief into iclr2026/figures/prompts/fig${index}-prompt.md using the **${DRAW_SKILL}** skill:
- Grid-first draw.io / matplotlib SVG tile plan per skill references
- Preserve planner panel layout and labels; tie visuals to AudioRWKV method story
- Include alt text, color palette, target section file + \\label from journal-architecture **Figure LaTeX map**, and \\includegraphics path figures/fig${index}.png

Do not render raster finals here; only prompt + composition spec.`

const figureRenderPrompt = (index: number) => `Generate publication figure ${index} for ICLR.

The figure specification is prepended to this message by the workflow runner (pure API I/O — no filesystem access).
Produce a single publication-quality image: no watermarks, readable labels, colorblind-safe palette.`

export const round1MergePrompt = `Round-1 merge: wire **all section tex + all three figure PNGs** into LaTeX, then compile.

${LATEX_FIGURE_WIRING_RULE}

**Inputs (read from disk):**
- iclr2026/build/body-text-check.md (sections consistent)
- ${FIGURE_PNG_PATHS.join(", ")} (skip wiring only if a PNG is genuinely missing — report path)
- iclr2026/sections/*.tex, iclr2026/main.tex, iclr2026/references.bib

**Merge steps:**
1. Ensure section bodies are \\input{} from main.tex
2. Insert \\begin{figure}…\\includegraphics…\\end{figure} for fig1, fig2, fig3 per Figure LaTeX map
3. Resolve duplicate labels/refs across sections
4. **latex_build** → iclr2026/build/round1.pdf; **pdf_audit** — checklist must show all three figures in PDF
5. Write iclr2026/build/round1-merge.md: figure→section map, \\label list, page count, pdf_audit figure checklist`

const kiroReviewPrompt = (reviewPath: string, modelLabel: string) => `Independent peer review (KIRO CLI / ${modelLabel}). **Fresh isolated session — file handoff only.**

${OUTPUT_PATH_RULE}

Read iclr2026/build/round1.pdf only (use iclr2026/main.tex + sections only if PDF missing).
Write ${reviewPath} with sections: Summary, Strengths, Weaknesses, Must-fix (numbered), Nice-to-have, Score 1-10.
Focus on AudioRWKV novelty, empirical evidence, and clarity. Do not read other reviewers' notes.`

const deepseekProReviewPrompt = `Independent peer review (DeepSeek V4 Pro). **Fresh isolated session — file handoff only.**

${OUTPUT_PATH_RULE}

Read **only** iclr2026/build/round1.pdf (manuscript under review). Do not read other reviewers' notes or bulk tex trees.
Write reviews/deepseek-pro-review.md with: Summary, Strengths, Weaknesses, Must-fix (numbered), Nice-to-have, Score 1-10.
Be strict on empirical evidence, ablations, and reproducibility.`

const reviewIntersectionPrompt = `Review intersection agent — **fresh context** (read files from disk only).

Read:
- reviews/kiro-deepseek-review.md
- reviews/kiro-minimax-review.md
- reviews/kiro-qwen-review.md
- reviews/deepseek-pro-review.md

Write reviews/review-intersection.md containing ONLY items that appear as Must-fix (or equivalent severity) in **at least two** of the four reviews.
Format:
## Consensus must-fix
1. ...
## Consensus themes (optional)
- ...
## Dropped (single-reviewer only)
- ...

Also write reviews/review-intersection.json as { "mustFix": string[], "themes": string[] }`

const revisionPlanPrompt = `Revision planner — **fresh isolated context** (same constraints as section writers).

${OUTPUT_PATH_RULE}

Read from disk:
- journal-architecture.md
- method-rewrite-notes.md
- reviews/review-intersection.md
- iclr2026/build/round1-merge.md
- iclr2026/main.tex and section files under iclr2026/sections/

Write iclr2026/build/revision-plan.md:
- Numbered edit tasks with target file paths
- Map each task to consensus review items
- Do not replan architecture; prepare executable LaTeX edits for the major revision pass`

const revisionMajorPrompt = `Major revision pass — **fresh context** + **humanizer** skill (same writer role as section nodes).

${OUTPUT_PATH_RULE}

Read iclr2026/build/revision-plan.md and execute every task once on LaTeX sources under iclr2026/.
Apply humanizer to narrative prose (not equations).
Write iclr2026/build/revision-major-log.md listing task → action taken.
Do not start a second revision round.`

const finalPdfPrompt = `Final PDF build — **fresh isolated context**.

${OUTPUT_PATH_RULE}

${LATEX_FIGURE_WIRING_RULE}

Compile iclr2026/build/final.pdf from the current tex tree (all three figure floats must remain).
Write iclr2026/build/final-build.md with page count, missing refs, and **per-figure PDF checklist** (fig1–fig3 visible via pdf_audit).
No prose rewriting — build/audit only.`


const humanizerConstraints: NodeToolConstraints = { forcedSkills: [HUMANIZER_SKILL] }
const drawSkillConstraints: NodeToolConstraints = { forcedSkills: [DRAW_SKILL] }
const compileToolConstraints: NodeToolConstraints = { forcedTools: ["latex_build", "pdf_audit", "shell_metadata"] }

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
    sessionKey: id,
    promptFile: outputFile,
    ...extra,
  }
}

function kiroReviewStep(
  id: string,
  label: string,
  prompt: string,
  x: number,
  y: number,
  outputFile: string,
  kiroAgent = "kiro_default",
): TemplateStep {
  return {
    id,
    label,
    meaning: `KIRO CLI independent review (${kiroAgent}), fresh session.`,
    provider: "kiro",
    mode: "review",
    contextMode: "fresh",
    transport: "belt",
    prompt,
    subagentFiles: [],
    cacheFiles: [],
    customCommand: "kiro-cli",
    customArgs: ["chat", "--no-interactive", "--wrap", "never", "--trust-tools=fs_read,fs_write", "--agent", kiroAgent, "{{prompt}}"],
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

function imageStep(id: string, label: string, x: number, y: number, prompt: string, promptRelPath: string): TemplateStep {
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
    sessionKey: id,
    promptFile: promptRelPath,
  }
}

const sectionSteps: TemplateStep[] = SECTIONS.map((section, index) => textStep(
  section.id,
  section.title,
  "DeepSeek V4 section writer + humanizer; fresh session reads plan files",
  sectionPrompt(section.title, section.prl, section.id, section.file),
  "build",
  "fresh",
  "fresh",
  480,
  section.y,
  section.file,
  { turnOrder: index + 3 },
))

const steps: TemplateStep[] = [
  textStep("architect-plan", "Architect Plan", "IO planner with built-in author inquiry", architectPrompt, "plan", "fresh", "fresh", 120, 240, "journal-architecture.md", { turnOrder: 1 }),
  ...sectionSteps,
  textStep("body-text", "正文整合", "Cross-section consistency check after parallel sections", bodyTextPrompt, "build", "artifacts", "fresh", 600, 420, "iclr2026/build/body-text-check.md"),
  ...FIGURES.flatMap((fig) => [
    textStep(fig.promptId, fig.promptTitle, `Figure #${fig.index} prompt (drawio skill)`, figurePrompt(fig.index, fig.role), "build", "artifacts", "fresh", 480, fig.y, `iclr2026/figures/prompts/fig${fig.index}-prompt.md`),
    imageStep(fig.renderId, fig.renderTitle, 660, fig.y, figureRenderPrompt(fig.index), `iclr2026/figures/prompts/fig${fig.index}-prompt.md`),
  ]),
  textStep("layout-audit", "Layout Audit", "Build draft PDF + layout audit", layoutAuditPrompt, "build", "artifacts", "fresh", 840, 240, "iclr2026/build/layout-audit.md"),
  textStep("length-audit", "Length Audit", "Trim to ICLR page budget", lengthAuditPrompt, "build", "artifacts", "fresh", 840, 360, "iclr2026/build/length-audit.md"),
  textStep("round1-merge", "Round 1 Merge", "Merge tex + compile round1.pdf", round1MergePrompt, "build", "artifacts", "fresh", 1080, 300, "iclr2026/build/round1-merge.md"),
  kiroReviewStep("kiro-review-ds", "KIRO Review (DeepSeek)", kiroReviewPrompt("reviews/kiro-deepseek-review.md", "deepseek-3.2"), 1500, 80, "reviews/kiro-deepseek-review.md"),
  kiroReviewStep("kiro-review-mm", "KIRO Review (MiniMax)", kiroReviewPrompt("reviews/kiro-minimax-review.md", "minimax-m2.5"), 1500, 160, "reviews/kiro-minimax-review.md", "kiro_default"),
  kiroReviewStep("kiro-review-qwen", "KIRO Review (Qwen)", kiroReviewPrompt("reviews/kiro-qwen-review.md", "qwen3-coder-next"), 1500, 240, "reviews/kiro-qwen-review.md"),
  textStep("deepseek-pro-review", "DeepSeek Pro Review", "OpenCode objective reviewer + DeepSeek V4 Pro", deepseekProReviewPrompt, "review", "fresh", "fresh", 1500, 320, "reviews/deepseek-pro-review.md"),
  textStep("review-intersection", "Review Intersection", "Consensus must-fix across four reviews", reviewIntersectionPrompt, "agent", "fresh", "fresh", 1740, 300, "reviews/review-intersection.md"),
  textStep("revision-plan", "Revision Plan", "Fresh planner: draft + intersected reviews", revisionPlanPrompt, "plan", "fresh", "fresh", 1980, 180, "iclr2026/build/revision-plan.md"),
  textStep("revision-major", "Major Revision", "Fresh major pass + humanizer", revisionMajorPrompt, "build", "fresh", "fresh", 1980, 300, "iclr2026/build/revision-major-log.md"),
  textStep("final-pdf", "Final PDF", "Fresh final PDF build", finalPdfPrompt, "build", "fresh", "fresh", 1980, 420, "iclr2026/build/final-build.md"),
]

const edges: WorkflowEdge[] = [
  ...FIGURE_PROMPT_IDS.map((promptId) => ({ from: "architect-plan", to: promptId, contextMode: "artifacts" as const })),
  ...SECTIONS.map((section) => ({ from: "architect-plan", to: section.id, contextMode: "artifacts" as const })),
  ...FIGURES.map((fig) => ({ from: fig.promptId, to: fig.renderId, contextMode: "fresh" as const })),
  ...SECTIONS.map((section) => ({ from: section.id, to: "body-text", contextMode: "artifacts" as const })),
  { from: "body-text", to: "round1-merge", contextMode: "artifacts" },
  ...FIGURE_RENDER_IDS.map((renderId) => ({ from: renderId, to: "round1-merge", contextMode: "artifacts" as const })),
  { from: "round1-merge", to: "layout-audit", contextMode: "artifacts" },
  { from: "layout-audit", to: "length-audit", contextMode: "artifacts" },
  { from: "length-audit", to: "submit-review-gate", contextMode: "artifacts" },
  { from: "submit-review-gate", to: "kiro-review-ds", contextMode: "fresh" },
  { from: "submit-review-gate", to: "kiro-review-mm", contextMode: "fresh" },
  { from: "submit-review-gate", to: "kiro-review-qwen", contextMode: "fresh" },
  { from: "submit-review-gate", to: "deepseek-pro-review", contextMode: "fresh" },
  { from: "kiro-review-ds", to: "review-intersection", contextMode: "artifacts" },
  { from: "kiro-review-mm", to: "review-intersection", contextMode: "artifacts" },
  { from: "kiro-review-qwen", to: "review-intersection", contextMode: "artifacts" },
  { from: "deepseek-pro-review", to: "review-intersection", contextMode: "artifacts" },
  { from: "review-intersection", to: "revision-plan", contextMode: "fresh" },
  { from: "revision-plan", to: "revision-major", contextMode: "fresh" },
  { from: "revision-major", to: "final-pdf", contextMode: "fresh" },
]

export class AudiorwkvIclrPyramidTemplate extends WorkflowTemplateBase {
  constructor() {
    super({
      id: TEMPLATE_ID,
      name: "AudioRWKV → ICLR",
      description: "IO planner → parallel sections + 3 figures → round1 merge (LaTeX + PDF with all figs) → layout/length audit → reviews.",
      cwd: WORKSPACE_KEY,
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

export const audiorwkvIclrPyramidTemplate = new AudiorwkvIclrPyramidTemplate()

function artifact(id: string, label: string, kind: WorkflowArtifact["kind"], relPath: string): WorkflowArtifact {
  return { id, label, kind, path: relPath, href: "" }
}

function bindingFor(nodeId: string): NodeBinding {
  const binding = NODE_BINDINGS[nodeId]
  if (!binding) throw new Error(`Missing NODE_BINDINGS for ${nodeId}`)
  return binding
}

function opencodeAgentNode(
  step: TemplateStep,
  columnId: string,
  laneId: string,
  toolConstraints?: NodeToolConstraints,
  artifacts: WorkflowArtifact[] = [],
  readRunFiles?: string[],
  archetype?: NodeArchetype,
  intent?: InteractionIntent,
): WorkflowNode {
  const binding = bindingFor(step.id)
  const agentMode = getAgentModeTemplate(binding.agentModeTemplateId)
  const arch: NodeArchetype = archetype ?? (step.mode === "plan" ? "planner" : step.id.includes("review") ? "reviewer" : "worker")
  const resolvedIntent: InteractionIntent = intent ?? (arch === "reviewer" ? "review" : arch === "planner" ? "handoff" : readRunFiles?.length ? "handoff" : "handoff")
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
    agentModeTemplateId: binding.agentModeTemplateId,
    cliTemplateId: agentMode?.cliTemplateId ?? "opencode-cli",
    runtimeMode: step.mode,
    ...(binding.llmApiTemplateId ? { llmApiTemplateId: binding.llmApiTemplateId } : {}),
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
      contextMode: resolvedIntent === "continue" ? "inherit" : "fresh",
      intent: resolvedIntent,
      archetype: arch,
      maxIterations: step.maxIterations,
      responseFormat: "markdown",
      timeoutMs: step.mode === "plan" ? 900_000 : 600_000,
      ...(binding.plannerInquiry
        ? {
            plannerInquiry: true,
            ...(binding.inquiryQuestionsFile ? { inquiryQuestionsFile: binding.inquiryQuestionsFile } : {}),
            ...(binding.inquiryReplyFile ? { inquiryReplyFile: binding.inquiryReplyFile } : {}),
          }
        : {}),
      ...(readRunFiles?.length ? { readRunFiles } : {}),
    },
  }
}

function imageApiNode(
  step: TemplateStep,
  columnId: string,
  laneId: string,
  artifacts: WorkflowArtifact[],
  readRunFiles?: string[],
): WorkflowNode {
  const binding = bindingFor(step.id)
  const agentMode = getAgentModeTemplate(binding.agentModeTemplateId)
  return {
    id: step.id,
    name: step.label,
    kind: "llm-step",
    stageId: `${TEMPLATE_ID}-stage`,
    columnId,
    laneId,
    agentId: "agent-kuaipao",
    executionMode: "llm-api",
    modality: "image",
    agentModeTemplateId: binding.agentModeTemplateId,
    cliTemplateId: agentMode?.cliTemplateId ?? "direct-api-cli",
    llmApiTemplateId: binding.llmApiTemplateId,
    promptTitle: step.label,
    promptPreview: step.prompt,
    outputContract: step.meaning,
    artifacts,
    x: step.x,
    y: step.y,
    state: "waiting",
    session: sessionBindingFromStep(step),
    runtimeOverrides: {
      contextMode: "fresh",
      intent: "handoff",
      archetype: "media",
      responseFormat: "text",
      timeoutMs: 1_800_000,
      ...(readRunFiles?.length ? { readRunFiles } : {}),
    },
  }
}

function kiroCliNode(
  step: TemplateStep,
  columnId: string,
  laneId: string,
  artifacts: WorkflowArtifact[],
): WorkflowNode {
  const binding = bindingFor(step.id)
  const agentMode = getAgentModeTemplate(binding.agentModeTemplateId)
  return {
    id: step.id,
    name: step.label,
    kind: "verify",
    stageId: `${TEMPLATE_ID}-stage`,
    columnId,
    laneId,
    agentId: "agent-kiro-cli",
    executionMode: "cli",
    cliTemplateId: agentMode?.cliTemplateId ?? "kiro-cli",
    agentModeTemplateId: binding.agentModeTemplateId,
    runtimeMode: "review",
    promptTitle: step.label,
    promptPreview: step.prompt,
    outputContract: step.meaning,
    artifacts,
    x: step.x,
    y: step.y,
    state: "waiting",
    session: sessionBindingFromStep(step),
    runtimeOverrides: {
      contextMode: "fresh",
      intent: "review",
      archetype: "reviewer",
      ...(binding.cliModelId ? { model: binding.cliModelId } : {}),
      readRunFiles: ["iclr2026/build/round1.pdf"],
      customCommand: step.customCommand ?? "kiro-cli",
      customArgs: step.customArgs,
    },
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
      artifact("round1-pdf", "Round 1 Manuscript PDF", "pdf", "iclr2026/build/round1.pdf"),
      artifact("round1-merge-md", "Round 1 merge notes", "markdown", "iclr2026/build/round1-merge.md"),
    ],
    x: 1400,
    y: 300,
    state: "waiting",
    runtimeOverrides: {
      contextMode: "artifacts",
      intent: "handoff",
      archetype: "gate",
      gateRequiredArtifacts: [
        "iclr2026/build/round1.pdf",
        "iclr2026/figures/fig1.png",
        "iclr2026/figures/fig2.png",
        "iclr2026/figures/fig3.png",
      ],
    },
  }
}

export function buildAudiorwkvIclrPyramidUiTemplate(): WorkflowTemplate {
  const base = convertBaseTemplate(audiorwkvIclrPyramidTemplate)
  const stageId = `${TEMPLATE_ID}-stage`
  const columns = [
    {
      id: `${TEMPLATE_ID}-c-architect`,
      name: "Architect",
      stageId,
      lanes: [{ id: `${TEMPLATE_ID}-l-plan`, name: "plan", nodeIds: ["architect-plan"] }],
    },
    {
      id: `${TEMPLATE_ID}-c-figures`,
      name: "Figures",
      stageId,
      lanes: FIGURES.map((fig) => ({
        id: `${TEMPLATE_ID}-l-${fig.lane}`,
        name: fig.lane,
        nodeIds: [fig.promptId, fig.renderId],
      })),
    },
    {
      id: `${TEMPLATE_ID}-c-sections`,
      name: "Parallel Sections",
      stageId,
      lanes: SECTIONS.map((section) => ({ id: `${TEMPLATE_ID}-l-${section.id}`, name: section.id, nodeIds: [section.id] })),
    },
    {
      id: `${TEMPLATE_ID}-c-body`,
      name: "正文",
      stageId,
      lanes: [{ id: `${TEMPLATE_ID}-l-body`, name: "body-text", nodeIds: ["body-text"] }],
    },
    {
      id: `${TEMPLATE_ID}-c-merge`,
      name: "Round 1",
      stageId,
      lanes: [{ id: `${TEMPLATE_ID}-l-merge`, name: "merge", nodeIds: ["round1-merge"] }],
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
    { id: `${TEMPLATE_ID}-c-gate`, name: "Human Gate", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-gate`, name: "gate", nodeIds: ["submit-review-gate"] }] },
    {
      id: `${TEMPLATE_ID}-c-reviews`,
      name: "Peer Review",
      stageId,
      lanes: [
        { id: `${TEMPLATE_ID}-l-kiro-ds`, name: "kiro-ds", nodeIds: ["kiro-review-ds"] },
        { id: `${TEMPLATE_ID}-l-kiro-mm`, name: "kiro-mm", nodeIds: ["kiro-review-mm"] },
        { id: `${TEMPLATE_ID}-l-kiro-qwen`, name: "kiro-qwen", nodeIds: ["kiro-review-qwen"] },
        { id: `${TEMPLATE_ID}-l-ds-pro`, name: "deepseek-pro", nodeIds: ["deepseek-pro-review"] },
      ],
    },
    { id: `${TEMPLATE_ID}-c-intersect`, name: "Intersection", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-intersect`, name: "intersect", nodeIds: ["review-intersection"] }] },
    {
      id: `${TEMPLATE_ID}-c-revise`,
      name: "Revision",
      stageId,
      lanes: [
        { id: `${TEMPLATE_ID}-l-rev-plan`, name: "plan", nodeIds: ["revision-plan"] },
        { id: `${TEMPLATE_ID}-l-major`, name: "major", nodeIds: ["revision-major"] },
        { id: `${TEMPLATE_ID}-l-final`, name: "final", nodeIds: ["final-pdf"] },
      ],
    },
  ]

  const allSteps = audiorwkvIclrPyramidTemplate.steps
  const stepById = (id: string) => allSteps.find((s) => s.id === id)!

  const sectionNodes = SECTIONS.map((section, index) => {
    const step = stepById(section.id)
    return opencodeAgentNode(
      step,
      columns[2]!.id,
      columns[2]!.lanes[index]!.id,
      humanizerConstraints,
      [artifact(`${section.id}-tex`, section.file, "latex", section.file)],
      ["journal-architecture.md", "venue-requirements.md", "method-rewrite-notes.md"],
    )
  })

  const reviewMergeFrom = ["kiro-review-ds", "kiro-review-mm", "kiro-review-qwen", "deepseek-pro-review"]

  const nodes: WorkflowNode[] = [
    opencodeAgentNode(stepById("architect-plan"), columns[0]!.id, columns[0]!.lanes[0]!.id, undefined, [
        artifact("arch-questions", "arch-clarification-questions.md", "markdown", "arch-clarification-questions.md"),
        artifact("venue-requirements", "venue-requirements.md", "markdown", "venue-requirements.md"),
        artifact("journal-architecture", "journal-architecture.md", "markdown", "journal-architecture.md"),
        ...FIGURES.map((fig) => artifact(`fig${fig.index}-summary`, `fig${fig.index}-summary.md`, "markdown", `iclr2026/figures/fig${fig.index}-summary.md`)),
        artifact("method-notes", "method-rewrite-notes.md", "markdown", "method-rewrite-notes.md"),
      ], undefined, "planner", "handoff"),
    ...FIGURES.flatMap((fig, laneIndex) => [
      opencodeAgentNode(stepById(fig.promptId), columns[1]!.id, columns[1]!.lanes[laneIndex]!.id, drawSkillConstraints, [
        artifact(`fig${fig.index}-prompt`, `fig${fig.index}-prompt.md`, "markdown", `iclr2026/figures/prompts/fig${fig.index}-prompt.md`),
      ], [`iclr2026/figures/fig${fig.index}-summary.md`, "journal-architecture.md", "method-rewrite-notes.md"]),
      imageApiNode(stepById(fig.renderId), columns[1]!.id, columns[1]!.lanes[laneIndex]!.id, [
        artifact(`fig${fig.index}-png`, `fig${fig.index}.png`, "image", `iclr2026/figures/fig${fig.index}.png`),
      ], [`iclr2026/figures/prompts/fig${fig.index}-prompt.md`]),
    ]),
    ...sectionNodes,
    opencodeAgentNode(stepById("body-text"), columns[3]!.id, columns[3]!.lanes[0]!.id, humanizerConstraints, [
      artifact("body-text-check", "body-text-check.md", "markdown", "iclr2026/build/body-text-check.md"),
    ], [
      "journal-architecture.md",
      "venue-requirements.md",
      "method-rewrite-notes.md",
      ...SECTIONS.map((s) => `${s.id}.md`),
    ], "worker", "handoff"),
    opencodeAgentNode(stepById("round1-merge"), columns[4]!.id, columns[4]!.lanes[0]!.id, compileToolConstraints, [
      artifact("round1-pdf", "round1.pdf", "pdf", "iclr2026/build/round1.pdf"),
      artifact("round1-merge-md", "round1-merge.md", "markdown", "iclr2026/build/round1-merge.md"),
    ], [
      "journal-architecture.md",
      "iclr2026/build/body-text-check.md",
      "iclr2026/main.tex",
      ...FIGURE_PNG_PATHS,
      ...SECTIONS.map((s) => s.file),
    ], "merger", "handoff"),
    humanGateNode(),
    opencodeAgentNode(stepById("layout-audit"), columns[5]!.id, columns[5]!.lanes[0]!.id, compileToolConstraints, [
      artifact("layout-audit", "layout-audit.md", "markdown", "iclr2026/build/layout-audit.md"),
      artifact("round1-pdf-layout", "round1.pdf", "pdf", "iclr2026/build/round1.pdf"),
    ], [
      "iclr2026/build/round1.pdf",
      "iclr2026/build/round1-merge.md",
      "iclr2026/main.tex",
      ...FIGURE_PNG_PATHS,
    ]),
    opencodeAgentNode(stepById("length-audit"), columns[5]!.id, columns[5]!.lanes[1]!.id, compileToolConstraints, [
      artifact("length-audit", "length-audit.md", "markdown", "iclr2026/build/length-audit.md"),
    ], ["iclr2026/build/round1.pdf", "iclr2026/build/layout-audit.md"]),
    kiroCliNode(stepById("kiro-review-ds"), columns[7]!.id, columns[7]!.lanes[0]!.id, [
      artifact("kiro-ds-review", "kiro-deepseek-review.md", "markdown", "reviews/kiro-deepseek-review.md"),
    ]),
    kiroCliNode(stepById("kiro-review-mm"), columns[7]!.id, columns[7]!.lanes[1]!.id, [
      artifact("kiro-mm-review", "kiro-minimax-review.md", "markdown", "reviews/kiro-minimax-review.md"),
    ]),
    kiroCliNode(stepById("kiro-review-qwen"), columns[7]!.id, columns[7]!.lanes[2]!.id, [
      artifact("kiro-qwen-review", "kiro-qwen-review.md", "markdown", "reviews/kiro-qwen-review.md"),
    ]),
    opencodeAgentNode(stepById("deepseek-pro-review"), columns[7]!.id, columns[7]!.lanes[3]!.id, undefined, [
      artifact("ds-pro-review", "deepseek-pro-review.md", "markdown", "reviews/deepseek-pro-review.md"),
    ], ["iclr2026/build/round1.pdf"], "reviewer", "review"),
    opencodeAgentNode(stepById("review-intersection"), columns[8]!.id, columns[8]!.lanes[0]!.id, undefined, [
      artifact("intersection-md", "review-intersection.md", "markdown", "reviews/review-intersection.md"),
      artifact("intersection-json", "review-intersection.json", "json", "reviews/review-intersection.json"),
    ], [
      "reviews/kiro-deepseek-review.md",
      "reviews/kiro-minimax-review.md",
      "reviews/kiro-qwen-review.md",
      "reviews/deepseek-pro-review.md",
    ], "merger", "handoff"),
    opencodeAgentNode(stepById("revision-plan"), columns[9]!.id, columns[9]!.lanes[0]!.id, undefined, [
      artifact("revision-plan", "revision-plan.md", "markdown", "iclr2026/build/revision-plan.md"),
    ], ["journal-architecture.md", "method-rewrite-notes.md", "reviews/review-intersection.md", "iclr2026/build/round1-merge.md"], "planner", "handoff"),
    opencodeAgentNode(stepById("revision-major"), columns[9]!.id, columns[9]!.lanes[1]!.id, humanizerConstraints, [
      artifact("revision-major-log", "revision-major-log.md", "markdown", "iclr2026/build/revision-major-log.md"),
    ], ["iclr2026/build/revision-plan.md"]),
    opencodeAgentNode(stepById("final-pdf"), columns[9]!.id, columns[9]!.lanes[2]!.id, compileToolConstraints, [
      artifact("final-pdf", "final.pdf", "pdf", "iclr2026/build/final.pdf"),
      artifact("final-build", "final-build.md", "markdown", "iclr2026/build/final-build.md"),
    ], ["iclr2026/main.tex", ...FIGURE_PNG_PATHS]),
  ]

  const templateEdges = audiorwkvIclrPyramidTemplate.edges
  const uiEdges: WorkflowTemplate["edges"] = templateEdges.map((edge, index) => ({
    id: `${TEMPLATE_ID}-e${index + 1}`,
    from: edge.from,
    to: edge.to,
    kind: (() => {
      if (edge.from === "architect-plan" && (FIGURE_PROMPT_IDS.includes(edge.to) || SECTIONS.some((s) => s.id === edge.to))) return "branch" as const
      if ((FIGURE_RENDER_IDS.includes(edge.from) || edge.from === "body-text") && edge.to === "round1-merge") return "merge" as const
      if (SECTIONS.some((s) => s.id === edge.from) && edge.to === "body-text") return "merge" as const
      if (edge.from === "submit-review-gate" && edge.to.endsWith("-review")) return "branch" as const
      if (reviewMergeFrom.includes(edge.from) && edge.to === "review-intersection") return "merge" as const
      return "normal" as const
    })(),
    color: "rgb(140,197,223)",
    annotation: edge.contextMode,
    contextMode: edge.contextMode,
  }))

  const template = migrateWorkflowTemplateIntents({
    ...base,
    name: "AudioRWKV → ICLR",
    description: audiorwkvIclrPyramidTemplate.description,
    workingDirectory: WORKSPACE_KEY,
    inputMounts: [{ name: "audiorwkv", path: "audiorwkv" }],
    defaultAgentModeTemplateId: "custom-io-planner",
    defaultLlmApiTemplateId: "deepseek-deepseek-v4-flash",
    agentModeTemplateIds: [
      "custom-io-planner",
      "opencode-paper-planner",
      "opencode-paper-section",
      "opencode-paper-compile",
      "opencode-paper-reviewer",
      "opencode-build",
      DIRECT_API_MODE_ID,
      "kiro-cli-review",
    ],
    stages: [{ id: stageId, name: "AudioRWKV → ICLR", color: "rgb(140,197,223)", columnIds: columns.map((column) => column.id) }],
    columns,
    nodes,
    edges: uiEdges,
    branchGroups: [
      { id: `${TEMPLATE_ID}-b-figures`, from: "architect-plan", to: [...FIGURE_PROMPT_IDS] },
      { id: `${TEMPLATE_ID}-b-sections`, from: "architect-plan", to: SECTIONS.map((section) => section.id) },
      { id: `${TEMPLATE_ID}-b-reviews`, from: "submit-review-gate", to: reviewMergeFrom },
    ],
    mergeGroups: [
      { id: `${TEMPLATE_ID}-m-sections`, from: SECTIONS.map((section) => section.id), to: "body-text" },
      { id: `${TEMPLATE_ID}-m-round1`, from: ["body-text", ...FIGURE_RENDER_IDS], to: "round1-merge" },
      { id: `${TEMPLATE_ID}-m-reviews`, from: reviewMergeFrom, to: "review-intersection" },
    ],
    sharedSessions: buildSharedSessions(nodes, { edges: uiEdges, nodes }),
    sessionGroups: {},
  } as unknown as Record<string, unknown>) as WorkflowTemplate

  return normalizeTemplateLlmBindings(template)
}
