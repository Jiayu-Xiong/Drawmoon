import type { AgentModeTemplate, NodeToolConstraints, WorkflowNode } from "./console-model"

type ConstraintKey =
  | "forcedSkills"
  | "allowedSkills"
  | "forcedMcpServers"
  | "allowedMcpServers"
  | "forcedTools"
  | "allowedTools"

function pickCategory(base: NodeToolConstraints, over: NodeToolConstraints, forcedKey: ConstraintKey, allowedKey: ConstraintKey) {
  const forced = over[forcedKey]
  const allowed = over[allowedKey]
  if (forced !== undefined) {
    return {
      [forcedKey]: forced.length ? [...forced] : [],
      [allowedKey]: undefined,
    } as Pick<NodeToolConstraints, typeof forcedKey | typeof allowedKey>
  }
  if (allowed !== undefined) {
    return {
      [forcedKey]: undefined,
      [allowedKey]: allowed.length ? [...allowed] : [],
    } as Pick<NodeToolConstraints, typeof forcedKey | typeof allowedKey>
  }
  return {
    [forcedKey]: base[forcedKey]?.length ? [...base[forcedKey]!] : undefined,
    [allowedKey]: base[allowedKey]?.length ? [...base[allowedKey]!] : undefined,
  } as Pick<NodeToolConstraints, typeof forcedKey | typeof allowedKey>
}

/** Merge agent-mode defaults with per-node overrides; node lists replace agent lists when set. */
export function resolveNodeToolConstraints(node: WorkflowNode, agentMode?: AgentModeTemplate): NodeToolConstraints {
  const base: NodeToolConstraints = { ...(agentMode?.constraints ?? {}) }
  if (!base.allowedTools?.length && agentMode?.allowedTools?.length) {
    base.allowedTools = [...agentMode.allowedTools]
  }
  const over = node.toolConstraints
  if (!over) return base

  return {
    ...pickCategory(base, over, "forcedSkills", "allowedSkills"),
    ...pickCategory(base, over, "forcedMcpServers", "allowedMcpServers"),
    ...pickCategory(base, over, "forcedTools", "allowedTools"),
  }
}

export function hasToolConstraints(constraints: NodeToolConstraints) {
  return Object.values(constraints).some((value) => Array.isArray(value) && value.length > 0)
}
