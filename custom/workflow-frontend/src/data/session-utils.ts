import { executionAncestorIds } from "./execution-flow"
import type { NodeSessionBinding, WorkflowNode, WorkflowSharedSession, WorkflowTemplate } from "./console-model"
import type { TemplateStep } from "./workflow-template"

export function sessionBindingFromStep(step: TemplateStep): NodeSessionBinding | undefined {
  if (!step.sessionPolicy && !step.sessionKey && !step.bindsToNodeId && step.turnOrder == null) return undefined
  return {
    policy: step.sessionPolicy ?? (step.contextMode === "fresh" ? "shared" : "inherit"),
    sessionKey: step.sessionKey,
    bindsToNodeId: step.bindsToNodeId,
    turnOrder: step.turnOrder,
  }
}

export function nodesById(nodes: WorkflowNode[]): Map<string, WorkflowNode> {
  return new Map(nodes.map((node) => [node.id, node]))
}

export function resolveSessionKey(node: WorkflowNode, lookup: Map<string, WorkflowNode>): string | undefined {
  const session = node.session
  if (!session) return undefined
  if (session.sessionKey) return session.sessionKey
  if (session.bindsToNodeId) {
    const anchor = lookup.get(session.bindsToNodeId)
    if (anchor) return resolveSessionKey(anchor, lookup)
  }
  return undefined
}

function filterSessionNodesToExecutionFlow(template: Pick<WorkflowTemplate, "edges" | "nodes">, nodeIds: string[]) {
  const ordered = new Map(template.nodes.map((node, index) => [node.id, index]))
  const connected = new Set<string>()
  for (const nodeId of nodeIds) {
    const ancestors = executionAncestorIds(template, nodeId)
    ancestors.add(nodeId)
    for (const other of nodeIds) {
      if (other === nodeId) continue
      const otherAncestors = executionAncestorIds(template, other)
      if (ancestors.has(other) || otherAncestors.has(nodeId)) connected.add(other)
    }
    connected.add(nodeId)
  }
  return [...nodeIds]
    .filter((nodeId) => connected.has(nodeId))
    .sort((a, b) => (ordered.get(a) ?? 0) - (ordered.get(b) ?? 0))
}

export function buildSharedSessions(nodes: WorkflowNode[], template?: Pick<WorkflowTemplate, "edges" | "nodes">): WorkflowSharedSession[] {
  const lookup = nodesById(nodes)
  const groups = new Map<string, WorkflowNode[]>()

  for (const node of nodes) {
    const key = resolveSessionKey(node, lookup)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(node)
    groups.set(key, list)
  }

  const sessions: WorkflowSharedSession[] = []
  for (const [key, groupNodes] of groups) {
    const sorted = [...groupNodes].sort((a, b) => {
      const ao = a.session?.turnOrder ?? Number.MAX_SAFE_INTEGER
      const bo = b.session?.turnOrder ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return nodes.indexOf(a) - nodes.indexOf(b)
    })
    const anchorNodeId =
      sorted.find((node) => !node.session?.bindsToNodeId)?.id ??
      sorted.find((node) => node.session?.turnOrder === 1)?.id ??
      sorted[0]?.id
    if (!anchorNodeId) continue
    const anchor = lookup.get(anchorNodeId)
    const nodeIds = template
      ? filterSessionNodesToExecutionFlow(template, sorted.map((node) => node.id))
      : sorted.map((node) => node.id)
    if (!nodeIds.length) continue
    sessions.push({
      key,
      label: anchor?.name ?? key,
      anchorNodeId: nodeIds[0] ?? anchorNodeId,
      nodeIds,
    })
  }

  return sessions
}

export function sessionTurnLabel(node: WorkflowNode, lookup: Map<string, WorkflowNode>): string | null {
  const session = node.session
  if (!session) return null
  const parts: string[] = []
  if (session.turnOrder != null) parts.push(`#${session.turnOrder}`)
  if (session.bindsToNodeId) {
    const anchor = lookup.get(session.bindsToNodeId)
    parts.push(`→ ${anchor?.name ?? session.bindsToNodeId}`)
  } else if (session.sessionKey) {
    parts.push(session.sessionKey)
  }
  if (session.policy === "shared") parts.unshift("shared")
  return parts.length ? parts.join(" ") : null
}

export function sessionColumnLabel(node: WorkflowNode, template: WorkflowTemplate): string | null {
  const lookup = nodesById(template.nodes)
  const key = resolveSessionKey(node, lookup)
  if (!key) return null
  const sessions = template.sharedSessions ?? buildSharedSessions(template.nodes, template)
  const column = sessions.find((session) => session.key === key)
  const turn = node.session?.turnOrder != null ? `#${node.session.turnOrder}` : null
  if (column?.label && turn) return `${column.label} · ${turn}`
  return column?.label ?? sessionTurnLabel(node, lookup)
}

export function sessionThreadSummary(session: WorkflowSharedSession, lookup: Map<string, WorkflowNode>): string {
  return session.nodeIds
    .map((nodeId, index) => {
      const node = lookup.get(nodeId)
      const order = node?.session?.turnOrder ?? index + 1
      return `${order}:${node?.name ?? nodeId}`
    })
    .join(" -> ")
}
