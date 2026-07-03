import { buildSessionColumns, isolatedSessionNodes } from "../../data/session-board"
import type { WorkflowNode, WorkflowTemplate } from "../../data/console-model"
import { CARD_H, CARD_W, NODE_SEP_X, NODE_SEP_Y, SESSION_COL_GAP, SESSION_ROW_GAP } from "./constants"
import { anchorNodesToTopLeft, CANVAS_LAYOUT_ANCHOR } from "./layout-anchor"

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

/** Place nodes in vertical stacks — one column per shared session thread. */
export function arrangeWorkflowTemplateBySessions(template: WorkflowTemplate): WorkflowNode[] {
  const placed = template.nodes.map((node) => ({ ...node }))
  const lookup = new Map(placed.map((node) => [node.id, node]))
  const columns = buildSessionColumns(template.nodes, template.sharedSessions)
  const isolated = isolatedSessionNodes(template.nodes)
  const startX = CANVAS_LAYOUT_ANCHOR.x + CARD_W / 2
  const startY = CANVAS_LAYOUT_ANCHOR.y + CARD_H / 2

  if (!columns.length && isolated.length) {
    const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(isolated.length))))
    isolated.forEach((node, index) => {
      const placedNode = lookup.get(node.id)
      if (!placedNode) return
      const col = index % cols
      const row = Math.floor(index / cols)
      placedNode.x = startX + col * SESSION_COL_GAP
      placedNode.y = startY + row * SESSION_ROW_GAP
    })
    return anchorNodesToTopLeft(resolveNodeCollisions(placed))
  }

  columns.forEach((column, columnIndex) => {
    column.nodes.forEach((node, rowIndex) => {
      const placedNode = lookup.get(node.id)
      if (!placedNode) return
      placedNode.x = startX + columnIndex * SESSION_COL_GAP
      placedNode.y = startY + rowIndex * SESSION_ROW_GAP
    })
  })

  const isolatedCols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, isolated.length)))))
  const isolatedX = startX + columns.length * SESSION_COL_GAP
  isolated.forEach((node, index) => {
    const placedNode = lookup.get(node.id)
    if (!placedNode) return
    const col = index % isolatedCols
    const row = Math.floor(index / isolatedCols)
    placedNode.x = isolatedX + col * (SESSION_COL_GAP * 0.62)
    placedNode.y = startY + row * SESSION_ROW_GAP
  })

  return anchorNodesToTopLeft(resolveNodeCollisions(placed))
}
