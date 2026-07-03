/**
 * Zero-token workflow template rebind: executorId / llmId / strategyId aliases,
 * migrate legacy direct-llm-* and executionMode llm-api → direct-api virtual agent.
 */

const DIRECT_API_MODE_ID = "direct-api"
const DIRECT_API_CLI_ID = "direct-api-cli"
const LEGACY_DIRECT = new Set(["direct-llm-chat", "direct-llm-image", "direct-llm-audio"])

type UiNode = Record<string, unknown>

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function rebindNode(node: UiNode): UiNode {
  const executionMode = str(node.executionMode)
  const modality = str(node.modality) || "text"
  let agentModeTemplateId = str(node.executorId) || str(node.agentModeTemplateId)
  let llmApiTemplateId = str(node.llmId) || str(node.llmApiTemplateId)
  let runtimeMode = str(node.strategyId) || str(node.runtimeMode)
  let cliTemplateId = str(node.cliTemplateId)
  let nextExecutionMode = executionMode || "agent-mode"

  if (LEGACY_DIRECT.has(agentModeTemplateId)) {
    agentModeTemplateId = DIRECT_API_MODE_ID
    cliTemplateId = DIRECT_API_CLI_ID
  }

  if (nextExecutionMode === "llm-api" || (modality === "image" && !agentModeTemplateId)) {
    nextExecutionMode = "agent-mode"
    if (!agentModeTemplateId || LEGACY_DIRECT.has(agentModeTemplateId)) {
      agentModeTemplateId = DIRECT_API_MODE_ID
      cliTemplateId = DIRECT_API_CLI_ID
    }
  }

  if (nextExecutionMode === "cli" && agentModeTemplateId) {
    nextExecutionMode = "agent-mode"
  }

  const next: UiNode = {
    ...node,
    executionMode: nextExecutionMode === "human-gate" ? "human-gate" : nextExecutionMode === "inquiry" ? "inquiry" : nextExecutionMode,
  }

  if (agentModeTemplateId) {
    next.agentModeTemplateId = agentModeTemplateId
    next.executorId = agentModeTemplateId
  }
  if (llmApiTemplateId) {
    next.llmApiTemplateId = llmApiTemplateId
    next.llmId = llmApiTemplateId
  }
  if (runtimeMode) {
    next.runtimeMode = runtimeMode
    next.strategyId = runtimeMode
  }
  if (cliTemplateId) next.cliTemplateId = cliTemplateId
  if (modality) next.modality = modality

  if (next.kind === "run-api" && !next.agentModeTemplateId) {
    next.kind = "run-cli"
    next.agentModeTemplateId = DIRECT_API_MODE_ID
    next.executorId = DIRECT_API_MODE_ID
    next.cliTemplateId = DIRECT_API_CLI_ID
  }

  return next
}

export function rebindWorkflowTemplateJson(template: Record<string, unknown>): Record<string, unknown> {
  const nodes = Array.isArray(template.nodes) ? (template.nodes as UiNode[]).map(rebindNode) : template.nodes
  const defaultAgentMode = str(template.defaultAgentModeTemplateId)
  const defaultLlm = str(template.defaultLlmApiTemplateId)

  return {
    ...template,
    nodes,
    ...(defaultAgentMode ? { defaultAgentModeTemplateId: defaultAgentMode } : {}),
    ...(defaultLlm ? { defaultLlmApiTemplateId: defaultLlm, defaultLlmId: defaultLlm } : {}),
    ...(defaultAgentMode ? { defaultExecutorId: defaultAgentMode } : {}),
  }
}
