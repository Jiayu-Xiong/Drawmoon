import type { WorkflowEdge } from "@opencode-ai/backend-opencode/schema/types"
import { WorkflowTemplateBase, type TemplateStep } from "../workflow-template"

import { defaultWorkflowCwd } from "../../lib/repo-paths"

const CWD = defaultWorkflowCwd()
const SESSION_KEY = "opencode-kuaipao-chat-three-node-session"
const MODEL = "kuaipao/gpt-5.5"

const steps: TemplateStep[] = [
  {
    id: "hello",
    label: "\u4f60\u597d",
    meaning: "Send the first official OpenCode chat prompt through the kuaipao provider.",
    provider: "opencode",
    mode: "chat",
    contextMode: "fresh",
    transport: "belt",
    prompt: "\u4f60\u597d",
    subagentFiles: [],
    cacheFiles: [],
    x: 280,
    y: 220,
    status: "waiting",
    duration: "-",
    maxIterations: 1,
    allowFileWrites: false,
    sessionPolicy: "shared",
    sessionKey: SESSION_KEY,
    turnOrder: 1,
  },
  {
    id: "intro",
    label: "\u81ea\u6211\u4ecb\u7ecd",
    meaning: "Continue the same native OpenCode session and ask for a short Chinese introduction.",
    provider: "opencode",
    mode: "chat",
    contextMode: "inherit",
    transport: "belt",
    prompt: "\u8bf7\u7528\u4e2d\u6587\u505a\u4e00\u4e2a\u7b80\u77ed\u7684\u81ea\u6211\u4ecb\u7ecd\u3002",
    subagentFiles: [],
    cacheFiles: [],
    x: 620,
    y: 220,
    status: "waiting",
    duration: "-",
    maxIterations: 1,
    allowFileWrites: false,
    sessionPolicy: "shared",
    sessionKey: SESSION_KEY,
    bindsToNodeId: "hello",
    turnOrder: 2,
  },
  {
    id: "first-question",
    label: "\u6211\u7684\u7b2c\u4e00\u4e2a\u95ee\u9898\u662f\u4ec0\u4e48",
    meaning: "Verify native OpenCode session continuity by asking it to recall the first user prompt.",
    provider: "opencode",
    mode: "chat",
    contextMode: "inherit",
    transport: "exit",
    prompt: "\u8bf7\u53ea\u6839\u636e\u672c\u6b21 OpenCode \u4f1a\u8bdd\u5386\u53f2\u56de\u7b54\uff1a\u6211\u7684\u7b2c\u4e00\u4e2a\u95ee\u9898\u662f\u4ec0\u4e48\uff1f\u53ea\u56de\u7b54\u90a3\u53e5\u8bdd\u3002",
    subagentFiles: [],
    cacheFiles: [],
    x: 960,
    y: 220,
    status: "waiting",
    duration: "-",
    maxIterations: 1,
    allowFileWrites: false,
    sessionPolicy: "shared",
    sessionKey: SESSION_KEY,
    bindsToNodeId: "hello",
    turnOrder: 3,
  },
]

const edges: WorkflowEdge[] = [
  { from: "hello", to: "intro", contextMode: "inherit" },
  { from: "intro", to: "first-question", contextMode: "inherit" },
]

export class OpencodeKuaipaoChatThreeNodeTemplate extends WorkflowTemplateBase {
  constructor() {
    super({
      id: "opencode-kuaipao-chat-three-node",
      name: "OpenCode Kuaipao Chat Three Node",
      description: "Three-step official OpenCode chat workflow using the kuaipao OpenAI-compatible API.",
      cwd: CWD,
      cacheMode: "off",
      defaultSubagent: {
        provider: "opencode",
        mode: "chat",
        contextMode: "fresh",
        maxIterations: 1,
        allowFileWrites: false,
        systemPromptFile: "opencode://chat-kuaipao",
        contextFiles: [],
      },
      steps,
      edges,
    })
  }

  override toNodeConfig(step: TemplateStep) {
    return {
      ...super.toNodeConfig(step),
      sessionPolicy: "shared" as const,
      sessionKey: SESSION_KEY,
      model: MODEL,
    }
  }

  override toGraph() {
    return {
      ...super.toGraph(),
      sessionGroups: {},
    }
  }
}

export const opencodeKuaipaoChatThreeNodeTemplate = new OpencodeKuaipaoChatThreeNodeTemplate()