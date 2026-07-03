import type { WorkflowNode } from "../../data/console-model"
import { CARD_H, CARD_W } from "./constants"

/** Top-left anchor for the first node card (matches stage autolayout origin). */
export const CANVAS_LAYOUT_ANCHOR = { x: 32, y: 32 }

/** Shift nodes so the top-left of the bounding box sits at CANVAS_LAYOUT_ANCHOR. */
export function anchorNodesToTopLeft(nodes: WorkflowNode[]): WorkflowNode[] {
  if (!nodes.length) return nodes
  const minX = Math.min(...nodes.map((node) => node.x - CARD_W / 2))
  const minY = Math.min(...nodes.map((node) => node.y - CARD_H / 2))
  const dx = CANVAS_LAYOUT_ANCHOR.x - minX
  const dy = CANVAS_LAYOUT_ANCHOR.y - minY
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return nodes.map((node) => ({ ...node }))
  return nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }))
}
