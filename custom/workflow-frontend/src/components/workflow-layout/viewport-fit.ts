import type { WorkflowNode } from "../../data/console-model"
import { CARD_H, CARD_W } from "./constants"

export interface ViewportSize {
  width: number
  height: number
}

export interface ContentBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export interface CanvasTransform {
  scale: number
  panX: number
  panY: number
}

export function computeWorkflowContentBounds(nodes: WorkflowNode[]): ContentBounds {
  if (!nodes.length) {
    return { minX: 0, minY: 0, maxX: CARD_W + 160, maxY: CARD_H + 120, width: CARD_W + 160, height: CARD_H + 120 }
  }
  const minX = Math.min(...nodes.map((n) => n.x - CARD_W / 2 - 44))
  const maxX = Math.max(...nodes.map((n) => n.x + CARD_W / 2 + 44))
  const minY = Math.min(...nodes.map((n) => n.y - CARD_H / 2 - 56))
  const maxY = Math.max(...nodes.map((n) => n.y + CARD_H / 2 + 44))
  const width = Math.max(CARD_W + 80, maxX - minX)
  const height = Math.max(CARD_H + 80, maxY - minY)
  return { minX, minY, maxX, maxY, width, height }
}

export type CanvasFitMode = "contain" | "dense" | "anchor-top-left"

/** Pin workflow content top-left in the viewport (fixed zoom). Default editor fit. */
export function computeCanvasTransformAnchorTopLeft(
  nodes: WorkflowNode[],
  viewport: ViewportSize,
  preferredScale = 0.82,
): CanvasTransform {
  const bounds = computeWorkflowContentBounds(nodes)
  const margin = 16
  const scale = preferredScale
  return {
    scale,
    panX: margin / scale - bounds.minX,
    panY: margin / scale - bounds.minY,
  }
}

/** Fit workflow content into viewport; dense mode fills more of the screen. */
export function computeCanvasTransform(
  nodes: WorkflowNode[],
  viewport: ViewportSize,
  mode: CanvasFitMode = "contain",
): CanvasTransform {
  if (mode === "anchor-top-left") {
    return computeCanvasTransformAnchorTopLeft(nodes, viewport)
  }
  const bounds = computeWorkflowContentBounds(nodes)
  const margin = mode === "dense" ? 6 : 20
  const safeWidth = Math.max(180, viewport.width - margin * 2)
  const safeHeight = Math.max(180, viewport.height - margin * 2)
  const containScale = Math.min(safeWidth / bounds.width, safeHeight / bounds.height)
  const fillScale = Math.max(safeWidth / bounds.width, safeHeight / bounds.height)
  const aspect = viewport.width / Math.max(viewport.height, 1)
  const fillWeight = mode === "dense"
    ? (aspect > 1.4 ? 0.88 : aspect > 1.05 ? 0.78 : 0.65)
    : 0
  const mixedScale = containScale + (Math.min(fillScale, containScale * 2.1) - containScale) * fillWeight
  const scale = Math.max(0.12, Math.min(1.6, mixedScale))
  return {
    scale,
    panX: margin / scale - bounds.minX,
    panY: margin / scale - bounds.minY,
  }
}

export function scheduleCanvasFit(run: () => void) {
  if (typeof window === "undefined") {
    run()
    return
  }
  requestAnimationFrame(() => requestAnimationFrame(run))
}
