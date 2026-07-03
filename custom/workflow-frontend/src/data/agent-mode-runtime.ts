import type { AgentModeTemplate, NodeArchetype, RuntimeOverrides, WorkflowNode } from "./console-model"

/** Node override wins; otherwise agent-mode default (e.g. custom-io-planner → planner). */
export function resolveNodeArchetype(
  node: Pick<WorkflowNode, "runtimeOverrides">,
  agentMode?: AgentModeTemplate,
): NodeArchetype | undefined {
  return node.runtimeOverrides?.archetype ?? agentMode?.defaultRuntimeOverrides?.archetype
}

export function mergeAgentModeRuntimeDefaults(
  node: Pick<WorkflowNode, "runtimeOverrides">,
  agentMode?: AgentModeTemplate,
): RuntimeOverrides | undefined {
  const defaults = agentMode?.defaultRuntimeOverrides
  if (!defaults) return node.runtimeOverrides
  const merged: RuntimeOverrides = { ...defaults, ...(node.runtimeOverrides ?? {}) }
  return Object.keys(merged).length ? merged : undefined
}
