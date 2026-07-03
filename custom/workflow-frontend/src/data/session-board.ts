import type { NodeSessionBinding, WorkflowNode, WorkflowSharedSession, WorkflowTemplate } from "./console-model"
import { buildSharedSessions, nodesById, resolveSessionKey } from "./session-utils"

export const ISOLATED_SESSION_KEY = "__isolated__"

export interface SessionColumnModel {
  key: string
  label: string
  anchorNodeId: string
  nodes: WorkflowNode[]
  session: WorkflowSharedSession
}

export function buildSessionColumns(
  nodes: WorkflowNode[],
  labelOverrides?: WorkflowSharedSession[],
  template?: Pick<WorkflowTemplate, "edges" | "nodes">,
): SessionColumnModel[] {
  const lookup = nodesById(nodes)
  const shared = buildSharedSessions(nodes, template)
  const labelMap = new Map((labelOverrides ?? []).map((session) => [session.key, session.label]))
  return shared.map((session) => ({
    key: session.key,
    label: labelMap.get(session.key) ?? session.label,
    anchorNodeId: session.anchorNodeId,
    nodes: session.nodeIds.map((id) => lookup.get(id)).filter((node): node is WorkflowNode => Boolean(node)),
    session: { ...session, label: labelMap.get(session.key) ?? session.label },
  }))
}

export function updateSessionColumnLabel(
  template: WorkflowTemplate,
  sessionKey: string,
  label: string,
): WorkflowTemplate {
  const base = template.sharedSessions ?? buildSharedSessions(template.nodes, template)
  const sharedSessions = base.map((session) => session.key === sessionKey ? { ...session, label } : session)
  return syncTemplateSharedSessions({ ...template, sharedSessions })
}

export function isolatedSessionNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.filter((node) => !resolveSessionKey(node, nodesById(nodes)))
}

export function slugifySessionKey(label: string) {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "")
  return slug || `session-${Date.now()}`
}

export function nextSessionKey(existing: string[], base: string) {
  if (!existing.includes(base)) return base
  let index = 2
  while (existing.includes(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

export function applySessionBinding(
  node: WorkflowNode,
  binding: NodeSessionBinding | undefined,
): WorkflowNode {
  if (!binding) {
    const { session: _session, ...rest } = node
    return rest
  }
  return { ...node, session: { ...binding } }
}

export function assignNodeToColumn(
  nodes: WorkflowNode[],
  nodeId: string,
  target: { kind: "isolated" } | { kind: "shared"; sessionKey: string; anchorNodeId: string },
): WorkflowNode[] {
  const lookup = nodesById(nodes)
  const node = lookup.get(nodeId)
  if (!node) return nodes

  if (target.kind === "isolated") {
    return nodes.map((entry) => entry.id === nodeId
      ? applySessionBinding(entry, undefined)
      : entry)
  }

  const isAnchor = nodeId === target.anchorNodeId
  const columnNodes = nodes.filter((entry) =>
    entry.id !== nodeId && resolveSessionKey(entry, lookup) === target.sessionKey)
  const maxTurn = columnNodes.reduce((max, entry) => Math.max(max, entry.session?.turnOrder ?? 0), 0)
  const turnOrder = isAnchor ? 1 : maxTurn + 1

  return nodes.map((entry) => {
    if (entry.id !== nodeId) return entry
    return applySessionBinding(entry, {
      policy: "shared",
      sessionKey: target.sessionKey,
      bindsToNodeId: isAnchor ? undefined : target.anchorNodeId,
      turnOrder,
    })
  })
}

export function createSharedSessionColumn(
  nodes: WorkflowNode[],
  anchorNodeId: string,
  label?: string,
): { nodes: WorkflowNode[]; sessionKey: string } {
  const lookup = nodesById(nodes)
  const anchor = lookup.get(anchorNodeId)
  if (!anchor) return { nodes, sessionKey: "" }

  const existingKeys = buildSharedSessions(nodes).map((session) => session.key)
  const base = slugifySessionKey(label ?? anchor.name)
  const sessionKey = nextSessionKey(existingKeys, base)

  const next = assignNodeToColumn(nodes, anchorNodeId, {
    kind: "shared",
    sessionKey,
    anchorNodeId,
  })

  return {
    nodes: next.map((node) => node.id === anchorNodeId
      ? applySessionBinding(node, {
        policy: "shared",
        sessionKey,
        turnOrder: 1,
      })
      : node),
    sessionKey,
  }
}

export function renameSessionColumn(
  nodes: WorkflowNode[],
  oldKey: string,
  nextKey: string,
  label?: string,
): WorkflowNode[] {
  const trimmed = nextKey.trim()
  if (!trimmed || trimmed === ISOLATED_SESSION_KEY) return nodes
  const lookup = nodesById(nodes)

  return nodes.map((node) => {
    const key = resolveSessionKey(node, lookup)
    if (key !== oldKey || !node.session) return node
    const next: WorkflowNode = {
      ...node,
      session: { ...node.session, sessionKey: trimmed },
    }
    if (label && node.id === buildSharedSessions(nodes).find((s) => s.key === oldKey)?.anchorNodeId) {
      next.name = label
    }
    return next
  })
}

export function syncTemplateSharedSessions(template: WorkflowTemplate): WorkflowTemplate {
  const sharedSessions = buildSharedSessions(template.nodes, template)
  return { ...template, sharedSessions }
}

export function reorderSessionTurn(
  nodes: WorkflowNode[],
  nodeId: string,
  turnOrder: number,
): WorkflowNode[] {
  return nodes.map((node) => node.id === nodeId && node.session
    ? { ...node, session: { ...node.session, turnOrder } }
    : node)
}
