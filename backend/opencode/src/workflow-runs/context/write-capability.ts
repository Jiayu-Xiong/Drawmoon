import type { AgentNodeConfig, WorkflowNode } from "../../schema/types.js"
import type { NodeArchetype } from "./types.js"
import { applyArchetypeToConfig } from "./archetypes.js"
import { readNodeContextMeta } from "../planner-inquiry.js"

/** Keep write tools available when node must produce files; prefer system MCP for IO. */
export function ensureWriteCapability(config: AgentNodeConfig, archetype?: NodeArchetype): AgentNodeConfig {
  let next = applyArchetypeToConfig(config, archetype)
  const metaNeedsWrite = archetype === "planner" || archetype === "worker" || archetype === "merger" || archetype === "finalizer"
  const needsWrite = next.allowFileWrites === true || metaNeedsWrite

  if (!needsWrite) return next

  next = { ...next, allowFileWrites: true }
  const constraints = { ...(next.constraints ?? {}) }
  const allowed = new Set(constraints.allowedTools ?? ["artifact_link"])
  allowed.add("artifact_link")
  constraints.allowedTools = [...allowed]
  if (!constraints.forcedMcpServers?.length) {
    constraints.forcedMcpServers = archetype === "planner" || archetype === "reviewer"
      ? ["workflow-io", "workflow-web"]
      : ["workflow-io"]
  }
  next.constraints = constraints
  return next
}

export function readNodeArchetype(node: WorkflowNode): NodeArchetype | undefined {
  return readNodeContextMeta(node).archetype
}
