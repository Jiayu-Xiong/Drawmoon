import type { NodeSessionBinding, WorkflowNode } from "./console-model"
import { syncTemplateSharedSessions } from "./session-board"
import type { WorkflowTemplate } from "./console-model"

export interface SessionGroupSpec {
  key: string
  label: string
  anchorId: string
  memberIds: string[]
}

/** Apply explicit shared-session columns to template nodes (anchor + turn order). */
export function applySessionGroups(nodes: WorkflowNode[], groups: SessionGroupSpec[]): WorkflowNode[] {
  const grouped = new Map<string, SessionGroupSpec>()
  for (const group of groups) {
    for (const id of group.memberIds) grouped.set(id, group)
  }

  return nodes.map((node) => {
    const group = grouped.get(node.id)
    if (!group) {
      const { session: _session, ...rest } = node
      return rest
    }

    const turnOrder = group.memberIds.indexOf(node.id) + 1
    const isAnchor = node.id === group.anchorId
    const binding: NodeSessionBinding = {
      policy: "shared",
      sessionKey: group.key,
      turnOrder,
      ...(isAnchor ? {} : { bindsToNodeId: group.anchorId }),
    }
    return { ...node, session: binding }
  })
}

export function withSessionGroups(template: WorkflowTemplate, groups: SessionGroupSpec[]): WorkflowTemplate {
  const nodes = applySessionGroups(template.nodes, groups)
  const sharedSessions = groups.map((group) => ({
    key: group.key,
    label: group.label,
    anchorNodeId: group.anchorId,
    nodeIds: group.memberIds.filter((id) => nodes.some((node) => node.id === id)),
  }))
  return syncTemplateSharedSessions({ ...template, nodes, sharedSessions })
}
