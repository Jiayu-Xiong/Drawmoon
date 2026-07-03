import type { WorkflowAction } from "../workflow-actions/types.js"
import type { AgentMode, AgentNodeConfig, WorkflowGraph, WorkflowNode } from "../schema/types.js"
import { DEFAULT_WORKFLOW_OUTPUT_CWD } from "../workflow-runs/node-output-files.js"

const sessionKey = "kiro-xuanhuan-plan"

function kiroChatArgs(agent: string, readFiles = false): string[] {
  const args = ["chat", "--no-interactive", "--wrap", "never"]
  if (readFiles) args.push("--trust-tools=fs_read")
  args.push("--agent", agent, "{{prompt}}")
  return args
}

function action(
  id: string,
  label: string,
  prompt: string,
  mode: AgentMode,
  agent: string,
  contextMode: AgentNodeConfig["contextMode"],
  sessionPolicy: AgentNodeConfig["sessionPolicy"],
  outputFile: string,
  timeoutMs = 240_000,
  readRunFiles?: string[],
  readFiles = false,
): WorkflowAction {
  return {
    id: `${id}-action`,
    kind: "agent-mode",
    label,
    inputs: { prompt },
    binding: { agentModeId: "kiro-default", providerId: "kiro" },
    overrides: {
      mode,
      customCommand: "kiro-cli",
      customArgs: kiroChatArgs(agent, readFiles),
    },
    session: sessionPolicy === "shared" ? { policy: "shared", sessionKey } : { policy: sessionPolicy ?? "fresh" },
    constraints: {},
    execution: { timeoutMs, allowWrites: false, maxIterations: 1 },
    output: { expectedFormat: "markdown", summaryPolicy: "brief" },
    metadata: { outputFile, readRunFiles },
  }
}

function node(
  id: string,
  label: string,
  prompt: string,
  mode: AgentMode,
  agent: string,
  contextMode: AgentNodeConfig["contextMode"],
  sessionPolicy: AgentNodeConfig["sessionPolicy"],
  outputFile: string,
  timeoutMs?: number,
  readRunFiles?: string[],
  readFiles = false,
): WorkflowNode {
  return {
    id,
    label,
    metadata: { outputFile, readRunFiles },
    config: {
      provider: "kiro",
      mode,
      cwd: DEFAULT_WORKFLOW_OUTPUT_CWD,
      prompt,
      contextMode,
      sessionPolicy,
      sessionKey: sessionPolicy === "shared" ? sessionKey : undefined,
      timeoutMs: timeoutMs ?? 240_000,
      allowFileWrites: false,
      maxIterations: 1,
      customCommand: "kiro-cli",
      customArgs: kiroChatArgs(agent, readFiles),
    },
    action: action(id, label, prompt, mode, agent, contextMode, sessionPolicy, outputFile, timeoutMs, readRunFiles, readFiles),
  }
}

const masterPlanPrompt = `你是一位玄幻小说策划编辑。请为一部原创玄幻小说制定四章连载计划。

硬性约束：
- 全书目标 20000 汉字（四章合计），每章约 5000 汉字。
- 类型：东方玄幻，修炼体系、势力冲突、主角成长弧线。
- 输出语言：简体中文。

请输出结构化计划，包含：
1. 书名与一句话梗概
2. 世界观与修炼体系（简洁）
3. 主要角色表
4. 四章分章大纲（标题、冲突、场景、章末钩子、每章 5000 字情节要点）
5. 伏笔清单与每章字数预算（每章 5000 字）

只输出计划正文，不要写小说章节，不要搜索或读取仓库文件。`

const chapterPrompt = (chapter: number, title: string) => `你是一位玄幻小说作者。

请先用 fs_read 完整阅读当前工作目录中的 master-plan.md，再撰写第 ${chapter} 章《${title}》。

要求：
- 简体中文小说正文，不要 Markdown 标题层级。
- 本章 4800-5200 汉字，情节完整，不要写摘要版。
- 严格遵循 master-plan.md 中第 ${chapter} 章大纲与字数预算。
- 不要引用其他章节内容，不要搜索仓库其它路径。
- 正文第一行写：【第 ${chapter} 章 ${title}】`

const finalReviewPrompt = `你是终审编辑。

任务：
1. 用 fs_read 完整阅读 master-plan.md 与 chapter-1.md 至 chapter-4.md。
2. 合并四章为连贯成稿，补过渡，统一称谓/境界/地名。
3. 核对逻辑一致性，修正明显矛盾。
4. 全书目标约 20000 汉字：若超出可略精炼，但不得删减主线与四章完整结构。
5. 输出最终交付稿（完整正文，非摘要）。

输出格式：
- 第一行：书名
- 第二行：100字内梗概
- 第三行起：目录（四章标题）
- 然后依次输出四章完整正文（保留【第N章】标记）`

export const kiroXuanhuanNovel4chGraph: WorkflowGraph = {
  nodes: [
    node("master-plan", "全书计划", masterPlanPrompt, "plan", "kiro_planner", "fresh", "shared", "master-plan.md", 300_000),
    node("chapter-1", "第一章", chapterPrompt(1, "尘缘初醒"), "agent", "kiro_default", "fresh", "fresh", "chapter-1.md", 600_000, undefined, true),
    node("chapter-2", "第二章", chapterPrompt(2, "秘境试锋"), "agent", "kiro_default", "fresh", "fresh", "chapter-2.md", 600_000, undefined, true),
    node("chapter-3", "第三章", chapterPrompt(3, "宗门暗涌"), "agent", "kiro_default", "fresh", "fresh", "chapter-3.md", 600_000, undefined, true),
    node("chapter-4", "第四章", chapterPrompt(4, "天命归途"), "agent", "kiro_default", "fresh", "fresh", "chapter-4.md", 600_000, undefined, true),
    node(
      "final-review",
      "终审输出",
      finalReviewPrompt,
      "review",
      "kiro_default",
      "fresh",
      "fresh",
      "final-novel.md",
      900_000,
      ["master-plan.md", "chapter-1.md", "chapter-2.md", "chapter-3.md", "chapter-4.md"],
      true,
    ),
  ],
  edges: [
    { from: "master-plan", to: "chapter-1", contextMode: "artifacts" },
    { from: "master-plan", to: "chapter-2", contextMode: "artifacts" },
    { from: "master-plan", to: "chapter-3", contextMode: "artifacts" },
    { from: "master-plan", to: "chapter-4", contextMode: "artifacts" },
    { from: "chapter-1", to: "final-review", contextMode: "artifacts" },
    { from: "chapter-2", to: "final-review", contextMode: "artifacts" },
    { from: "chapter-3", to: "final-review", contextMode: "artifacts" },
    { from: "chapter-4", to: "final-review", contextMode: "artifacts" },
  ],
  sessionGroups: {},
}

export const kiroXuanhuanNovel4chTemplate = {
  id: "kiro-xuanhuan-novel-4ch",
  version: "2.2.0",
  name: "KIRO 玄幻四章节小说",
  defaultLabel: "kiro-xuanhuan",
  labels: ["kiro", "novel", "xuanhuan", "parallel"],
  graph: kiroXuanhuanNovel4chGraph,
}
