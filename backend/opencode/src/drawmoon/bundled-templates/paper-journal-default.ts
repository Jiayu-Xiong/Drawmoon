/**
 * Bundled paper-journal workflow — built in code (no LLM I/O).
 * Emitted to xy/templates/workflow/paper-journal-default.json via emit-workflow-template.ts
 */

const ID = "paper-journal-default"
const STAGE = `${ID}-stage`
const COLOR = "rgb(140,197,223)"
const CWD = "paper"

const AGENT_PLANNER = "custom-io-planner"
const AGENT_SECTION = "opencode-paper-section"
const AGENT_REVIEWER = "opencode-paper-reviewer"
const AGENT_COMPILE = "opencode-paper-compile"
const LLM_TEXT = "deepseek-deepseek-v4-flash"
const LLM_IMAGE = "kuaipao-gpt-image-2"

const PATH_RULE = `Read/write ONLY under ${CWD}/. Use exact artifact paths; never write to workspace root.`

type ArtifactKind = "markdown" | "json" | "pdf" | "image" | "latex"

function art(id: string, label: string, kind: ArtifactKind, path: string) {
  return { id, label, kind, path, href: "" }
}

function cliNode(input: {
  id: string
  name: string
  columnId: string
  laneId: string
  x: number
  y: number
  agentMode: string
  archetype: string
  prompt: string
  outputContract: string
  artifacts: ReturnType<typeof art>[]
  contextMode: string
  readRunFiles?: string[]
  maxIterations?: number
}) {
  const contractInputs = (input.readRunFiles ?? []).map((path) => ({
    key: path.replace(/[^a-z0-9]+/gi, "-"),
    from: `${input.id}:ref`,
    mode: "reference" as const,
    required: true,
  }))
  return {
    id: input.id,
    name: input.name,
    kind: "run-cli",
    stageId: STAGE,
    columnId: input.columnId,
    laneId: input.laneId,
    agentId: "agent-paper",
    executionMode: "cli",
    agentModeTemplateId: input.agentMode,
    llmApiTemplateId: LLM_TEXT,
    promptTitle: input.name,
    promptPreview: input.prompt,
    outputContract: input.outputContract,
    x: input.x,
    y: input.y,
    state: "waiting",
    artifacts: input.artifacts,
    runtimeOverrides: {
      contextMode: input.contextMode,
      intent: input.archetype === "reviewer" ? "review" : input.archetype === "reviser" ? "continue" : input.contextMode === "inherit" ? "continue" : "handoff",
      maxIterations: input.maxIterations ?? 8,
      workingDirectory: CWD,
      archetype: input.archetype,
      ...(input.readRunFiles?.length ? { readRunFiles: input.readRunFiles } : {}),
      contract: {
        transport: input.contextMode === "inherit" ? "intra" : "inter",
        ...(contractInputs.length ? { inputs: contractInputs } : {}),
        outputs: input.artifacts.map((a) => ({ key: a.id, path: a.path, criticality: "isolated" })),
      },
    },
  }
}

function imageNode(input: {
  id: string
  name: string
  columnId: string
  laneId: string
  x: number
  y: number
  prompt: string
  outputContract: string
  artifacts: ReturnType<typeof art>[]
  readRunFiles: string[]
}) {
  return {
    id: input.id,
    name: input.name,
    kind: "run-api",
    stageId: STAGE,
    columnId: input.columnId,
    laneId: input.laneId,
    agentId: "agent-paper",
    executionMode: "llm-api",
    agentModeTemplateId: "direct-api",
    cliTemplateId: "direct-api-cli",
    llmApiTemplateId: LLM_IMAGE,
    modality: "image",
    promptTitle: input.name,
    promptPreview: input.prompt,
    outputContract: input.outputContract,
    x: input.x,
    y: input.y,
    state: "waiting",
    artifacts: input.artifacts,
    runtimeOverrides: {
      contextMode: "artifacts",
      maxIterations: 2,
      workingDirectory: CWD,
      archetype: "media",
      readRunFiles: input.readRunFiles,
      contract: {
        transport: "inter",
        inputs: input.readRunFiles.map((path) => ({
          key: path.replace(/[^a-z0-9]+/gi, "-"),
          from: `${input.id}:ref`,
          mode: "reference" as const,
          required: true,
        })),
        outputs: input.artifacts.map((a) => ({ key: a.id, path: a.path, criticality: "isolated" })),
      },
    },
  }
}

function humanGate(input: {
  id: string
  name: string
  columnId: string
  laneId: string
  x: number
  y: number
  prompt: string
  outputContract: string
  artifacts: ReturnType<typeof art>[]
}) {
  return {
    id: input.id,
    name: input.name,
    kind: "condition",
    stageId: STAGE,
    columnId: input.columnId,
    laneId: input.laneId,
    agentId: "agent-editor",
    executionMode: "human-gate",
    promptTitle: input.name,
    promptPreview: input.prompt,
    outputContract: input.outputContract,
    x: input.x,
    y: input.y,
    state: "waiting",
    artifacts: input.artifacts,
    runtimeOverrides: { contextMode: "inherit", workingDirectory: CWD, archetype: "gate" },
  }
}

function inquiryGate(input: {
  id: string
  name: string
  columnId: string
  laneId: string
  x: number
  y: number
  prompt: string
  outputContract: string
  artifacts: ReturnType<typeof art>[]
}) {
  return {
    id: input.id,
    name: input.name,
    kind: "condition",
    stageId: STAGE,
    columnId: input.columnId,
    laneId: input.laneId,
    agentId: "agent-editor",
    executionMode: "inquiry",
    promptTitle: input.name,
    promptPreview: input.prompt,
    outputContract: input.outputContract,
    x: input.x,
    y: input.y,
    state: "waiting",
    artifacts: input.artifacts,
    runtimeOverrides: { contextMode: "inherit", workingDirectory: CWD, archetype: "gate" },
  }
}

function edge(id: string, from: string, to: string, contextMode: string, kind = "normal") {
  return { id, from, to, kind, color: COLOR, annotation: contextMode, contextMode }
}

export function paperJournalDefaultTemplate(): Record<string, unknown> {
  const c = (n: number) => `${ID}-c${n}`
  const l = (n: number, sub = "main") => `${ID}-c${n}-${sub}`

  const columns = [
    { id: c(1), name: "Intake", stageId: STAGE, lanes: [{ id: l(1), name: "main", nodeIds: ["intake"] }] },
    { id: c(2), name: "Requirements", stageId: STAGE, lanes: [{ id: l(2), name: "main", nodeIds: ["requirements"] }] },
    { id: c(3), name: "Confirm", stageId: STAGE, lanes: [{ id: l(3), name: "main", nodeIds: ["req-gate"] }] },
    { id: c(4), name: "Scaffold", stageId: STAGE, lanes: [{ id: l(4), name: "main", nodeIds: ["latex-scaffold"] }] },
    {
      id: c(5),
      name: "Parallel front / method",
      stageId: STAGE,
      lanes: [
        { id: l(5, "survey"), name: "survey", nodeIds: ["lit-survey", "front-matter", "teaser-figure-spec"] },
        { id: l(5, "method"), name: "method", nodeIds: ["methodology", "method-figure-spec"] },
      ],
    },
    {
      id: c(6),
      name: "Body sections",
      stageId: STAGE,
      lanes: [{ id: l(6), name: "main", nodeIds: ["experiments", "conclusion", "limitations", "exp-figure-spec"] }],
    },
    {
      id: c(7),
      name: "Figures & layout",
      stageId: STAGE,
      lanes: [
        { id: l(7, "teaser"), name: "teaser", nodeIds: ["render-teaser"] },
        { id: l(7, "method"), name: "method-fig", nodeIds: ["render-method-fig"] },
        { id: l(7, "exp1"), name: "exp1", nodeIds: ["render-exp-fig-1"] },
        { id: l(7, "exp2"), name: "exp2", nodeIds: ["render-exp-fig-2"] },
        { id: l(7, "layout"), name: "layout", nodeIds: ["layout-audit"] },
      ],
    },
    { id: c(8), name: "Humanize", stageId: STAGE, lanes: [{ id: l(8), name: "main", nodeIds: ["humanizer-merge"] }] },
    { id: c(9), name: "Polish gate", stageId: STAGE, lanes: [{ id: l(9), name: "main", nodeIds: ["polish-gate"] }] },
    {
      id: c(10),
      name: "Review R1",
      stageId: STAGE,
      lanes: [1, 2, 3, 4, 5].map((i) => ({
        id: l(10, `r${i}`),
        name: `r1-${i}`,
        nodeIds: [`reviewer-r1-${i}`],
      })),
    },
    { id: c(11), name: "Merge R1", stageId: STAGE, lanes: [{ id: l(11), name: "main", nodeIds: ["review-merge-r1"] }] },
    { id: c(12), name: "Revision R1", stageId: STAGE, lanes: [{ id: l(12), name: "main", nodeIds: ["revision-r1"] }] },
    {
      id: c(13),
      name: "Review R2",
      stageId: STAGE,
      lanes: [1, 2, 3, 4, 5].map((i) => ({
        id: l(13, `r${i}`),
        name: `r2-${i}`,
        nodeIds: [`reviewer-r2-${i}`],
      })),
    },
    { id: c(14), name: "Merge R2", stageId: STAGE, lanes: [{ id: l(14), name: "main", nodeIds: ["review-merge-r2"] }] },
    { id: c(15), name: "Revision R2", stageId: STAGE, lanes: [{ id: l(15), name: "main", nodeIds: ["revision-r2"] }] },
    { id: c(16), name: "Final", stageId: STAGE, lanes: [{ id: l(16), name: "main", nodeIds: ["final-deliver"] }] },
  ]

  const nodes = [
    cliNode({
      id: "intake",
      name: "Intake",
      columnId: c(1),
      laneId: l(1),
      x: 80,
      y: 220,
      agentMode: AGENT_PLANNER,
      archetype: "planner",
      contextMode: "fresh",
      prompt: `Collect user idea, experiment results, and target journal from inputs/idea.md, inputs/experiments.md, inputs/journal-target.md. Write ${CWD}/intake-summary.md with structured bullets. ${PATH_RULE}`,
      outputContract: `${CWD}/intake-summary.md`,
      artifacts: [
        art("intake-md", "intake-summary.md", "markdown", `${CWD}/intake-summary.md`),
        art("idea-in", "idea.md", "markdown", "inputs/idea.md"),
        art("exp-in", "experiments.md", "markdown", "inputs/experiments.md"),
        art("journal-in", "journal-target.md", "markdown", "inputs/journal-target.md"),
      ],
    }),
    cliNode({
      id: "requirements",
      name: "Requirements analysis",
      columnId: c(2),
      laneId: l(2),
      x: 440,
      y: 220,
      agentMode: AGENT_PLANNER,
      archetype: "planner",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/intake-summary.md`],
      prompt: `Produce requirements and section map for the target journal. Write ${CWD}/requirements.md and ${CWD}/journal-architecture.md. ${PATH_RULE}`,
      outputContract: `${CWD}/requirements.md, ${CWD}/journal-architecture.md`,
      artifacts: [
        art("req-md", "requirements.md", "markdown", `${CWD}/requirements.md`),
        art("arch-md", "journal-architecture.md", "markdown", `${CWD}/journal-architecture.md`),
      ],
    }),
    inquiryGate({
      id: "req-gate",
      name: "Clarify requirements",
      columnId: c(3),
      laneId: l(3),
      x: 800,
      y: 220,
      prompt: "Review requirements.md and journal-architecture.md. Reply with any clarifications or corrections for the LLM before LaTeX scaffold.",
      outputContract: "User clarification injected into downstream context.",
      artifacts: [art("req-gate", "requirements.md", "markdown", `${CWD}/requirements.md`)],
    }),
    cliNode({
      id: "latex-scaffold",
      name: "LaTeX scaffold",
      columnId: c(4),
      laneId: l(4),
      x: 1160,
      y: 220,
      agentMode: AGENT_PLANNER,
      archetype: "planner",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/journal-architecture.md`, `${CWD}/requirements.md`],
      prompt: `Create ${CWD}/main.tex and empty section shells under ${CWD}/sections/*.tex per architecture. ${PATH_RULE}`,
      outputContract: `${CWD}/main.tex + section shells`,
      artifacts: [
        art("main-tex", "main.tex", "latex", `${CWD}/main.tex`),
        art("sections-dir", "sections/", "markdown", `${CWD}/sections/README.md`),
      ],
    }),
    cliNode({
      id: "lit-survey",
      name: "Literature survey",
      columnId: c(5),
      laneId: l(5, "survey"),
      x: 1520,
      y: 80,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/journal-architecture.md`, `${CWD}/requirements.md`],
      prompt: `Research survey for related work. Write ${CWD}/build/lit-survey.md. ${PATH_RULE}`,
      outputContract: `${CWD}/build/lit-survey.md`,
      artifacts: [art("lit", "lit-survey.md", "markdown", `${CWD}/build/lit-survey.md`)],
    }),
    cliNode({
      id: "front-matter",
      name: "Abstract & intro & related",
      columnId: c(5),
      laneId: l(5, "survey"),
      x: 1880,
      y: 80,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/build/lit-survey.md`, `${CWD}/journal-architecture.md`],
      prompt: `Draft abstract, introduction, related work into ${CWD}/sections/01-front.tex. ${PATH_RULE}`,
      outputContract: `${CWD}/sections/01-front.tex`,
      artifacts: [art("front", "01-front.tex", "latex", `${CWD}/sections/01-front.tex`)],
    }),
    cliNode({
      id: "teaser-figure-spec",
      name: "Teaser figure spec",
      columnId: c(5),
      laneId: l(5, "survey"),
      x: 2240,
      y: 80,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/sections/01-front.tex`],
      prompt: `Write teaser figure prompt ${CWD}/figures/teaser-prompt.md and insert LaTeX placeholder with fixed width/height in 01-front.tex. ${PATH_RULE}`,
      outputContract: "teaser-prompt.md + placeholder in tex",
      artifacts: [
        art("teaser-p", "teaser-prompt.md", "markdown", `${CWD}/figures/teaser-prompt.md`),
        art("front-tex", "01-front.tex", "latex", `${CWD}/sections/01-front.tex`),
      ],
    }),
    cliNode({
      id: "methodology",
      name: "Methodology",
      columnId: c(5),
      laneId: l(5, "method"),
      x: 1520,
      y: 360,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/journal-architecture.md`, `${CWD}/requirements.md`],
      prompt: `Write methodology section ${CWD}/sections/02-methodology.tex. ${PATH_RULE}`,
      outputContract: `${CWD}/sections/02-methodology.tex`,
      artifacts: [art("method-tex", "02-methodology.tex", "latex", `${CWD}/sections/02-methodology.tex`)],
    }),
    cliNode({
      id: "method-figure-spec",
      name: "Method figure spec",
      columnId: c(5),
      laneId: l(5, "method"),
      x: 1880,
      y: 360,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/sections/02-methodology.tex`],
      prompt: `Write method figure prompt ${CWD}/figures/method-prompt.md and insert placeholder with size in methodology tex. ${PATH_RULE}`,
      outputContract: "method-prompt.md + placeholder",
      artifacts: [
        art("method-p", "method-prompt.md", "markdown", `${CWD}/figures/method-prompt.md`),
        art("method-tex2", "02-methodology.tex", "latex", `${CWD}/sections/02-methodology.tex`),
      ],
    }),
    cliNode({
      id: "experiments",
      name: "Experiments",
      columnId: c(6),
      laneId: l(6),
      x: 2600,
      y: 220,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/sections/01-front.tex`, `${CWD}/sections/02-methodology.tex`, `inputs/experiments.md`],
      prompt: `Write experiments section ${CWD}/sections/03-experiments.tex from experiment inputs. ${PATH_RULE}`,
      outputContract: `${CWD}/sections/03-experiments.tex`,
      artifacts: [art("exp-tex", "03-experiments.tex", "latex", `${CWD}/sections/03-experiments.tex`)],
    }),
    cliNode({
      id: "conclusion",
      name: "Conclusion",
      columnId: c(6),
      laneId: l(6),
      x: 2960,
      y: 220,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/sections/03-experiments.tex`],
      prompt: `Write conclusion ${CWD}/sections/04-conclusion.tex. ${PATH_RULE}`,
      outputContract: `${CWD}/sections/04-conclusion.tex`,
      artifacts: [art("concl-tex", "04-conclusion.tex", "latex", `${CWD}/sections/04-conclusion.tex`)],
    }),
    cliNode({
      id: "limitations",
      name: "Limitations",
      columnId: c(6),
      laneId: l(6),
      x: 3320,
      y: 220,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/sections/04-conclusion.tex`],
      prompt: `Write limitations ${CWD}/sections/05-limitations.tex. ${PATH_RULE}`,
      outputContract: `${CWD}/sections/05-limitations.tex`,
      artifacts: [art("lim-tex", "05-limitations.tex", "latex", `${CWD}/sections/05-limitations.tex`)],
    }),
    cliNode({
      id: "exp-figure-spec",
      name: "Experiment figure specs",
      columnId: c(6),
      laneId: l(6),
      x: 3680,
      y: 220,
      agentMode: AGENT_SECTION,
      archetype: "worker",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/sections/03-experiments.tex`],
      prompt: `Write experiment figure prompts ${CWD}/figures/exp-fig-1-prompt.md and exp-fig-2-prompt.md; insert sized placeholders in experiments tex. ${PATH_RULE}`,
      outputContract: "exp figure prompts + placeholders",
      artifacts: [
        art("exp-p1", "exp-fig-1-prompt.md", "markdown", `${CWD}/figures/exp-fig-1-prompt.md`),
        art("exp-p2", "exp-fig-2-prompt.md", "markdown", `${CWD}/figures/exp-fig-2-prompt.md`),
        art("exp-tex2", "03-experiments.tex", "latex", `${CWD}/sections/03-experiments.tex`),
      ],
    }),
    imageNode({
      id: "render-teaser",
      name: "Render teaser",
      columnId: c(7),
      laneId: l(7, "teaser"),
      x: 4040,
      y: 40,
      prompt: `Generate teaser figure from ${CWD}/figures/teaser-prompt.md. Save PNG to ${CWD}/figures/teaser.png.`,
      outputContract: `${CWD}/figures/teaser.png`,
      readRunFiles: [`${CWD}/figures/teaser-prompt.md`],
      artifacts: [art("teaser-img", "teaser.png", "image", `${CWD}/figures/teaser.png`)],
    }),
    imageNode({
      id: "render-method-fig",
      name: "Render method figure",
      columnId: c(7),
      laneId: l(7, "method"),
      x: 4040,
      y: 160,
      prompt: `Generate method figure from ${CWD}/figures/method-prompt.md. Save to ${CWD}/figures/method.png.`,
      outputContract: `${CWD}/figures/method.png`,
      readRunFiles: [`${CWD}/figures/method-prompt.md`],
      artifacts: [art("method-img", "method.png", "image", `${CWD}/figures/method.png`)],
    }),
    imageNode({
      id: "render-exp-fig-1",
      name: "Render exp fig 1",
      columnId: c(7),
      laneId: l(7, "exp1"),
      x: 4040,
      y: 280,
      prompt: `Generate experiment figure 1 from ${CWD}/figures/exp-fig-1-prompt.md. Save to ${CWD}/figures/exp-fig-1.png.`,
      outputContract: `${CWD}/figures/exp-fig-1.png`,
      readRunFiles: [`${CWD}/figures/exp-fig-1-prompt.md`],
      artifacts: [art("exp1-img", "exp-fig-1.png", "image", `${CWD}/figures/exp-fig-1.png`)],
    }),
    imageNode({
      id: "render-exp-fig-2",
      name: "Render exp fig 2",
      columnId: c(7),
      laneId: l(7, "exp2"),
      x: 4040,
      y: 400,
      prompt: `Generate experiment figure 2 from ${CWD}/figures/exp-fig-2-prompt.md. Save to ${CWD}/figures/exp-fig-2.png.`,
      outputContract: `${CWD}/figures/exp-fig-2.png`,
      readRunFiles: [`${CWD}/figures/exp-fig-2-prompt.md`],
      artifacts: [art("exp2-img", "exp-fig-2.png", "image", `${CWD}/figures/exp-fig-2.png`)],
    }),
    cliNode({
      id: "layout-audit",
      name: "Layout audit",
      columnId: c(7),
      laneId: l(7, "layout"),
      x: 4040,
      y: 520,
      agentMode: AGENT_COMPILE,
      archetype: "reviewer",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/main.tex`],
      prompt: `Compile LaTeX draft and write ${CWD}/build/layout-audit.md with overfull boxes and figure placement issues. ${PATH_RULE}`,
      outputContract: `${CWD}/build/layout-audit.md, draft PDF`,
      artifacts: [
        art("layout-md", "layout-audit.md", "markdown", `${CWD}/build/layout-audit.md`),
        art("draft-pdf", "draft.pdf", "pdf", `${CWD}/build/draft.pdf`),
      ],
    }),
    cliNode({
      id: "humanizer-merge",
      name: "Humanizer merge",
      columnId: c(8),
      laneId: l(8),
      x: 4400,
      y: 220,
      agentMode: AGENT_SECTION,
      archetype: "merger",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/main.tex`, `${CWD}/build/layout-audit.md`],
      prompt: `Apply humanizer skill to prose sections; ensure figure paths resolve. Write ${CWD}/build/humanized-merge.md log. ${PATH_RULE}`,
      outputContract: "Humanized manuscript + merge log",
      artifacts: [art("hum-log", "humanized-merge.md", "markdown", `${CWD}/build/humanized-merge.md`)],
    }),
    humanGate({
      id: "polish-gate",
      name: "User polish confirm",
      columnId: c(9),
      laneId: l(9),
      x: 4760,
      y: 220,
      prompt: "Review humanized draft and figures. Continue to peer review round 1 after user approval.",
      outputContract: "Human approval before review loop.",
      artifacts: [art("polish-pdf", "draft.pdf", "pdf", `${CWD}/build/draft.pdf`)],
    }),
    ...[1, 2, 3, 4, 5].map((i) =>
      cliNode({
        id: `reviewer-r1-${i}`,
        name: `Reviewer R1 #${i}`,
        columnId: c(10),
        laneId: l(10, `r${i}`),
        x: 5120,
        y: 40 + (i - 1) * 100,
        agentMode: AGENT_REVIEWER,
        archetype: "reviewer",
        contextMode: "fresh",
        readRunFiles: [`${CWD}/build/draft.pdf`, `${CWD}/main.tex`],
        prompt: `Independent objective review #${i}. Write ${CWD}/reviews/round1-reviewer-${i}.md. ${PATH_RULE}`,
        outputContract: `${CWD}/reviews/round1-reviewer-${i}.md`,
        artifacts: [art(`r1-${i}`, `round1-reviewer-${i}.md`, "markdown", `${CWD}/reviews/round1-reviewer-${i}.md`)],
      }),
    ),
    cliNode({
      id: "review-merge-r1",
      name: "Review union R1",
      columnId: c(11),
      laneId: l(11),
      x: 5480,
      y: 220,
      agentMode: AGENT_PLANNER,
      archetype: "merger",
      contextMode: "artifacts",
      readRunFiles: [1, 2, 3, 4, 5].map((i) => `${CWD}/reviews/round1-reviewer-${i}.md`),
      prompt: `Merge five R1 reviews into objective union ${CWD}/reviews/round1-union.md and actionable list JSON. ${PATH_RULE}`,
      outputContract: `${CWD}/reviews/round1-union.md`,
      artifacts: [
        art("r1-union", "round1-union.md", "markdown", `${CWD}/reviews/round1-union.md`),
        art("r1-json", "round1-union.json", "json", `${CWD}/reviews/round1-union.json`),
      ],
    }),
    cliNode({
      id: "revision-r1",
      name: "Revision R1",
      columnId: c(12),
      laneId: l(12),
      x: 5840,
      y: 220,
      agentMode: AGENT_SECTION,
      archetype: "reviser",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/reviews/round1-union.md`, `${CWD}/main.tex`],
      prompt: `Apply review union objectively to tex sections. Log ${CWD}/build/revision-r1.md. ${PATH_RULE}`,
      outputContract: "Revised manuscript after R1",
      artifacts: [art("rev-r1", "revision-r1.md", "markdown", `${CWD}/build/revision-r1.md`)],
    }),
    ...[1, 2, 3, 4, 5].map((i) =>
      cliNode({
        id: `reviewer-r2-${i}`,
        name: `Reviewer R2 #${i}`,
        columnId: c(13),
        laneId: l(13, `r${i}`),
        x: 6200,
        y: 40 + (i - 1) * 100,
        agentMode: AGENT_REVIEWER,
        archetype: "reviewer",
        contextMode: "fresh",
        readRunFiles: [`${CWD}/build/revision-r1.md`, `${CWD}/main.tex`],
        prompt: `Second-round independent review #${i}. Write ${CWD}/reviews/round2-reviewer-${i}.md. ${PATH_RULE}`,
        outputContract: `${CWD}/reviews/round2-reviewer-${i}.md`,
        artifacts: [art(`r2-${i}`, `round2-reviewer-${i}.md`, "markdown", `${CWD}/reviews/round2-reviewer-${i}.md`)],
      }),
    ),
    cliNode({
      id: "review-merge-r2",
      name: "Review union R2",
      columnId: c(14),
      laneId: l(14),
      x: 6560,
      y: 220,
      agentMode: AGENT_PLANNER,
      archetype: "merger",
      contextMode: "artifacts",
      readRunFiles: [1, 2, 3, 4, 5].map((i) => `${CWD}/reviews/round2-reviewer-${i}.md`),
      prompt: `Merge five R2 reviews into ${CWD}/reviews/round2-union.md. ${PATH_RULE}`,
      outputContract: `${CWD}/reviews/round2-union.md`,
      artifacts: [art("r2-union", "round2-union.md", "markdown", `${CWD}/reviews/round2-union.md`)],
    }),
    cliNode({
      id: "revision-r2",
      name: "Revision R2",
      columnId: c(15),
      laneId: l(15),
      x: 6920,
      y: 220,
      agentMode: AGENT_SECTION,
      archetype: "reviser",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/reviews/round2-union.md`, `${CWD}/main.tex`],
      prompt: `Final objective revision pass. Log ${CWD}/build/revision-r2.md. ${PATH_RULE}`,
      outputContract: "Final revised manuscript",
      artifacts: [art("rev-r2", "revision-r2.md", "markdown", `${CWD}/build/revision-r2.md`)],
    }),
    cliNode({
      id: "final-deliver",
      name: "Final deliverable",
      columnId: c(16),
      laneId: l(16),
      x: 7280,
      y: 220,
      agentMode: AGENT_COMPILE,
      archetype: "finalizer",
      contextMode: "artifacts",
      readRunFiles: [`${CWD}/main.tex`, `${CWD}/build/revision-r2.md`],
      prompt: `Build final PDF ${CWD}/build/final.pdf and summary ${CWD}/build/final-deliverable.md. ${PATH_RULE}`,
      outputContract: `${CWD}/build/final.pdf`,
      artifacts: [
        art("final-pdf", "final.pdf", "pdf", `${CWD}/build/final.pdf`),
        art("final-md", "final-deliverable.md", "markdown", `${CWD}/build/final-deliverable.md`),
      ],
    }),
  ]

  const edges = [
    edge(`${ID}-e1`, "intake", "requirements", "artifacts"),
    edge(`${ID}-e2`, "requirements", "req-gate", "artifacts"),
    edge(`${ID}-e3`, "req-gate", "latex-scaffold", "artifacts"),
    edge(`${ID}-e4`, "latex-scaffold", "lit-survey", "artifacts", "branch"),
    edge(`${ID}-e5`, "latex-scaffold", "methodology", "artifacts", "branch"),
    edge(`${ID}-e6`, "lit-survey", "front-matter", "artifacts"),
    edge(`${ID}-e7`, "front-matter", "teaser-figure-spec", "artifacts"),
    edge(`${ID}-e8`, "methodology", "method-figure-spec", "artifacts"),
    edge(`${ID}-e9`, "teaser-figure-spec", "experiments", "artifacts", "merge"),
    edge(`${ID}-e10`, "method-figure-spec", "experiments", "artifacts", "merge"),
    edge(`${ID}-e11`, "experiments", "conclusion", "artifacts"),
    edge(`${ID}-e12`, "conclusion", "limitations", "artifacts"),
    edge(`${ID}-e13`, "limitations", "exp-figure-spec", "artifacts"),
    edge(`${ID}-e14`, "exp-figure-spec", "render-teaser", "artifacts", "branch"),
    edge(`${ID}-e15`, "exp-figure-spec", "render-method-fig", "artifacts", "branch"),
    edge(`${ID}-e16`, "exp-figure-spec", "render-exp-fig-1", "artifacts", "branch"),
    edge(`${ID}-e17`, "exp-figure-spec", "render-exp-fig-2", "artifacts", "branch"),
    edge(`${ID}-e18`, "exp-figure-spec", "layout-audit", "artifacts", "branch"),
    edge(`${ID}-e19`, "render-teaser", "humanizer-merge", "artifacts", "merge"),
    edge(`${ID}-e20`, "render-method-fig", "humanizer-merge", "artifacts", "merge"),
    edge(`${ID}-e21`, "render-exp-fig-1", "humanizer-merge", "artifacts", "merge"),
    edge(`${ID}-e22`, "render-exp-fig-2", "humanizer-merge", "artifacts", "merge"),
    edge(`${ID}-e23`, "layout-audit", "humanizer-merge", "artifacts", "merge"),
    edge(`${ID}-e24`, "humanizer-merge", "polish-gate", "artifacts"),
    ...[1, 2, 3, 4, 5].map((i) => edge(`${ID}-e-polish-r1-${i}`, "polish-gate", `reviewer-r1-${i}`, "artifacts", "branch")),
    ...[1, 2, 3, 4, 5].map((i) => edge(`${ID}-e-r1-merge-${i}`, `reviewer-r1-${i}`, "review-merge-r1", "artifacts", "merge")),
    edge(`${ID}-e25`, "review-merge-r1", "revision-r1", "artifacts"),
    ...[1, 2, 3, 4, 5].map((i) => edge(`${ID}-e-rev1-r2-${i}`, "revision-r1", `reviewer-r2-${i}`, "artifacts", "branch")),
    ...[1, 2, 3, 4, 5].map((i) => edge(`${ID}-e-r2-merge-${i}`, `reviewer-r2-${i}`, "review-merge-r2", "artifacts", "merge")),
    edge(`${ID}-e26`, "review-merge-r2", "revision-r2", "artifacts"),
    edge(`${ID}-e27`, "revision-r2", "final-deliver", "artifacts"),
  ]

  const reviewerR1 = [1, 2, 3, 4, 5].map((i) => `reviewer-r1-${i}`)
  const reviewerR2 = [1, 2, 3, 4, 5].map((i) => `reviewer-r2-${i}`)

  return {
    id: ID,
    name: "Paper Journal Default",
    description:
      "Default paper pipeline: intake → requirements gate → LaTeX scaffold → parallel front/method → body + figure specs → parallel render/layout → humanizer → 2×(5 reviewers → merge → revision) → final PDF.",
    workingDirectory: CWD,
    readDirectory: CWD,
    inputMounts: [
      { name: "idea", path: "inputs/idea.md" },
      { name: "experiments", path: "inputs/experiments.md" },
      { name: "journal", path: "inputs/journal-target.md" },
    ],
    defaultAgentId: "agent-paper",
    defaultAgentModeTemplateId: AGENT_PLANNER,
    defaultLlmApiTemplateId: LLM_TEXT,
    agentModeTemplateIds: [AGENT_PLANNER, AGENT_SECTION, AGENT_REVIEWER, AGENT_COMPILE],
    llmApiTemplateIds: [LLM_TEXT, LLM_IMAGE],
    stages: [{ id: STAGE, name: "Paper pipeline", color: COLOR, columnIds: columns.map((col) => col.id) }],
    columns,
    nodes,
    edges,
    loopEdges: [],
    branchGroups: [
      { id: `${ID}-b-front-method`, from: "latex-scaffold", to: ["lit-survey", "methodology"] },
      {
        id: `${ID}-b-figures`,
        from: "exp-figure-spec",
        to: ["render-teaser", "render-method-fig", "render-exp-fig-1", "render-exp-fig-2", "layout-audit"],
      },
      { id: `${ID}-b-r1`, from: "polish-gate", to: reviewerR1 },
      { id: `${ID}-b-r2`, from: "revision-r1", to: reviewerR2 },
    ],
    mergeGroups: [
      { id: `${ID}-m-body`, from: ["teaser-figure-spec", "method-figure-spec"], to: "experiments" },
      {
        id: `${ID}-m-figures`,
        from: ["render-teaser", "render-method-fig", "render-exp-fig-1", "render-exp-fig-2", "layout-audit"],
        to: "humanizer-merge",
      },
      { id: `${ID}-m-r1`, from: reviewerR1, to: "review-merge-r1" },
      { id: `${ID}-m-r2`, from: reviewerR2, to: "review-merge-r2" },
    ],
    sharedSessions: [],
    sessionGroups: {},
  }
}
