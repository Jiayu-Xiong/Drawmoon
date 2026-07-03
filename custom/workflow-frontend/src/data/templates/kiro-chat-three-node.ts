import type { WorkflowEdge } from "@opencode-ai/backend-opencode/schema/types"
import { WorkflowTemplateBase, type TemplateStep } from "../workflow-template"

import { backendOpencodeDir } from "../../lib/repo-paths"

const CWD = backendOpencodeDir()
const SESSION_KEY = "kiro-chat-three-node-session"

const steps: TemplateStep[] = [
  {
    id: "hello",
    label: "\u4f60\u597d",
    meaning: "Send the first KIRO chat prompt.",
    provider: "kiro",
    mode: "chat",
    contextMode: "fresh",
    transport: "belt",
    prompt: "\u4f60\u597d",
    subagentFiles: [],
    cacheFiles: [],
    customCommand: "kiro-cli",
    customArgs: ["chat", "--no-interactive", "--wrap", "never", "{{prompt}}"],
    x: 280,
    y: 220,
    status: "success",
    duration: "2s",
    maxIterations: 1,
    allowFileWrites: false,
    sessionPolicy: "shared",
    sessionKey: SESSION_KEY,
    turnOrder: 1,
  },
  {
    id: "intro",
    label: "\u81ea\u6211\u4ecb\u7ecd",
    meaning: "Ask KIRO to introduce itself in the shared chat context.",
    provider: "kiro",
    mode: "chat",
    contextMode: "inherit",
    transport: "belt",
    prompt: "\u8bf7\u7528\u4e2d\u6587\u505a\u4e00\u4e2a\u7b80\u77ed\u7684\u81ea\u6211\u4ecb\u7ecd\u3002",
    subagentFiles: [],
    cacheFiles: [],
    customCommand: "kiro-cli",
    customArgs: ["chat", "--no-interactive", "--wrap", "never", "{{prompt}}"],
    x: 620,
    y: 220,
    status: "success",
    duration: "7s",
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
    meaning: "Read the shared workflow chat history and return the first prior user message.",
    provider: "kiro",
    mode: "chat",
    contextMode: "inherit",
    transport: "exit",
    prompt: "\u8bf7\u67e5\u770b Prior user messages only \u5217\u8868\u3002\u7b2c 1 \u6761\u7684\u539f\u6587\u5185\u5bb9\u662f\u4ec0\u4e48\uff1f\u53ea\u56de\u7b54\u90a3\u53e5\u8bdd\u3002",
    subagentFiles: [],
    cacheFiles: [],
    customCommand: "kiro-cli",
    customArgs: ["chat", "--no-interactive", "--wrap", "never", "{{prompt}}"],
    x: 960,
    y: 220,
    status: "success",
    duration: "5s",
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

export class KiroChatThreeNodeTemplate extends WorkflowTemplateBase {
  constructor() {
    super({
      id: "kiro-chat-three-node",
      name: "KIRO Chat Three Node",
      description: "Three-node KIRO chat workflow with shared runtime session history.",
      cwd: CWD,
      cacheMode: "off",
      defaultSubagent: {
        provider: "kiro",
        mode: "chat",
        contextMode: "fresh",
        maxIterations: 1,
        allowFileWrites: false,
        systemPromptFile: "kiro://chat",
        contextFiles: [],
      },
      steps,
      edges,
    })
  }

  override toGraph() {
    const graph = super.toGraph()
    return {
      ...graph,
      sessionGroups: {},
      nodes: graph.nodes.map((node) => ({
        ...node,
        config: {
          ...node.config,
          sessionPolicy: "shared" as const,
          sessionKey: SESSION_KEY,
        },
      })),
    }
  }
}

export const kiroChatThreeNodeTemplate = new KiroChatThreeNodeTemplate()
