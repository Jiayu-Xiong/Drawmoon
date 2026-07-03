import type { AgentRuntimeMode, WorkflowNode } from "./console-model"

/** Abstract binding IDs — aliases over legacy WorkflowNode fields (incremental migration). */
export type ExecutorBindingIds = {
  executorId: string
  llmId?: string
  strategyId: AgentRuntimeMode
}

export function readExecutorId(node: WorkflowNode): string | undefined {
  return node.executorId ?? node.agentModeTemplateId
}

export function readLlmId(node: WorkflowNode): string | undefined {
  return node.llmId ?? node.llmApiTemplateId
}

export function readStrategyId(node: WorkflowNode): AgentRuntimeMode | undefined {
  return node.strategyId ?? node.runtimeMode
}

export function withBindingIds(patch: Partial<WorkflowNode>): Partial<WorkflowNode> {
  const next = { ...patch }
  if (next.executorId !== undefined) next.agentModeTemplateId = next.executorId
  if (next.agentModeTemplateId !== undefined) next.executorId = next.agentModeTemplateId
  if (next.llmId !== undefined) next.llmApiTemplateId = next.llmId
  if (next.llmApiTemplateId !== undefined) next.llmId = next.llmApiTemplateId
  if (next.strategyId !== undefined) next.runtimeMode = next.strategyId
  if (next.runtimeMode !== undefined) next.strategyId = next.runtimeMode
  return next
}

export function normalizeBindingIdFields(node: WorkflowNode): WorkflowNode {
  return { ...node, ...withBindingIds(node) } as WorkflowNode
}

export function bindingIdsFromNode(node: WorkflowNode): ExecutorBindingIds | null {
  const executorId = readExecutorId(node)
  if (!executorId) return null
  return {
    executorId,
    llmId: readLlmId(node),
    strategyId: readStrategyId(node) ?? "chat",
  }
}
