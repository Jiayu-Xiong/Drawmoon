import type { WorkflowAction } from "../workflow-actions/types.js"
import type { AgentNodeConfig, WorkflowGraph, WorkflowNode } from "../schema/types.js"
import { DEFAULT_WORKFLOW_OUTPUT_CWD } from "../workflow-runs/node-output-files.js"

const cwd = DEFAULT_WORKFLOW_OUTPUT_CWD
const planSessionKey = "opencode-xuanhuan-book-plan"

const gpt55Api = {
  id: "kuaipao-gpt-5-5",
  endpoint: "https://kuaipao.pro/v1",
  protocol: "openai-chat",
  model: "gpt-5.5",
  apiKeyEnv: "KUAIPAO_API_KEY",
  timeoutMs: 300_000,
}

const deepseekApi = {
  id: "deepseek-deepseek-v4-flash",
  endpoint: "https://api.deepseek.com/v1",
  protocol: "deepseek-chat",
  model: "deepseek-v4-flash",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  timeoutMs: 300_000,
}

const imageApi = {
  id: "kuaipao-gpt-image-2",
  endpoint: "https://kuaipao.pro/v1",
  protocol: "openai-chat",
  model: "gpt-image-2",
  apiKeyEnv: "KUAIPAO_CDK_1_API_KEY",
  timeoutMs: 600_000,
}

const planPrompt = `You are the lead planner for an original eastern xuanhuan novel.

Write in Simplified Chinese. Produce a Markdown plan only, not prose chapters.

Hard constraints:
- Four chapters, total target under 20000 Chinese characters.
- Genre: eastern xuanhuan with a cultivation system, faction conflict, mystery, and protagonist growth arc.
- The four chapter nodes will fork this planner context and use it as canon.

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

function agentAction(
  id: string,
  label: string,
  prompt: string,
  agentModeId: string,
  providerId: "opencode",
  mode: AgentNodeConfig["mode"],
  sessionPolicy: AgentNodeConfig["sessionPolicy"],
  llmApi: typeof gpt55Api | typeof deepseekApi,
  outputFile: string,
  readRunFiles?: string[],
  timeoutMs = 300_000,
): WorkflowAction {
  return {
    id: `${id}-action`,
    kind: "agent-mode",
    label,
    inputs: { prompt },
    binding: { agentModeId, providerId },
    overrides: { provider: providerId, mode, model: llmApi.model },
    session: { policy: sessionPolicy ?? "fresh", sessionKey: sessionPolicy === "shared" ? planSessionKey : undefined },
    constraints: {},
    execution: { timeoutMs, allowWrites: true, maxIterations: mode === "agent" ? 2 : 1 },
    output: { expectedFormat: "markdown", summaryPolicy: "brief" },
    metadata: {
      outputFile,
      readRunFiles,
      llmApi: { ...llmApi, responseFormat: "markdown" },
    },
  }
}

function agentNode(
  id: string,
  label: string,
  prompt: string,
  mode: AgentNodeConfig["mode"],
  agentModeId: string,
  contextMode: AgentNodeConfig["contextMode"],
  sessionPolicy: AgentNodeConfig["sessionPolicy"],
  llmApi: typeof gpt55Api | typeof deepseekApi,
  outputFile: string,
  readRunFiles?: string[],
  timeoutMs = 300_000,
): WorkflowNode {
  return {
    id,
    label,
    metadata: { outputFile, readRunFiles },
    config: {
      provider: "opencode",
      mode,
      cwd,
      prompt,
      contextMode,
      sessionPolicy,
      sessionKey: sessionPolicy === "shared" ? planSessionKey : undefined,
      timeoutMs,
      allowFileWrites: true,
      maxIterations: mode === "agent" ? 2 : 1,
      model: llmApi.model,
      llmApi,
    },
    action: agentAction(id, label, prompt, agentModeId, "opencode", mode, sessionPolicy, llmApi, outputFile, readRunFiles, timeoutMs),
  }
}

function imageNode(): WorkflowNode {
  return {
    id: "generate-cover",
    label: "Generate Cover",
    metadata: { outputFile: "cover-prompt.md" },
    config: {
      provider: "custom",
      mode: "chat",
      cwd,
      prompt: coverPrompt,
      contextMode: "fresh",
      sessionPolicy: "fresh",
      timeoutMs: 600_000,
      allowFileWrites: false,
      maxIterations: 1,
      modality: "image",
      model: imageApi.model,
      llmApi: imageApi,
    },
    action: {
      id: "generate-cover-action",
      kind: "llm-api",
      label: "Generate Cover",
      inputs: { prompt: coverPrompt },
      binding: { llmApiTemplateId: imageApi.id, providerId: "custom" },
      overrides: { provider: "custom", mode: "chat", model: imageApi.model },
      session: { policy: "fresh" },
      constraints: {},
      execution: { timeoutMs: 600_000, allowWrites: false, maxIterations: 1 },
      output: { expectedFormat: "image", summaryPolicy: "brief" },
      metadata: {
        modality: "image",
        outputFile: "cover-prompt.md",
        llmApi: imageApi,
      },
    },
  }
}

export const opencodeXuanhuanNovel4chImageGraph: WorkflowGraph = {
  nodes: [
    agentNode("master-plan", "Book Plan", planPrompt, "plan", "custom-io-planner", "fresh", "fresh", gpt55Api, "master-plan.md"),
    agentNode("chapter-1", "Chapter 1", chapterPrompt(1, "Dust Oath Awakening"), "chat", "opencode-chat", "fresh", "fresh", deepseekApi, "chapter-1.md", ["master-plan.md"]),
    agentNode("chapter-2", "Chapter 2", chapterPrompt(2, "Secret Trial Blade"), "chat", "opencode-chat", "fresh", "fresh", deepseekApi, "chapter-2.md", ["master-plan.md"]),
    agentNode("chapter-3", "Chapter 3", chapterPrompt(3, "Sect Shadow Tide"), "chat", "opencode-chat", "fresh", "fresh", deepseekApi, "chapter-3.md", ["master-plan.md"]),
    agentNode("chapter-4", "Chapter 4", chapterPrompt(4, "Mandate Returns"), "chat", "opencode-chat", "fresh", "fresh", deepseekApi, "chapter-4.md", ["master-plan.md"]),
    agentNode(
      "final-review",
      "Final Review + Image Prompt",
      finalReviewPrompt,
      "agent",
      "opencode-default-agent",
      "fresh",
      "fresh",
      gpt55Api,
      "final-novel.md",
      ["master-plan.md", "chapter-1.md", "chapter-2.md", "chapter-3.md", "chapter-4.md"],
      600_000,
    ),
    imageNode(),
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
    { from: "final-review", to: "generate-cover", contextMode: "artifacts" },
  ],
  sessionGroups: {},
}

export const opencodeXuanhuanNovel4chImageTemplate = {
  id: "opencode-xuanhuan-novel-4ch-image",
  version: "1.3.0",
  name: "OpenCode Xuanhuan Four-Chapter Novel + Cover",
  defaultLabel: "opencode-xuanhuan-novel-4ch-image",
  labels: ["opencode", "novel", "xuanhuan", "image"],
  graph: opencodeXuanhuanNovel4chImageGraph,
}
