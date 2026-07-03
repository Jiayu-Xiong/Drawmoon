import { createEffect, createMemo, For, onCleanup, Show } from "solid-js"
import type { WorkflowEdge, WorkflowNode, WorkflowTemplate } from "../data/console-model"
import type { NodeBindingHealth } from "../data/node-binding-health"
import { getAgentModeTemplate } from "../data/template-registry"
import { nodesById, sessionTurnLabel } from "../data/session-utils"
import { CARD_H, CARD_W } from "./workflow-layout/constants"
import { arrangeWorkflowTemplate, computeWorkflowContentBounds } from "./workflow-layout/stage-layout"
import { Icon, type IconName } from "./Icon"

function nodeStateClass(state?: string) {
  return `state-${state ?? "waiting"}`
}

export { arrangeWorkflowTemplate, computeWorkflowContentBounds }
const CW = CARD_W / 2
const CH = CARD_H / 2
const AH = 18
const AH2 = 10
const PAD_R = 180
const PAD_B = 140
type EdgeDir = "right" | "left" | "down" | "up"
type PortAxis = "x" | "y"
type PortInfo = {
  sourceKey: string
  targetKey: string
  axis: PortAxis
}

const nodeIcons: Record<string, IconName> = {
  input: "import",
  plan: "template",
  route: "branch",
  "run-cli": "system",
  "parallel-tools": "workflow",
  merge: "merge",
  verify: "status",
  summarize: "template",
  output: "export",
  "agent-mode": "agent",
  condition: "branch",
  loop: "loop",
  "tool-step": "settings",
  "llm-step": "api",
}

function executorTag(node: WorkflowNode) {
  if (node.executionMode === "tool") return "tool"
  if (node.executionMode === "human-gate") return "human-gate"
  if (node.executionMode === "inquiry") return "inquiry"
  return getAgentModeTemplate(node.agentModeTemplateId)?.name ?? node.executionMode ?? "agent-mode"
}

function edgeFlowClass(annotation?: string) {
  if (annotation === "active") return "wf-edge-flow--active"
  if (annotation === "done") return "wf-edge-flow--done"
  return "wf-edge-flow--waiting"
}

function edgeFill(color: string) {
  if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", ", 0.58)")
  if (color.startsWith("rgba(")) return color.replace(/,\s*[\d.]+\)$/, ", 0.58)")
  return color
}

function edgePortInfo(nodeById: Map<string, WorkflowNode>, edge: Pick<WorkflowEdge, "from" | "to">): PortInfo | undefined {
  const a = nodeById.get(edge.from)
  const b = nodeById.get(edge.to)
  if (!a || !b) return undefined
  const dx = b.x - a.x
  const dy = b.y - a.y
  const useH = Math.abs(dx) * CH > Math.abs(dy) * CW
  if (useH) {
    return {
      sourceKey: `${edge.from}:${dx >= 0 ? "right" : "left"}`,
      targetKey: `${edge.to}:${dx >= 0 ? "left" : "right"}`,
      axis: "y",
    }
  }
  return {
    sourceKey: `${edge.from}:${dy >= 0 ? "down" : "up"}`,
    targetKey: `${edge.to}:${dy >= 0 ? "up" : "down"}`,
    axis: "x",
  }
}

function centeredOffsets(count: number) {
  const step = 18
  const mid = (count - 1) / 2
  return Array.from({ length: count }, (_, index) => (index - mid) * step)
}

function edgeSegment(nodeById: Map<string, WorkflowNode>, edge: Pick<WorkflowEdge, "from" | "to" | "kind">, sourceOffset = 0, targetOffset = 0) {
  const a = nodeById.get(edge.from)
  const b = nodeById.get(edge.to)
  if (!a || !b) return { d: "", ad: "", hd: "" }
  const dx = b.x - a.x
  const dy = b.y - a.y
  const useH = Math.abs(dx) * CH > Math.abs(dy) * CW
  const dir: EdgeDir = useH ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up")
  const pts: Record<EdgeDir, { sx: number; sy: number; ex: number; ey: number }> = {
    right: { sx: a.x + CW, sy: a.y, ex: b.x - CW, ey: b.y },
    left: { sx: a.x - CW, sy: a.y, ex: b.x + CW, ey: b.y },
    down: { sx: a.x, sy: a.y + CH, ex: b.x, ey: b.y - CH },
    up: { sx: a.x, sy: a.y - CH, ex: b.x, ey: b.y + CH },
  }
  const p = pts[dir]
  if (useH) {
    p.sy += sourceOffset
    p.ey += targetOffset
  } else {
    p.sx += sourceOffset
    p.ex += targetOffset
  }

  if (edge.kind === "loop") {
    const ly = Math.max(a.y, b.y) + 170
    return {
      d: `M ${p.sx} ${p.sy} C ${p.sx + 120} ${ly}, ${p.ex - 120} ${ly}, ${p.ex} ${p.ey}`,
      ad: `M ${p.ex - 18} ${p.ey} L ${p.ex} ${p.ey}`,
      hd: `M ${p.ex} ${p.ey} L ${p.ex - 18} ${p.ey - 10} L ${p.ex - 18} ${p.ey + 10} Z`,
    }
  }

  if (useH) {
    const gap = Math.abs(dx) - CW * 2
    const dir2 = dx >= 0 ? 1 : -1
    const al = gap < AH * 2 ? AH * 2 : AH
    const tx = p.ex - dir2 * al
    const cx = Math.max(140, gap / 2)
    return {
      d: `M ${p.sx} ${p.sy} C ${p.sx + dir2 * cx} ${p.sy}, ${p.ex - dir2 * cx} ${p.ey}, ${tx} ${p.ey}`,
      ad: `M ${tx} ${p.ey} L ${p.ex - dir2 * AH} ${p.ey}`,
      hd: `M ${p.ex} ${p.ey} L ${p.ex - dir2 * AH} ${p.ey - AH2} L ${p.ex - dir2 * AH} ${p.ey + AH2} Z`,
    }
  }

  const gap = Math.abs(dy) - CH * 2
  const dir2 = dy >= 0 ? 1 : -1
  const al = gap < AH * 2 ? AH * 2 : AH
  const ty = p.ey - dir2 * al
  const cy = Math.max(120, gap / 2)
  return {
    d: `M ${p.sx} ${p.sy} C ${p.sx} ${p.sy + dir2 * cy}, ${p.ex} ${p.ey - dir2 * cy}, ${p.ex} ${ty}`,
    ad: `M ${p.ex} ${ty} L ${p.ex} ${p.ey - dir2 * AH}`,
    hd: `M ${p.ex} ${p.ey} L ${p.ex - AH2} ${p.ey - dir2 * AH} L ${p.ex + AH2} ${p.ey - dir2 * AH} Z`,
  }
}

export function computeWorkflowExtent(nodes: WorkflowNode[]) {
  if (!nodes.length) return { w: 1200, h: 800, cx: 600, cy: 400 }
  const minX = Math.min(...nodes.map(n => n.x - CARD_W / 2 - 80))
  const maxX = Math.max(...nodes.map(n => n.x + CARD_W / 2 + 80))
  const minY = Math.min(...nodes.map(n => n.y - CARD_H / 2 - 90))
  const maxY = Math.max(...nodes.map(n => n.y + CARD_H / 2 + 80))
  const w = Math.max(1200, maxX + PAD_R, maxX - minX + PAD_R * 2)
  const h = Math.max(800, maxY + PAD_B, maxY - minY + PAD_B * 2)
  return { w, h, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

function computeBands(template: WorkflowTemplate) {
  return template.stages.map(stage => {
    const nodes = template.nodes.filter(node => node.stageId === stage.id)
    if (!nodes.length) return { ...stage, l: 0, t: 0, r: 0, b: 0, empty: true }
    const xs = nodes.map(n => n.x)
    const ys = nodes.map(n => n.y)
    return {
      ...stage,
      l: Math.min(...xs) - CARD_W / 2 - 34,
      t: Math.min(...ys) - CARD_H / 2 - 44,
      r: Math.max(...xs) + CARD_W / 2 + 34,
      b: Math.max(...ys) + CARD_H / 2 + 34,
      empty: false,
    }
  })
}

export function TemplateCanvas(props: {
  template: WorkflowTemplate
  selectedNodeId?: string
  selectedEdgeId?: string
  onSelectNode?: (id: string) => void
  onSelectEdge?: (id: string) => void
  onClearSelection?: () => void
  editable?: boolean
  /** fit = pan/zoom transform; scroll = native scroll, no transform (instance detail) */
  viewMode?: "fit" | "scroll"
  scale: number
  pan: { x: number; y: number }
  onDragNode?: (id: string, dx: number, dy: number) => void
  onPan?: (x: number, y: number) => void
  onZoom?: (scale: number, x: number, y: number) => void
  /** Zoom with wheel only when pointer is over the canvas (instance detail). Editor uses "always". */
  wheelZoomWhen?: "always" | "hover"
  /** Per-node binding health for editor validation (red when not ok). */
  bindingHealthByNodeId?: Record<string, NodeBindingHealth>
}) {
  let dragEl: HTMLElement | null = null
  let dragBase = { x: 0, y: 0, ox: 0, oy: 0, nodeId: "" }
  let panBase = { x: 0, y: 0, px: 0, py: 0 }
  let panning = false
  let panPending = false
  let blankPress = false
  let canvasHovered = false
  let nodePress: { x: number; y: number; nodeId: string } | null = null
  let worldRef: HTMLDivElement | undefined
  let mapRef: HTMLDivElement | undefined

  createEffect(() => {
    const el = mapRef
    if (!el) return
    const wheel = (event: WheelEvent) => onWheel(event)
    const blockSelect = (event: Event) => event.preventDefault()
    el.addEventListener("wheel", wheel, { passive: false })
    el.addEventListener("selectstart", blockSelect)
    el.addEventListener("dragstart", blockSelect)
    onCleanup(() => {
      el.removeEventListener("wheel", wheel)
      el.removeEventListener("selectstart", blockSelect)
      el.removeEventListener("dragstart", blockSelect)
    })
  })

  const scrollLayout = createMemo(() => {
    const nodes = props.template.nodes
    const pad = 56
    if (!nodes.length) return { nodes: [], template: props.template, w: 640, h: 360 }
    const minX = Math.min(...nodes.map((node) => node.x - CARD_W / 2))
    const minY = Math.min(...nodes.map((node) => node.y - CARD_H / 2))
    const maxX = Math.max(...nodes.map((node) => node.x + CARD_W / 2))
    const maxY = Math.max(...nodes.map((node) => node.y + CARD_H / 2))
    const normalized = nodes.map((node) => ({
      ...node,
      x: node.x - minX + pad,
      y: node.y - minY + pad,
    }))
    return {
      nodes: normalized,
      template: { ...props.template, nodes: normalized },
      w: Math.max(640, maxX - minX + pad * 2),
      h: Math.max(360, maxY - minY + pad * 2),
    }
  })

  const renderTemplate = createMemo(() => (
    props.viewMode === "scroll" ? scrollLayout().template : props.template
  ))

  const extent = createMemo(() => {
    if (props.viewMode === "scroll") {
      const layout = scrollLayout()
      return { w: layout.w, h: layout.h, cx: layout.w / 2, cy: layout.h / 2 }
    }
    if (!props.editable && props.onSelectNode) {
      const nodes = props.template.nodes
      if (!nodes.length) return { w: 640, h: 360, cx: 320, cy: 180 }
      const bounds = computeWorkflowContentBounds(nodes)
      const pad = 72
      const w = bounds.width + pad * 2
      const h = bounds.height + pad * 2
      return { w, h, cx: bounds.minX + bounds.width / 2, cy: bounds.minY + bounds.height / 2 }
    }
    return computeWorkflowExtent(props.template.nodes)
  })
  const bands = createMemo(() => computeBands(renderTemplate()))
  const lowDetail = createMemo(() => props.scale < 0.48)
  const sessionLookup = createMemo(() => nodesById(renderTemplate().nodes))
  const edges = createMemo(() => {
    const nodeById = new Map(renderTemplate().nodes.map(node => [node.id, node]))
    const portGroups = new Map<string, string[]>()
    const portInfo = new Map<string, PortInfo>()
    for (const edge of props.template.edges) {
      const info = edgePortInfo(nodeById, edge)
      if (!info) continue
      portInfo.set(edge.id, info)
      portGroups.set(info.sourceKey, [...(portGroups.get(info.sourceKey) ?? []), `${edge.id}:source`])
      portGroups.set(info.targetKey, [...(portGroups.get(info.targetKey) ?? []), `${edge.id}:target`])
    }

    const sourceOffsets = new Map<string, number>()
    const targetOffsets = new Map<string, number>()
    for (const refs of portGroups.values()) {
      const offsets = centeredOffsets(refs.length)
      refs.forEach((ref, index) => {
        const [edgeId, endpoint] = ref.split(":")
        if (!edgeId) return
        if (endpoint === "source") sourceOffsets.set(edgeId, offsets[index] ?? 0)
        else targetOffsets.set(edgeId, offsets[index] ?? 0)
      })
    }

    return props.template.edges.map(edge => ({
      ...edge,
      ...edgeSegment(nodeById, edge, sourceOffsets.get(edge.id) ?? 0, targetOffsets.get(edge.id) ?? 0),
    }))
  })
  const transform = () => props.viewMode === "scroll"
    ? "none"
    : `translate(${props.pan.x}px,${props.pan.y}px) scale(${props.scale})`

  function onWheel(event: WheelEvent) {
    if (props.viewMode === "scroll" || !props.onZoom) return
    const when = props.wheelZoomWhen ?? "always"
    if (when === "hover" && !canvasHovered) return
    event.preventDefault()
    const old = props.scale
    const delta = event.deltaY > 0 ? -0.06 : 0.06
    const next = Math.max(0.15, Math.min(3, old + delta))
    const rect = worldRef?.parentElement?.getBoundingClientRect()
    if (!rect) return props.onZoom(next, props.pan.x, props.pan.y)
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const ratio = next / old
    props.onZoom(next, props.pan.x * ratio + mx * (1 - ratio), props.pan.y * ratio + my * (1 - ratio))
  }

  function onEdgePointer(event: PointerEvent, edgeId: string) {
    event.stopPropagation()
    blankPress = false
    panPending = false
    props.onSelectEdge?.(edgeId)
  }

  function onCanvasDown(event: PointerEvent) {
    const target = event.target as HTMLElement
    if (
      target.closest("[data-node-id]")
      || target.closest("[data-edge-id]")
      || target.closest(".wf-edge-hit")
    ) return
    event.preventDefault()
    blankPress = true
    nodePress = null
    panBase = { x: event.clientX, y: event.clientY, px: props.pan.x, py: props.pan.y }
    panPending = true
    panning = false
  }

  function onCanvasMove(event: PointerEvent) {
    if (panPending && !panning) {
      const dx = event.clientX - panBase.x
      const dy = event.clientY - panBase.y
      if (dx * dx + dy * dy >= 25) {
        if (props.onPan) {
          panning = true
          event.preventDefault()
          mapRef?.classList.add("is-panning")
          try {
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
          } catch { /* ignore */ }
        } else {
          panPending = false
        }
      }
    }
    if (!panning || !props.onPan) return
    props.onPan(
      panBase.px + (event.clientX - panBase.x) / props.scale,
      panBase.py + (event.clientY - panBase.y) / props.scale,
    )
  }

  function releaseMapCapture(event?: PointerEvent) {
    if (!event) return
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    } catch { /* ignore */ }
  }

  function onCanvasUp(event: PointerEvent) {
    if (panning) {
      mapRef?.classList.remove("is-panning")
      releaseMapCapture(event)
    } else if (blankPress && panPending) {
      const dx = event.clientX - panBase.x
      const dy = event.clientY - panBase.y
      if (dx * dx + dy * dy < 25) props.onClearSelection?.()
    }
    panning = false
    panPending = false
    blankPress = false
  }

  function onCanvasLeave(event: PointerEvent) {
    canvasHovered = false
    mapRef?.classList.remove("is-panning")
    if (panning) releaseMapCapture(event)
    panning = false
    panPending = false
    blankPress = false
  }

  function onNodeDown(event: PointerEvent, node: WorkflowNode) {
    event.stopPropagation()
    event.preventDefault()
    blankPress = false
    panPending = false
    nodePress = { x: event.clientX, y: event.clientY, nodeId: node.id }
    if (!props.editable && props.onSelectNode) {
      props.onSelectNode(node.id)
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      } catch { /* ignore */ }
    } else if (props.editable) {
      const el = event.currentTarget as HTMLElement
      el.setPointerCapture(event.pointerId)
      dragBase = { x: event.clientX, y: event.clientY, ox: node.x, oy: node.y, nodeId: node.id }
      dragEl = el
    }
  }

  function onNodeMove(event: PointerEvent, node: WorkflowNode) {
    if (!dragEl || dragBase.nodeId !== node.id || !props.editable) return
    const nx = dragBase.ox + (event.clientX - dragBase.x) / props.scale
    const ny = dragBase.oy + (event.clientY - dragBase.y) / props.scale
    dragEl.style.left = `${nx}px`
    dragEl.style.top = `${ny}px`
  }

  function onNodeUp(event: PointerEvent, node: WorkflowNode) {
    const press = nodePress?.nodeId === node.id ? nodePress : null
    const isTap = press
      ? (event.clientX - press.x) ** 2 + (event.clientY - press.y) ** 2 < 144
      : false

    if (dragEl) {
      const el = dragEl
      const draggedId = dragBase.nodeId
      dragEl = null
      if (draggedId === node.id) {
        const dx = el.offsetLeft - dragBase.ox
        const dy = el.offsetTop - dragBase.oy
        if (props.editable && (dx || dy)) {
          props.onDragNode?.(node.id, dx, dy)
        } else if (isTap) {
          props.onSelectNode?.(node.id)
        }
      }
      nodePress = null
      return
    }

    if (isTap) props.onSelectNode?.(node.id)
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    } catch { /* ignore */ }
    nodePress = null
  }

  function onNodeClick(event: MouseEvent, node: WorkflowNode) {
    event.stopPropagation()
    props.onSelectNode?.(node.id)
  }

  const edgeHitWidth = () => {
    if (props.viewMode === "scroll") return 28
    return Math.max(28, 28 / Math.max(props.scale, 0.2))
  }

  return (
    <div
      ref={mapRef}
      class="workflow-map template-canvas"
      classList={{
        "is-low-detail": lowDetail(),
        "template-canvas--scroll": props.viewMode === "scroll",
        "template-canvas--pickable": Boolean(props.onSelectNode),
      }}
      onPointerDown={onCanvasDown}
      onPointerMove={onCanvasMove}
      onPointerUp={onCanvasUp}
      onPointerLeave={onCanvasLeave}
      onPointerEnter={() => { canvasHovered = true }}
    >
      <div class="workflow-world" ref={worldRef} style={{ width: `${extent().w}px`, height: `${extent().h}px`, transform: transform() }}>
        <For each={bands()}>
          {stage => !stage.empty && (
            <div class="wf-stage-band" style={{ left: `${stage.l}px`, top: `${stage.t}px`, width: `${stage.r - stage.l}px`, height: `${stage.b - stage.t}px`, "--stage-color": stage.color }}>
              <span>{stage.name}</span>
            </div>
          )}
        </For>
        <svg
          class="workflow-lines"
          classList={{ "workflow-lines--interactive": Boolean(props.onSelectEdge) }}
          viewBox={`0 0 ${extent().w} ${extent().h}`}
        >
          <For each={edges()}>
            {edge => (
              <g
                class={`wf-edge-group wf-edge--${edge.kind} ${edgeFlowClass(edge.annotation)}`}
                classList={{ "is-selected": props.selectedEdgeId === edge.id }}
                data-edge-id={edge.id}
              >
                <Show when={props.onSelectEdge}>
                  <path
                    class="wf-edge-hit"
                    d={edge.d}
                    style={{ "stroke-width": `${edgeHitWidth()}px` }}
                    onPointerDown={(event) => onEdgePointer(event, edge.id)}
                  />
                </Show>
                <path class="wf-edge wf-edge-dash" d={edge.d} style={{ stroke: edge.color }} />
                <path class="wf-edge-arrow" d={edge.ad} style={{ stroke: edge.color }} />
                <path class="wf-edge-head" d={edge.hd} style={{ fill: edgeFill(edge.color) }} />
                <Show when={edge.contextMode && (props.selectedEdgeId === edge.id || edge.annotation)}>
                  <title>{edge.contextMode}{edge.annotation ? ` · ${edge.annotation}` : ""}</title>
                </Show>
              </g>
            )}
          </For>
        </svg>
        <For each={renderTemplate().nodes}>
          {node => (
            <article
              class={`station-card ${nodeStateClass(node.state)}`}
              classList={{
                "is-selected": props.selectedNodeId === node.id,
                "station-card--pickable": Boolean(props.onSelectNode),
                "station-card--binding-invalid": props.bindingHealthByNodeId?.[node.id] && !props.bindingHealthByNodeId[node.id]!.ok,
              }}
              data-node-id={node.id}
              style={{ left: `${node.x}px`, top: `${node.y}px` }}
              onPointerDown={event => onNodeDown(event, node)}
              onPointerMove={event => onNodeMove(event, node)}
              onPointerUp={event => onNodeUp(event, node)}
              onClick={event => onNodeClick(event, node)}
            >
              <div class="station-track">
                <span class="station-kind"><Icon name={nodeIcons[node.kind] ?? "template"} size={14} />{node.kind}</span>
                <span class={`station-state ${nodeStateClass(node.state)}`}>{node.state ?? "waiting"}</span>
              </div>
              <h3>{node.name}</h3>
              <Show when={sessionTurnLabel(node, sessionLookup())}>
                <div class="station-session">
                  <Icon name="agent" size={12} />
                  <span>{sessionTurnLabel(node, sessionLookup())}</span>
                </div>
              </Show>
              <Show when={!lowDetail()}>
                <p>{node.outputContract}</p>
                <div class="station-object-row">
                  <span>{executorTag(node)}</span>
                  <Show when={node.artifacts?.length}>
                    <small>{node.artifacts!.length} artifacts</small>
                  </Show>
                </div>
              </Show>
            </article>
          )}
        </For>
      </div>
    </div>
  )
}
