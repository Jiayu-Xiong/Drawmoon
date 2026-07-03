import { defaultWorkflowCwd } from "../lib/monorepo-paths.js"

import type { WorkflowAction } from "../workflow-actions/types.js"
import type { AgentNodeConfig, WorkflowGraph, WorkflowNode } from "../schema/types.js"

const cwd = defaultWorkflowCwd(import.meta.url)
const sessionKey = "opencode-kuaipao-chat-three-node-session"
const model = "gpt-5.5"
const llmApi = {
  id: "kuaipao-gpt-5-5",
  endpoint: "https://kuaipao.pro/v1",
  protocol: "openai-chat",
  model,
  apiKeyEnv: "KUAIPAO_API_KEY",
  timeoutMs: 300_000,
}

function action(id: string, label: string, prompt: string): WorkflowAction {
  return {
    id: `${id}-action`,
    kind: "agent-mode",
    label,
    inputs: { prompt },
    binding: { agentModeId: "opencode-chat", providerId: "opencode" },
    overrides: { model },
    session: { policy: "shared", sessionKey },
    constraints: {},
    execution: { timeoutMs: 300_000, allowWrites: false, maxIterations: 1 },
    output: { expectedFormat: "text", summaryPolicy: "brief" },
    metadata: { llmApi },
  }
}

function node(id: string, label: string, prompt: string, contextMode: AgentNodeConfig["contextMode"]): WorkflowNode {
  return {
    id,
    label,
    config: {
      provider: "opencode",
      mode: "chat",
      cwd,
      prompt,
      contextMode,
      sessionPolicy: "shared",
      sessionKey,
      timeoutMs: 300_000,
      allowFileWrites: false,
      maxIterations: 1,
      model,
      llmApi,
    },
    action: action(id, label, prompt),
  }
}

export const opencodeKuaipaoChatThreeNodeGraph: WorkflowGraph = {
  nodes: [
    node("hello", "\u4f60\u597d", "\u4f60\u597d", "fresh"),
    node("intro", "\u81ea\u6211\u4ecb\u7ecd", "\u8bf7\u7528\u4e2d\u6587\u505a\u4e00\u4e2a\u7b80\u77ed\u7684\u81ea\u6211\u4ecb\u7ecd\u3002", "inherit"),
    node("first-question", "\u6211\u7684\u7b2c\u4e00\u4e2a\u95ee\u9898\u662f\u4ec0\u4e48", "\u8bf7\u53ea\u6839\u636e\u672c\u6b21 OpenCode \u4f1a\u8bdd\u5386\u53f2\u56de\u7b54\uff1a\u6211\u7684\u7b2c\u4e00\u4e2a\u95ee\u9898\u662f\u4ec0\u4e48\uff1f\u53ea\u56de\u7b54\u90a3\u53e5\u8bdd\u3002", "inherit"),
  ],
  edges: [
    { from: "hello", to: "intro", contextMode: "inherit" },
    { from: "intro", to: "first-question", contextMode: "inherit" },
  ],
  sessionGroups: {},
}

export const opencodeKuaipaoChatThreeNodeTemplate = {
  id: "opencode-kuaipao-chat-three-node",
  version: "1.0.0",
  name: "OpenCode Kuaipao Chat Three Node",
  defaultLabel: "opencode-kuaipao-chat",
  labels: ["opencode", "kuaipao", "chat", "smoke"],
  graph: opencodeKuaipaoChatThreeNodeGraph,
}
