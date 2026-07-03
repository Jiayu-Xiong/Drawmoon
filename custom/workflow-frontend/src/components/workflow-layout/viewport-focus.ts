import type { WorkflowNode } from "../../data/console-model"
import type { CanvasTransform, ViewportSize } from "./viewport-fit"

/** Pan/zoom so a single node sits near the center of the viewport. */
export function computeCanvasFocusOnNode(
  node: WorkflowNode,
  viewport: ViewportSize,
  currentScale?: number,
): CanvasTransform {
  const scale = currentScale ?? Math.min(1.05, Math.max(0.62, 0.82))
  return {
    scale,
    panX: viewport.width / 2 / scale - node.x,
    panY: viewport.height / 2 / scale - node.y,
  }
}
