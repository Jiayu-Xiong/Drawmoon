import type { WorkflowAction } from "../workflow-actions/types.js"
import type { AgentNodeConfig, WorkflowGraph, WorkflowNode } from "../schema/types.js"

import { backendOpencodeDir } from "../lib/monorepo-paths.js"

const cwd = backendOpencodeDir(import.meta.url)
const sessionKey = "kiro-chat-three-node-session"

function action(id: string, label: string, prompt: string): WorkflowAction {
  return {
    id: `${id}-action`,
    kind: "agent-mode",
    label,
    inputs: { prompt },
    binding: { agentModeId: "kiro-default", providerId: "kiro" },
    overrides: {},
    session: { policy: "shared", sessionKey },
    constraints: {},
    execution: { timeoutMs: 120_000, allowWrites: false, maxIterations: 1 },
    output: { expectedFormat: "text", summaryPolicy: "brief" },
  }
}

function node(id: string, label: string, prompt: string, contextMode: AgentNodeConfig["contextMode"]): WorkflowNode {
  return {
    id,
    label,
    config: {
      provider: "kiro",
      mode: "chat",
      cwd,
      prompt,
      contextMode,
      sessionPolicy: "shared",
      sessionKey,
      timeoutMs: 120_000,
      allowFileWrites: false,
      maxIterations: 1,
    },
    action: action(id, label, prompt),
  }
}

export const kiroChatThreeNodeGraph: WorkflowGraph = {
  nodes: [
    node("hello", "\u4f60\u597d", "\u4f60\u597d", "fresh"),
    node("intro", "\u81ea\u6211\u4ecb\u7ecd", "\u8bf7\u7528\u4e2d\u6587\u505a\u4e00\u4e2a\u7b80\u77ed\u7684\u81ea\u6211\u4ecb\u7ecd\u3002", "inherit"),
    node("first-question", "\u6211\u7684\u7b2c\u4e00\u4e2a\u95ee\u9898\u662f\u4ec0\u4e48", "\u8bf7\u67e5\u770b Prior user messages only \u5217\u8868\u3002\u7b2c 1 \u6761\u7684\u539f\u6587\u5185\u5bb9\u662f\u4ec0\u4e48\uff1f\u53ea\u56de\u7b54\u90a3\u53e5\u8bdd\u3002", "inherit"),
  ],
  edges: [
    { from: "hello", to: "intro", contextMode: "inherit" },
    { from: "intro", to: "first-question", contextMode: "inherit" },
  ],
  sessionGroups: {},
}

export const kiroChatThreeNodeTemplate = {
  id: "kiro-chat-three-node",
  version: "1.0.0",
  name: "KIRO Chat Three Node",
  defaultLabel: "kiro-chat",
  labels: ["kiro", "chat", "smoke"],
  graph: kiroChatThreeNodeGraph,
}
