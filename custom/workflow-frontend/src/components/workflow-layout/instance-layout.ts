import type { WorkflowEdge, WorkflowNode, WorkflowTemplate } from "../../data/console-model"
import { CARD_H, CARD_W, NODE_SEP_X, NODE_SEP_Y } from "./constants"
import { anchorNodesToTopLeft, CANVAS_LAYOUT_ANCHOR } from "./layout-anchor"
import { arrangeWorkflowTemplateBySessions } from "./session-column-layout"

function boxesOverlap(a: WorkflowNode, b: WorkflowNode) {
  return Math.abs(a.x - b.x) < NODE_SEP_X && Math.abs(a.y - b.y) < NODE_SEP_Y
}

function resolveNodeCollisions(nodes: WorkflowNode[]) {
  const out = nodes.map((node) => ({ ...node }))
  let moved = true
  for (let pass = 0; pass < 10 && moved; pass++) {
    moved = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!
        const b = out[j]!
        if (!boxesOverlap(a, b)) continue
        b.y = a.y + NODE_SEP_Y
        moved = true
      }
    }
  }
  return out
}

/** Shift nodes so content starts at the canvas anchor. */
export function shiftNodesToCanvasOrigin(nodes: WorkflowNode[], paddingX = CANVAS_LAYOUT_ANCHOR.x, paddingY = CANVAS_LAYOUT_ANCHOR.y): WorkflowNode[] {
  return anchorNodesToTopLeft(nodes.map((node) => ({ ...node })))
}

function topologicalLayers(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const ids = new Set(nodes.map((node) => node.id))
  const inDegree = new Map<string, number>()
  for (const id of ids) inDegree.set(id, 0)
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  }
  const layers: string[][] = []
  let queue = [...ids].filter((id) => (inDegree.get(id) ?? 0) === 0)
  const visited = new Set<string>()
  while (queue.length) {
    layers.push(queue)
    const next: string[] = []
    for (const id of queue) {
      visited.add(id)
      for (const edge of edges.filter((item) => item.from === id)) {
        if (!ids.has(edge.to)) continue
        const degree = (inDegree.get(edge.to) ?? 0) - 1
        inDegree.set(edge.to, degree)
        if (degree === 0) next.push(edge.to)
      }
    }
    queue = next
  }
  if (visited.size < ids.size) return [nodes.map((node) => node.id)]
  return layers
}

/** Runtime instance layout: DAG layers packed from top-left of canvas (no stage columns). */
export function arrangeWorkflowInstance(template: WorkflowTemplate): WorkflowNode[] {
  const lookup = new Map(template.nodes.map((node) => [node.id, node]))
  const layers = topologicalLayers(template.nodes, template.edges)
  const startX = CANVAS_LAYOUT_ANCHOR.x + CARD_W / 2
  const startY = CANVAS_LAYOUT_ANCHOR.y + CARD_H / 2
  const placed = template.nodes.map((node) => ({ ...node }))

  layers.forEach((layer, layerIndex) => {
    const columnX = startX + layerIndex * (CARD_W + NODE_SEP_X)
    layer.forEach((nodeId, rowIndex) => {
      const node = lookup.get(nodeId)
      const placedNode = placed.find((item) => item.id === nodeId)
      if (!node || !placedNode) return
      placedNode.x = columnX
      placedNode.y = startY + rowIndex * NODE_SEP_Y
    })
  })

  return shiftNodesToCanvasOrigin(resolveNodeCollisions(placed))
}

/** Session-column layout for instances, anchored to canvas origin. */
export function arrangeWorkflowInstanceBySessions(template: WorkflowTemplate): WorkflowNode[] {
  return shiftNodesToCanvasOrigin(arrangeWorkflowTemplateBySessions(template))
}
