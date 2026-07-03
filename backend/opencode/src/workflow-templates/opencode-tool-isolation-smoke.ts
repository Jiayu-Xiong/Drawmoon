import { defaultWorkflowCwd } from "../lib/monorepo-paths.js"

import type { WorkflowAction } from "../workflow-actions/types.js"
import type { WorkflowGraph, WorkflowNode } from "../schema/types.js"
import { ISOLATION_PROBE_NODE_PROMPT } from "../drawmoon/isolation-smoke-probes.js"

const cwd = defaultWorkflowCwd(import.meta.url)
const model = "deepseek-v4-flash"
const llmApi = {
  id: "deepseek-deepseek-v4-flash",
  endpoint: "https://api.deepseek.com/v1",
  protocol: "deepseek-chat",
  model,
  apiKeyEnv: "DEEPSEEK_API_KEY",
  timeoutMs: 120_000,
}

function action(
  id: string,
  label: string,
  prompt: string,
  agentModeId: string,
): WorkflowAction {
  return {
    id: `${id}-action`,
    kind: "agent-mode",
    label,
    inputs: { prompt },
    binding: { agentModeId, providerId: "opencode" },
    overrides: { model },
    session: { policy: "fresh" },
    execution: { timeoutMs: 180_000, allowWrites: false, maxIterations: 4 },
    output: { expectedFormat: "text", summaryPolicy: "brief" },
    metadata: { llmApi },
  }
}

function node(
  id: string,
  label: string,
  prompt: string,
  agentModeId: string,
): WorkflowNode {
  return {
    id,
    label,
    config: {
      provider: "opencode",
      mode: "chat",
      cwd,
      prompt,
      contextMode: "fresh",
      timeoutMs: 120_000,
      allowFileWrites: false,
      maxIterations: 4,
      model: `deepseek/${model}`,
      llmApi,
    },
    action: action(id, label, prompt, agentModeId),
  }
}

export const opencodeToolIsolationSmokeGraph: WorkflowGraph = {
  nodes: [
    node(
      "node-alpha",
      "Alpha Skill/MCP",
      ISOLATION_PROBE_NODE_PROMPT,
      "opencode-chat-isolation-alpha",
    ),
    node(
      "node-beta",
      "Beta Skill/MCP",
      ISOLATION_PROBE_NODE_PROMPT,
      "opencode-chat-isolation-beta",
    ),
  ],
  edges: [{ from: "node-alpha", to: "node-beta", contextMode: "fresh" }],
  sessionGroups: {},
}

export const opencodeToolIsolationSmokeTemplate = {
  id: "opencode-tool-isolation-smoke",
  version: "1.2.0",
  name: "OpenCode Tool Isolation Smoke",
  defaultLabel: "tool-isolation-smoke",
  labels: ["opencode", "deepseek", "skills", "mcp", "smoke", "agent-mode"],
  graph: opencodeToolIsolationSmokeGraph,
}
