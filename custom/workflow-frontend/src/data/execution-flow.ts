import type { WorkflowTemplate } from "./console-model"

/** All upstream node ids along execution edges (DAG ancestors). */
export function executionAncestorIds(template: Pick<WorkflowTemplate, "edges" | "nodes">, nodeId: string): Set<string> {
  const ids = new Set(template.nodes.map((node) => node.id))
  const incoming = new Map<string, string[]>()
  for (const edge of template.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from])
  }
  const visited = new Set<string>()
  const queue = [...(incoming.get(nodeId) ?? [])]
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    queue.push(...(incoming.get(id) ?? []))
  }
  return visited
}

export function executionUpstreamNodeIds(template: WorkflowTemplate, nodeId: string): string[] {
  return [...executionAncestorIds(template, nodeId)]
}
