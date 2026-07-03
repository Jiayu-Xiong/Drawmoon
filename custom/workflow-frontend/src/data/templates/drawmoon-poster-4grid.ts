import type { WorkflowEdge } from "@opencode-ai/backend-opencode/schema/types"
import type { WorkflowTemplate } from "../console-model"
import {
  convertBaseTemplate,
  providerAgentId,
  providerAgentModeTemplateId,
  providerLlmApiTemplateId,
} from "../template-converters"
import { buildSharedSessions, sessionBindingFromStep } from "../session-utils"
import { WorkflowTemplateBase, type TemplateStep } from "../workflow-template"

const CWD = "draw"
const TEMPLATE_ID = "drawmoon-poster-4grid"
const BRIEF_SESSION = "drawmoon-poster-brief"

function step(
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
  overrides: Partial<TemplateStep> = {},
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
    cacheFiles: ["draw/**/*.md", "draw/**/*.png"],
    contextFiles: ["draw/Drawmoon-四宫格插画简报.md"],
    x,
    y,
    status: "waiting",
    duration: "-",
    maxIterations: 1,
    allowFileWrites: false,
    sessionPolicy,
    sessionKey: sessionPolicy === "shared" ? BRIEF_SESSION : undefined,
    promptFile: outputFile,
    ...overrides,
  }
}

const repoStructurePrompt = `你是 Drawmoon（绘月）产品的技术文档分析员。请先了解本仓库与海报相关的代码与素材结构，再输出一份「海报创作上下文摘要」。

必读路径（用 read_file / 目录浏览）：
- draw/Drawmoon-四宫格插画简报.md
- draw/01-home.png … 04-cli-nodes.png（仅描述各图用途，不必解析像素）
- xy/custom/workflow-frontend/src/pages/console/（控制台 UI 结构）
- xy/custom/workflow-frontend/src/data/templates/（工作流模板如何定义）

输出 markdown，包含：
1. 产品一句话定位
2. 四张参考截图各自传达的信息（①首页 ②论文流 ③小说产出 ④节点CLI）
3. 与画布、节点、CLI 相关的 UI 关键词（供画师理解）
4. 本工作流后续节点应引用的文件清单

只输出分析文档，不生成画稿、不调用绘图工具。`

const artPlanPrompt = `你是绘月四宫格宣传画的视觉策划。基于上一步的「海报创作上下文摘要」与 draw/Drawmoon-四宫格插画简报.md，规划 2×2 四宫格每一格要画什么。

输出 art-plan.md，结构：
## 整体构图（1:1）
- 四格排布：①首页 ②论文 ③小说 ④CLI
- 共享视觉：暖奶油色、磨砂玻璃、水墨月意象

## 分格脚本（每格）
- 画面主体 / 次要元素 / 可省略的 UI 细节
- 建议中文标题与副标（各不超过 12 字）
- 参考截图：对应 01–04 哪张

## 画师禁忌
- 不要复刻真实路径与英文 ID
- 03 小说格只取长页顶部书卷感

不生成最终 Prompt，不写社交文案。`

const posterPromptInput = `你是海报 Prompt 工程师。综合 art-plan.md 与用户在对话中补充的要求（产品名 Drawmoon/绘月、受众、投放场景），撰写一份给画师或图像模型的「主 Prompt」。

输出 poster-prompt.md，包含：
1. **Master Prompt**（英文或中英混合，一段完整画面描述）
2. **Negative Prompt**（避免的元素）
3. **四格差异化要点**（每格 2–3 条 bullet，供并行格引用）
4. **用户可调参数区**：留白字段 [受众] [标语] [强调功能]

若用户尚未补充需求，在文档末尾列出 3 个需用户确认的问题。

不执行绘图。`

const panelPrompt = (index: number, title: string, ref: string, focus: string) => `你是第 ${index} 格专项画师助理。阅读 poster-prompt.md 与 art-plan.md 中关于「${title}」的章节。

参考截图语义：${ref}
本格重点：${focus}

输出 panel-${index}-brief.md：
- 本格构图草图说明（文字分镜）
- 元素清单与层次
- 推荐标注文案（标题/副标）
- 与本格对应的 Master Prompt 片段（可独立交给画师）

说明：本模板阶段只产出文字分镜与 Prompt 片段，不调用图像生成 API。`

const composeOutputPrompt = `你是终稿合成编辑。阅读 panel-1-brief.md … panel-4-brief.md 与 poster-prompt.md。

输出 poster-compose.md：
1. 四宫格合成检查清单（比例、缝隙、字号层级）
2. 四角/底部统一标语建议（从四格文案中择优）
3. 交付物列表：主图 PNG 规格、可选分层说明
4. 给画师的最后修改意见（≤5 条）

不生成图片文件。`

const copywritingPrompt = `你是绘月市场推广文案。基于 poster-compose.md 与 art-plan.md，撰写配套文案包 copywriting.md：

1. 主标题 + 副标题（各 3 备选）
2. 四宫格各格图注（微信九宫格/小红书用，各 ≤30 字）
3. 一段 80–120 字产品介绍
4. 三个 hashtag 建议

语气：温暖、创作工具感，避免「颠覆」「震撼」等空词。`

const steps: TemplateStep[] = [
  step("repo-structure", "了解代码结构", "梳理 draw 素材与控制台代码结构", repoStructurePrompt, "plan", "fresh", "fresh", 100, 300, "repo-structure.md"),
  step("art-plan", "规划画面", "四宫格分格脚本与视觉策划", artPlanPrompt, "plan", "summary", "shared", 280, 300, "art-plan.md"),
  step("poster-prompt", "海报 Prompt", "汇总用户输入，撰写主 Prompt", posterPromptInput, "chat", "inherit", "shared", 460, 300, "poster-prompt.md", { allowFileWrites: false }),
  step("panel-home", "格① 绘月首页", "并行：首页/品牌总览分镜", panelPrompt(1, "绘月首页", "01-home.png", "中控台、月意象、Dock 导航"), "agent", "artifacts", "fresh", 640, 120, "panel-1-brief.md"),
  step("panel-paper", "格② 论文工作流", "并行：论文模板编辑器分镜", panelPrompt(2, "论文工作流", "02-paper-workflow.png", "节点画布、LaTeX、阶段色带"), "agent", "artifacts", "fresh", 640, 240, "panel-2-brief.md"),
  step("panel-novel", "格③ 小说产出", "并行：小说成稿分镜", panelPrompt(3, "小说创作", "03-novel-output.png（取上部）", "章节标题、书卷、长篇交付"), "agent", "artifacts", "fresh", 640, 360, "panel-3-brief.md"),
  step("panel-cli", "格④ 节点与 CLI", "并行：节点状态页分镜", panelPrompt(4, "节点与 CLI", "04-cli-nodes.png", "卡片矩阵、CLI/API Tab、可观测"), "agent", "artifacts", "fresh", 640, 480, "panel-4-brief.md"),
  step("compose-poster", "合成输出", "四格合成规范与交付清单", composeOutputPrompt, "review", "summary", "fresh", 880, 300, "poster-compose.md", { allowFileWrites: false }),
  step("marketing-copy", "文案", "标题、图注、介绍与 hashtag", copywritingPrompt, "chat", "inherit", "fresh", 1060, 300, "copywriting.md"),
]

const edges: WorkflowEdge[] = [
  { from: "repo-structure", to: "art-plan", contextMode: "summary" },
  { from: "art-plan", to: "poster-prompt", contextMode: "summary" },
  { from: "poster-prompt", to: "panel-home", contextMode: "artifacts" },
  { from: "poster-prompt", to: "panel-paper", contextMode: "artifacts" },
  { from: "poster-prompt", to: "panel-novel", contextMode: "artifacts" },
  { from: "poster-prompt", to: "panel-cli", contextMode: "artifacts" },
  { from: "panel-home", to: "compose-poster", contextMode: "artifacts" },
  { from: "panel-paper", to: "compose-poster", contextMode: "artifacts" },
  { from: "panel-novel", to: "compose-poster", contextMode: "artifacts" },
  { from: "panel-cli", to: "compose-poster", contextMode: "artifacts" },
  { from: "compose-poster", to: "marketing-copy", contextMode: "summary" },
]

export class DrawmoonPoster4gridTemplate extends WorkflowTemplateBase {
  constructor() {
    super({
      id: TEMPLATE_ID,
      name: "绘月四宫格海报",
      description: "了解结构 → 规划画面 → 海报 Prompt → 四格并行分镜 → 合成说明 → 文案。规划模板，不绑定图像生成运行时。",
      cwd: CWD,
      cacheMode: "off",
      defaultSubagent: {
        provider: "opencode",
        mode: "plan",
        contextMode: "fresh",
        maxIterations: 1,
        allowFileWrites: false,
        systemPromptFile: "opencode://default",
        contextFiles: ["draw/Drawmoon-四宫格插画简报.md"],
      },
      steps,
      edges,
    })
  }
}

export const drawmoonPoster4gridTemplate = new DrawmoonPoster4gridTemplate()

function nodeFromStep(stepItem: TemplateStep, columnId: string, laneId: string): WorkflowTemplate["nodes"][number] {
  return {
    id: stepItem.id,
    name: stepItem.label,
    kind: "agent-mode",
    stageId: `${TEMPLATE_ID}-stage`,
    columnId,
    laneId,
    agentId: providerAgentId.opencode ?? "agent-paper",
    executionMode: "agent-mode",
    agentModeTemplateId: providerAgentModeTemplateId.opencode ?? "opencode-default-agent",
    llmApiTemplateId: providerLlmApiTemplateId.custom ?? "kuaipao-openai-chat",
    cliTemplateId: "opencode-cli",
    promptTitle: stepItem.label,
    promptPreview: stepItem.prompt.slice(0, 160),
    outputContract: stepItem.meaning,
    x: stepItem.x,
    y: stepItem.y,
    state: "waiting",
    session: sessionBindingFromStep(stepItem),
    runtimeOverrides: {
      contextMode: stepItem.contextMode,
      maxIterations: stepItem.maxIterations,
      workingDirectory: CWD,
    },
  }
}

/** 画布：调研 → 策划 → Prompt → 四格并行 → 合成 → 文案 */
export function buildDrawmoonPoster4gridUiTemplate(): WorkflowTemplate {
  const base = convertBaseTemplate(drawmoonPoster4gridTemplate)
  const stageId = `${TEMPLATE_ID}-stage`
  const columns = [
    { id: `${TEMPLATE_ID}-c-research`, name: "调研", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-research`, name: "structure", nodeIds: ["repo-structure"] }] },
    { id: `${TEMPLATE_ID}-c-plan`, name: "策划", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-plan`, name: "art", nodeIds: ["art-plan"] }] },
    { id: `${TEMPLATE_ID}-c-prompt`, name: "海报 Prompt", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-prompt`, name: "prompt", nodeIds: ["poster-prompt"] }] },
    {
      id: `${TEMPLATE_ID}-c-panels`,
      name: "四格并行",
      stageId,
      lanes: [
        { id: `${TEMPLATE_ID}-l-p1`, name: "格①首页", nodeIds: ["panel-home"] },
        { id: `${TEMPLATE_ID}-l-p2`, name: "格②论文", nodeIds: ["panel-paper"] },
        { id: `${TEMPLATE_ID}-l-p3`, name: "格③小说", nodeIds: ["panel-novel"] },
        { id: `${TEMPLATE_ID}-l-p4`, name: "格④CLI", nodeIds: ["panel-cli"] },
      ],
    },
    { id: `${TEMPLATE_ID}-c-compose`, name: "合成", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-compose`, name: "compose", nodeIds: ["compose-poster"] }] },
    { id: `${TEMPLATE_ID}-c-copy`, name: "文案", stageId, lanes: [{ id: `${TEMPLATE_ID}-l-copy`, name: "copy", nodeIds: ["marketing-copy"] }] },
  ]
  const nodes = [
    nodeFromStep(steps[0]!, columns[0]!.id, columns[0]!.lanes[0]!.id),
    nodeFromStep(steps[1]!, columns[1]!.id, columns[1]!.lanes[0]!.id),
    nodeFromStep(steps[2]!, columns[2]!.id, columns[2]!.lanes[0]!.id),
    nodeFromStep(steps[3]!, columns[3]!.id, columns[3]!.lanes[0]!.id),
    nodeFromStep(steps[4]!, columns[3]!.id, columns[3]!.lanes[1]!.id),
    nodeFromStep(steps[5]!, columns[3]!.id, columns[3]!.lanes[2]!.id),
    nodeFromStep(steps[6]!, columns[3]!.id, columns[3]!.lanes[3]!.id),
    nodeFromStep(steps[7]!, columns[4]!.id, columns[4]!.lanes[0]!.id),
    nodeFromStep(steps[8]!, columns[5]!.id, columns[5]!.lanes[0]!.id),
  ]
  return {
    ...base,
    stages: [{ id: stageId, name: base.name, color: "rgb(233,191,85)", columnIds: columns.map((column) => column.id) }],
    columns,
    nodes,
    edges: base.edges.map((edge) => ({
      ...edge,
      kind: edge.from === "poster-prompt" && edge.to.startsWith("panel-")
        ? "branch" as const
        : edge.to === "compose-poster" && edge.from.startsWith("panel-")
          ? "merge" as const
          : "normal" as const,
      color: edge.from === "poster-prompt" && edge.to.startsWith("panel-")
        ? "rgb(233,191,85)"
        : edge.to === "compose-poster" && edge.from.startsWith("panel-")
          ? "rgb(165,126,231)"
          : edge.color,
    })),
    branchGroups: [{ id: `${TEMPLATE_ID}-b-panels`, from: "poster-prompt", to: ["panel-home", "panel-paper", "panel-novel", "panel-cli"] }],
    mergeGroups: [{ id: `${TEMPLATE_ID}-m-panels`, from: ["panel-home", "panel-paper", "panel-novel", "panel-cli"], to: "compose-poster" }],
    sharedSessions: buildSharedSessions(nodes),
  }
}
