import type { WorkflowNode, WorkflowTemplate } from "../../data/console-model"
import { CARD_H, CARD_W, NODE_SEP_X, NODE_SEP_Y } from "./constants"
import { anchorNodesToTopLeft } from "./layout-anchor"
import { computeWorkflowContentBounds } from "./viewport-fit"

const STAGE_PAD_X = 72
const STAGE_PAD_TOP = 84
const STAGE_PAD_BOTTOM = 58
const STAGE_GAP_X = 38
const STAGE_GAP_Y = 54
const COLUMN_GAP = 38
const INNER_NODE_GAP = 238
const LANE_GAP = 164

function boxesOverlap(a: WorkflowNode, b: WorkflowNode) {
  return Math.abs(a.x - b.x) < NODE_SEP_X && Math.abs(a.y - b.y) < NODE_SEP_Y
}

function layoutOverlapCount(nodes: WorkflowNode[]) {
  let overlaps = 0
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (boxesOverlap(nodes[i]!, nodes[j]!)) overlaps += 1
    }
  }
  return overlaps
}

function layoutFillScore(nodes: WorkflowNode[]) {
  if (!nodes.length) return 0
  const bounds = computeWorkflowContentBounds(nodes)
  const area = Math.max(bounds.width * bounds.height, 1)
  const used = nodes.length * CARD_W * CARD_H
  return Math.min(1, used / area)
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

function collectLaneNodeIds(template: WorkflowTemplate) {
  const ids = new Set<string>()
  for (const col of template.columns) {
    for (const lane of col.lanes) {
      for (const id of lane.nodeIds) ids.add(id)
    }
  }
  return ids
}

function placeGrid(nodes: WorkflowNode[], startX: number, startY: number, cols: number) {
  nodes.forEach((node, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    node.x = startX + col * INNER_NODE_GAP
    node.y = startY + row * LANE_GAP
  })
}

function estimateStageSize(template: WorkflowTemplate, stageId: string) {
  const stage = template.stages.find((item) => item.id === stageId)
  const columns = template.columns.filter((col) => col.stageId === stageId || stage?.columnIds.includes(col.id))
  if (!columns.length) return { width: STAGE_PAD_X * 2 + CARD_W, height: STAGE_PAD_TOP + STAGE_PAD_BOTTOM + CARD_H }
  let width = STAGE_PAD_X * 2
  let height = STAGE_PAD_TOP + STAGE_PAD_BOTTOM + CARD_H
  for (const col of columns) {
    const laneDepths = col.lanes.map((lane) => Math.max(1, lane.nodeIds.length) * LANE_GAP - (LANE_GAP - CARD_H))
    const colWidth = Math.max(CARD_W, col.lanes.length * INNER_NODE_GAP - (INNER_NODE_GAP - CARD_W))
    const colHeight = Math.max(CARD_H, ...laneDepths)
    width += colWidth + COLUMN_GAP
    height = Math.max(height, STAGE_PAD_TOP + STAGE_PAD_BOTTOM + colHeight)
  }
  return { width: width - COLUMN_GAP, height }
}

function placeWorkflowTemplate(template: WorkflowTemplate, stageSizes: Map<string, { width: number; height: number }>, wrapWidth: number) {
  const startX = 32
  const startY = 32
  let rowX = startX
  let rowY = startY
  let rowH = 0
  const placed = template.nodes.map((node) => ({ ...node }))
  const laneIds = collectLaneNodeIds(template)

  if (!laneIds.size) {
    const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(placed.length))))
    placeGrid(placed, startX, startY, cols)
    return anchorNodesToTopLeft(resolveNodeCollisions(placed))
  }

  for (const stage of template.stages) {
    const size = stageSizes.get(stage.id) ?? estimateStageSize(template, stage.id)
    if (rowX > startX && rowX + size.width > wrapWidth) {
      rowX = startX
      rowY += rowH + STAGE_GAP_Y
      rowH = 0
    }

    const columns = template.columns.filter((col) => col.stageId === stage.id || stage.columnIds.includes(col.id))
    let colX = rowX + STAGE_PAD_X
    for (const col of columns) {
      const colWidth = Math.max(CARD_W, col.lanes.length * INNER_NODE_GAP - (INNER_NODE_GAP - CARD_W))
      col.lanes.forEach((lane, laneIndex) => {
        lane.nodeIds.forEach((nodeId, nodeIndex) => {
          const node = placed.find((item) => item.id === nodeId)
          if (!node) return
          node.x = colX + laneIndex * INNER_NODE_GAP
          node.y = rowY + STAGE_PAD_TOP + nodeIndex * LANE_GAP
          node.stageId = stage.id
          node.columnId = col.id
          node.laneId = lane.id
        })
      })
      colX += colWidth + COLUMN_GAP
    }

    rowX += size.width + STAGE_GAP_X
    rowH = Math.max(rowH, size.height)
  }

  const laneNodes = placed.filter((node) => laneIds.has(node.id))
  const orphans = placed.filter((node) => !laneIds.has(node.id))
  if (orphans.length) {
    const bounds = computeWorkflowContentBounds(laneNodes.length ? laneNodes : placed)
    const anchorX = laneNodes.length ? bounds.maxX + INNER_NODE_GAP * 0.45 : startX
    const anchorY = laneNodes.length ? bounds.minY + CARD_H / 2 : startY
    const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(orphans.length))))
    placeGrid(orphans, anchorX, anchorY, cols)
  }

  return anchorNodesToTopLeft(resolveNodeCollisions(placed))
}

export { computeWorkflowContentBounds }

/** Stage/column aware auto layout for the canvas editor. */
export function arrangeWorkflowTemplate(template: WorkflowTemplate, viewport: { width: number; height: number }) {
  const aspect = viewport.width / Math.max(viewport.height, 1)
  const stageSizes = new Map(template.stages.map((stage) => [stage.id, estimateStageSize(template, stage.id)]))
  const totalStageWidth = template.stages.reduce((sum, stage) => sum + (stageSizes.get(stage.id)?.width ?? 0), 0) + STAGE_GAP_X * Math.max(0, template.stages.length - 1)
  const minWrap = Math.max(760, viewport.width * (aspect > 1.35 ? 0.94 : 0.82))
  const maxWrap = Math.max(minWrap, totalStageWidth)
  const targetAspect = aspect > 1.65 ? aspect * 1.18 : aspect * 1.08
  const candidates = Array.from(new Set([
    minWrap,
    viewport.width * 1.16,
    viewport.width * 1.38,
    viewport.width * 1.62,
    viewport.width * 1.92,
    maxWrap,
  ].map((value) => Math.round(Math.min(maxWrap, Math.max(minWrap, value))))))

  let best = placeWorkflowTemplate(template, stageSizes, candidates[0] ?? maxWrap)
  let bestScore = Number.NEGATIVE_INFINITY
  for (const wrap of candidates) {
    const placed = placeWorkflowTemplate(template, stageSizes, wrap)
    const bounds = computeWorkflowContentBounds(placed)
    const placedAspect = bounds.width / Math.max(bounds.height, 1)
    const targetAspect = viewport.width / Math.max(viewport.height, 1)
    const containScale = Math.min(viewport.width / bounds.width, viewport.height / bounds.height)
    const aspectScore = 1 / (1 + Math.abs(Math.log(placedAspect / targetAspect)))
    const fillScore = layoutFillScore(placed)
    const overlapPenalty = layoutOverlapCount(placed) * 0.35
    const score =
      aspectScore * 2.6
      + fillScore * 1.4
      + Math.min(containScale, 1) * 0.8
      - overlapPenalty
      - Math.max(0, bounds.height / viewport.height - 1.35) * 0.75
    if (score > bestScore) {
      best = placed
      bestScore = score
    }
  }
  return best
}
