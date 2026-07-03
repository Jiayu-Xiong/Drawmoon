import type { WorkflowEdge } from "@opencode-ai/backend-opencode/schema/types"
import type { WorkflowArtifact, WorkflowTemplate } from "../console-model"
import { convertBaseTemplate, providerAgentId } from "../template-converters"
import { buildSharedSessions, sessionBindingFromStep } from "../session-utils"
import { WorkflowTemplateBase, type TemplateStep } from "../workflow-template"

const CWD = "workflow-output"
const TEMPLATE_ID = "opencode-xuanhuan-novel-4ch-image"
const PLAN_SESSION = "opencode-xuanhuan-book-plan"

const GPT55_API = "kuaipao-gpt-5-5"
const GPT55_MODEL = "gpt-5.5"
const DEEPSEEK_API = "deepseek-deepseek-v4-flash"
const DEEPSEEK_MODEL = "deepseek-v4-flash"
const IMAGE_API = "kuaipao-gpt-image-2"
const IMAGE_MODEL = "gpt-image-2"

const masterPlanPrompt = `You are the lead planner for an original eastern xuanhuan novel.

Write in Simplified Chinese. Produce a Markdown plan only, not prose chapters.

Hard constraints:
- Four chapters, total target under 20000 Chinese characters.
- Genre: eastern xuanhuan with a cultivation system, faction conflict, mystery, and protagonist growth arc.
- The four chapter nodes read master-plan.md via file handoff (not shared chat history).

Include: book title, one-sentence hook, worldbuilding, cultivation system, protagonist, antagonist, key supporting characters, four chapter outlines, foreshadowing/reveal table, tone guide, and cover-image keyword draft.`

const chapterPrompt = (chapter: number, titleHint: string) => `You are a chapter writer continuing from the planner context.

Write chapter ${chapter} in Simplified Chinese. Use this chapter title hint: ${titleHint}.

Requirements:
- Output chapter prose only.
- About 3500-5200 Chinese characters.
- Follow the plan, character names, power system, tone, and foreshadowing.
- First line must be a Markdown H1 chapter title in Chinese.
- End with a hook for the next chapter.
- Do not add explanations, bullet notes, metadata, or planning commentary.`

const finalReviewPrompt = `You are the final editor working in an isolated context.

Read master-plan.md, chapter-1.md, chapter-2.md, chapter-3.md, and chapter-4.md from the current working directory before writing.

Write in Simplified Chinese. Output in this exact order:

[IMAGE_PROMPT]
One Chinese paragraph of 100-200 characters for a vertical xuanhuan novel cover. It must be derived from the book title, protagonist, worldbuilding, central conflict, and ending mood. Include protagonist appearance, scene, colors, composition, and key visual symbols. Make it suitable for an image model.

# Final Manuscript
Merge the four chapters into a coherent final manuscript. Keep chapter titles. Unify names, setting details, foreshadowing, and tone. Do not summarize or omit chapters.`

const coverPrompt = `Use the [IMAGE_PROMPT] section from the upstream final-review output to generate one valid vertical xuanhuan novel cover image.

The image must reflect the protagonist, setting, central visual symbol, color palette, and mood from the book information. Keep it symbolic and non-violent: no gore, blood, wounds, dismemberment, active fighting, text, logos, watermarks, UI, or screenshots.`

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
  bindsToNodeId?: string,
  turnOrder?: number,
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
    maxIterations: mode === "agent" ? 2 : 1,
    allowFileWrites: true,
    sessionPolicy,
    sessionKey: id === "final-review" ? undefined : PLAN_SESSION,
    bindsToNodeId,
    turnOrder,
    promptFile: outputFile,
  }
}

function imageStep(id: string, label: string, x: number, y: number): TemplateStep {
  return {
    id,
    label,
    meaning: "LLM API image generation from the final review image prompt.",
    provider: "custom",
    mode: "chat",
    contextMode: "fresh",
    transport: "exit",
    prompt: coverPrompt,
    subagentFiles: [],
    cacheFiles: [],
    x,
    y,
    status: "waiting",
    duration: "-",
    maxIterations: 1,
    allowFileWrites: false,
    sessionPolicy: "fresh",
    promptFile: "cover-prompt.md",
  }
}

const steps: TemplateStep[] = [
  textStep("master-plan", "Book Plan", "IO planner + GPT-5.5, writes master-plan.md", masterPlanPrompt, "plan", "fresh", "fresh", 120, 220, "master-plan.md", undefined, 1),
  textStep("chapter-1", "Chapter 1", "OpenCode Chat + DeepSeek, reads master-plan.md", chapterPrompt(1, "Dust Oath Awakening"), "chat", "fresh", "fresh", 360, 60, "chapter-1.md", "master-plan", 2),
  textStep("chapter-2", "Chapter 2", "OpenCode Chat + DeepSeek, reads master-plan.md", chapterPrompt(2, "Secret Trial Blade"), "chat", "fresh", "fresh", 360, 180, "chapter-2.md", "master-plan", 3),
  textStep("chapter-3", "Chapter 3", "OpenCode Chat + DeepSeek, reads master-plan.md", chapterPrompt(3, "Sect Shadow Tide"), "chat", "fresh", "fresh", 360, 300, "chapter-3.md", "master-plan", 4),
  textStep("chapter-4", "Chapter 4", "OpenCode Chat + DeepSeek, reads master-plan.md", chapterPrompt(4, "Mandate Returns"), "chat", "fresh", "fresh", 360, 420, "chapter-4.md", "master-plan", 5),
  textStep("final-review", "Final Review + Image Prompt", "OpenCode Agent + GPT-5.5, isolated context, writes MD/HTML/PDF", finalReviewPrompt, "agent", "fresh", "fresh", 640, 220, "final-novel.md"),
  imageStep("generate-cover", "Generate Cover", 940, 220),
]

const edges: WorkflowEdge[] = [
  { from: "master-plan", to: "chapter-1", contextMode: "artifacts" },
  { from: "master-plan", to: "chapter-2", contextMode: "artifacts" },
  { from: "master-plan", to: "chapter-3", contextMode: "artifacts" },
  { from: "master-plan", to: "chapter-4", contextMode: "artifacts" },
  { from: "chapter-1", to: "final-review", contextMode: "artifacts" },
  { from: "chapter-2", to: "final-review", contextMode: "artifacts" },
  { from: "chapter-3", to: "final-review", contextMode: "artifacts" },
  { from: "chapter-4", to: "final-review", contextMode: "artifacts" },
  { from: "final-review", to: "generate-cover", contextMode: "artifacts" },
]

export class OpencodeXuanhuanNovel4chImageTemplate extends WorkflowTemplateBase {
  constructor() {
    super({
      id: TEMPLATE_ID,
      name: "OpenCode Xuanhuan Four-Chapter Novel + Cover",
      description: "Plan(GPT-5.5) -> 4 chapter chats(DeepSeek v4 Flash) -> final review(GPT-5.5 agent) -> cover image API.",
      cwd: CWD,
      cacheMode: "off",
      defaultSubagent: {
        provider: "opencode",
        mode: "chat",
        contextMode: "fresh",
        maxIterations: 1,
        allowFileWrites: true,
        systemPromptFile: "opencode://workflow-selected",
        contextFiles: [],
      },
      steps,
      edges,
    })
  }
}

export const opencodeXuanhuanNovel4chImageTemplate = new OpencodeXuanhuanNovel4chImageTemplate()

function hrefFor(fileName: string) {
  return `/workflow-output/runs/{runId}/${fileName}`
}

function artifact(id: string, label: string, kind: WorkflowArtifact["kind"], fileName: string): WorkflowArtifact {
  return { id, label, kind, path: `runs/{runId}/${fileName}`, href: hrefFor(fileName) }
}

function nodeFromStep(stepItem: TemplateStep, columnId: string, laneId: string): WorkflowTemplate["nodes"][number] {
  const isImage = stepItem.provider === "custom"
  const isPlan = stepItem.id === "master-plan"
  const isFinal = stepItem.id === "final-review"
  const isChapter = stepItem.id.startsWith("chapter-")
  const llmApiTemplateId = isImage ? IMAGE_API : isChapter ? DEEPSEEK_API : GPT55_API
  const model = isImage ? IMAGE_MODEL : isChapter ? DEEPSEEK_MODEL : GPT55_MODEL
  const agentModeTemplateId = isImage ? "direct-api" : isPlan ? "opencode-plan" : isFinal ? "opencode-default-agent" : "opencode-chat"
  const artifacts = isImage
    ? [artifact(`${stepItem.id}-img`, "generate-cover-1.png", "image", "generate-cover-1.png"), artifact(`${stepItem.id}-prompt`, "cover-prompt.md", "markdown", "cover-prompt.md")]
    : isFinal
      ? [
          artifact(`${stepItem.id}-md`, "final-novel.md", "markdown", "final-novel.md"),
          artifact(`${stepItem.id}-html`, "final-novel.html", "other", "final-novel.html"),
          artifact(`${stepItem.id}-pdf`, "final-novel.pdf", "pdf", "final-novel.pdf"),
        ]
      : [artifact(`${stepItem.id}-md`, stepItem.promptFile ?? `${stepItem.id}.md`, "markdown", stepItem.promptFile ?? `${stepItem.id}.md`)]

  return {
    id: stepItem.id,
    name: stepItem.label,
    kind: isImage ? "llm-step" : isPlan ? "plan" : isFinal ? "verify" : "agent-mode",
    stageId: `${TEMPLATE_ID}-stage`,
    columnId,
    laneId,
    agentId: isImage ? "agent-kuaipao" : (providerAgentId.opencode ?? "agent-paper"),
    executionMode: isImage ? "llm-api" : "agent-mode",
    modality: isImage ? "image" : "text",
    agentModeTemplateId,
    cliTemplateId: isImage ? "direct-api-cli" : "opencode-cli",
    runtimeMode: stepItem.mode,
    llmApiTemplateId,
    promptTitle: stepItem.label,
    promptPreview: stepItem.prompt,
    outputContract: stepItem.meaning,
    artifacts,
    x: stepItem.x,
    y: stepItem.y,
    state: "waiting",
    session: sessionBindingFromStep(stepItem),
    runtimeOverrides: {
      contextMode: stepItem.contextMode,
      maxIterations: stepItem.maxIterations,
      workingDirectory: CWD,
      model,
      responseFormat: isImage ? "text" : "markdown",
    },
  }
}

export function buildOpencodeXuanhuanNovel4chImageUiTemplate(): WorkflowTemplate {
  const base = convertBaseTemplate(opencodeXuanhuanNovel4chImageTemplate)
  const stageId = `${TEMPLATE_ID}-stage`
  const columns = [
    { id: `${TEMPLATE_ID}-c-plan`, name: "Plan", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-plan`, name: "plan", nodeIds: ["master-plan"] }] },
    {
      id: `${TEMPLATE_ID}-c-chapters`,
      name: "Parallel Chapters",
      stageId,
      lanes: [
        { id: `${TEMPLATE_ID}-l-ch1`, name: "chapter 1", nodeIds: ["chapter-1"] },
        { id: `${TEMPLATE_ID}-l-ch2`, name: "chapter 2", nodeIds: ["chapter-2"] },
        { id: `${TEMPLATE_ID}-l-ch3`, name: "chapter 3", nodeIds: ["chapter-3"] },
        { id: `${TEMPLATE_ID}-l-ch4`, name: "chapter 4", nodeIds: ["chapter-4"] },
      ],
    },
    { id: `${TEMPLATE_ID}-c-review`, name: "Final Review", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-review`, name: "review", nodeIds: ["final-review"] }] },
    { id: `${TEMPLATE_ID}-c-image`, name: "Cover API", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-image`, name: "image", nodeIds: ["generate-cover"] }] },
  ]
  const nodes = [
    nodeFromStep(steps[0]!, columns[0]!.id, columns[0]!.lanes[0]!.id),
    nodeFromStep(steps[1]!, columns[1]!.id, columns[1]!.lanes[0]!.id),
    nodeFromStep(steps[2]!, columns[1]!.id, columns[1]!.lanes[1]!.id),
    nodeFromStep(steps[3]!, columns[1]!.id, columns[1]!.lanes[2]!.id),
    nodeFromStep(steps[4]!, columns[1]!.id, columns[1]!.lanes[3]!.id),
    nodeFromStep(steps[5]!, columns[2]!.id, columns[2]!.lanes[0]!.id),
    nodeFromStep(steps[6]!, columns[3]!.id, columns[3]!.lanes[0]!.id),
  ]
  return {
    ...base,
    name: "OpenCode Xuanhuan Four-Chapter Novel + Cover",
    description: "Plan(GPT-5.5) -> 4 chapter chats(DeepSeek v4 Flash) -> final review(GPT-5.5 agent) -> cover image API.",
    defaultAgentModeTemplateId: "opencode-plan",
    defaultLlmApiTemplateId: GPT55_API,
    agentModeTemplateIds: ["opencode-plan", "opencode-chat", "opencode-default-agent"],
    llmApiTemplateIds: [GPT55_API, DEEPSEEK_API, IMAGE_API],
    stages: [{ id: stageId, name: base.name, color: "rgb(140,197,223)", columnIds: columns.map((c) => c.id) }],
    columns,
    nodes,
    edges: base.edges.map((edge) => ({
      ...edge,
      kind: edge.from === "master-plan" && edge.to.startsWith("chapter-") ? "branch" as const
        : edge.from.startsWith("chapter-") && edge.to === "final-review" ? "merge" as const
          : "normal" as const,
    })),
    branchGroups: [{ id: `${TEMPLATE_ID}-b1`, from: "master-plan", to: ["chapter-1", "chapter-2", "chapter-3", "chapter-4"] }],
    mergeGroups: [{ id: `${TEMPLATE_ID}-m1`, from: ["chapter-1", "chapter-2", "chapter-3", "chapter-4"], to: "final-review" }],
    sharedSessions: buildSharedSessions(nodes),
    sessionGroups: {},
  }
}
