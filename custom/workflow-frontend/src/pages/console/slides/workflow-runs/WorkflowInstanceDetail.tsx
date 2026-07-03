import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show, untrack } from "solid-js"

import { continueWorkflowRun, type WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../../../api"
import { workflowEntityRunControls } from "../../../../data/workflow-entity/run-controls"
import { TemplateCanvas } from "../../../../components/WorkflowTemplateCanvas"
import { arrangeWorkflowInstanceBySessions } from "../../../../components/workflow-layout/instance-layout"
import { arrangeWorkflowTemplate } from "../../../../components/workflow-layout/stage-layout"
import { computeCanvasTransform, scheduleCanvasFit } from "../../../../components/workflow-layout/viewport-fit"
import { Icon } from "../../../../components/Icon"
import { useI18n } from "../../../../i18n"
import { createWorkflowEntitySwitch, Glass, MiniBelt, statusClass } from "../../shared/core"
import type { WorkflowStreamLogEntry } from "../../../../runtime-bridge"
import { formatActiveDuration, formatWhen, mapDisplayStatus, type WorkflowInstanceItem } from "./instance-utils"
import { buildInstanceCanvasLayout, effectiveRuntimeForItem } from "./instance-canvas-template"
import { templateWithRuntimeState, resolvePlannerInquiryDisplay } from "./workflow-run-detail-utils"
import { PlannerInquiryQuestions } from "./PlannerInquiryQuestions"
import { ensureDrawmoonWorkflowTemplates, subscribeDrawmoonWorkflowTemplatesHydrated } from "../../../../data/drawmoon/templates-sync"
import { WorkflowLiveConsole } from "./WorkflowLiveConsole"
import { WorkflowGlobalTokenBar } from "./WorkflowGlobalTokenBar"
import { WorkflowRunDetailPanel } from "./WorkflowRunDetailPanel"
import { WorkflowSelectionDetail } from "./WorkflowSelectionDetail"
import type { TokenUsageByNodeEntry } from "../../../../components/TokenUsageByNodeTable"
import {
  clearWorkflowDetailSelection,
  setWorkflowDetailSelection,
  setWorkflowDetailSelectionPinned,
  workflowDetailSelection,
  workflowDetailSelectionPinned,
} from "./detail-selection"

const ACTIVE_STATUSES = new Set(["queued", "running", "paused", "looping"])

export function WorkflowInstanceDetail(props: {
  item: WorkflowInstanceItem
  items: WorkflowInstanceItem[]
  runtimeRun: RuntimeWorkflowRunRecord | null
  runLoading?: boolean
  streamLogs?: WorkflowStreamLogEntry[]
  liveOutputs?: Record<string, string>
  onBack: () => void
  onHome: () => void
  onSelect: (item: WorkflowInstanceItem) => void
  onRename: (name: string) => void
  onDelete: () => void
  onRequestDetailLoad?: () => void
  onRuntimeUpdated?: (run: RuntimeWorkflowRunRecord) => void
}) {
  const { t } = useI18n()
  const workflowSwitch = createWorkflowEntitySwitch(props.item.entity)
  const entity = workflowSwitch.entity
  const [runName, setRunName] = createSignal(props.item.name)
  const [isSaving, setIsSaving] = createSignal(false)
  const [autoLayoutAxis, setAutoLayoutAxis] = createSignal<"stage" | "sessions">("stage")
  const [layoutRevision, setLayoutRevision] = createSignal(0)
  const [templateRevision, setTemplateRevision] = createSignal(0)
  const [scale, setScale] = createSignal(0.82)
  const [pan, setPan] = createSignal({ x: -20, y: 0 })
  const [viewLocked, setViewLocked] = createSignal(false)
  let canvasHost: HTMLElement | undefined

  // Value-stable derivations: props.item is a fresh object on every run tick
  // (the instance list is rebuilt on each store update), so reading props.item.*
  // directly inside a memo would re-fire it on every tick even when nothing the
  // canvas cares about changed. These memos only notify on real value changes.
  const itemId = createMemo(() => props.item.id)
  const itemTemplateId = createMemo(() => props.item.templateId)
  const graphNodeCount = createMemo(() => props.runtimeRun?.graph?.nodes?.length ?? 0)

  const runId = () => itemId()
  const selection = () => workflowDetailSelection(runId())
  const selectionPinned = () => workflowDetailSelectionPinned(runId())

  const effectiveRuntimeRun = createMemo(() => effectiveRuntimeForItem(props.item, props.runtimeRun))

  const nodeStateKey = createMemo(() => {
    const states = props.runtimeRun?.nodeStates
    if (!states) return ""
    return Object.entries(states)
      .map(([id, state]) => `${id}:${state.status}`)
      .sort()
      .join("|")
  })

  // Gate the (expensive) canvas layout so it only recomputes on inputs that
  // actually change the graph the canvas draws — node statuses, graph size,
  // template/layout revisions and axis. Reading the churny props.item /
  // runtime object is done via untrack so per-tick identity changes (progress,
  // tokens, logs) don't rebuild the layout and recreate the whole canvas DOM,
  // which would interrupt pointer drag/zoom gestures during an active run.
  const canvasLayout = createMemo(() => {
    layoutRevision()
    templateRevision()
    const axis = autoLayoutAxis()
    itemId()
    itemTemplateId()
    graphNodeCount()
    nodeStateKey()
    return untrack(() => {
      const layout = buildInstanceCanvasLayout(props.item, effectiveRuntimeRun())
      const viewport = canvasViewport()
      if (axis === "sessions") {
        return { ...layout, nodes: arrangeWorkflowInstanceBySessions(layout) }
      }
      return { ...layout, nodes: arrangeWorkflowTemplate(layout, viewport) }
    })
  })

  const runtimeTemplate = createMemo(() => {
    effectiveRuntimeRun()
    props.runtimeRun?.currentNodeIds
    props.runtimeRun?.status
    return templateWithRuntimeState(canvasLayout(), effectiveRuntimeRun())
  })

  const canvasTemplate = createMemo(() => {
    selection()
    let template = runtimeTemplate()
    const sel = selection()
    if (sel?.kind === "node") {
      const focusId = sel.nodeId
      template = {
        ...template,
        edges: template.edges.map((edge) => (
          edge.from === focusId || edge.to === focusId
            ? { ...edge, annotation: edge.annotation === "done" ? "done" : "active" }
            : edge
        )),
      }
    } else if (sel?.kind === "edge") {
      template = {
        ...template,
        edges: template.edges.map((edge) => (
          edge.id === sel.edgeId
            ? { ...edge, annotation: "active" }
            : edge
        )),
      }
    }
    return template
  })

  function canvasViewport() {
    const rect = canvasHost?.getBoundingClientRect()
    return {
      width: Math.max(320, rect?.width ?? 960),
      height: Math.max(280, rect?.height ?? 520),
    }
  }

  function fitCanvas(nodes = canvasLayout().nodes, mode: "contain" | "anchor-top-left" = "anchor-top-left") {
    const transform = computeCanvasTransform(nodes, canvasViewport(), mode)
    setScale(transform.scale)
    setPan({ x: transform.panX, y: transform.panY })
  }

  createEffect(on(
    itemId,
    (id, prevId) => {
      if (prevId !== undefined && id !== prevId) {
        setLayoutRevision(0)
        setViewLocked(false)
      }
    },
  ))

  createEffect(on(
    () => [itemId(), layoutRevision(), autoLayoutAxis(), templateRevision()] as const,
    () => {
      if (viewLocked()) return
      // Re-check the lock inside the deferred callback: an in-flight run update
      // could schedule a fit, then the user pans/zooms (locking the view) before
      // the rAF fires — without this guard the fit would stomp their gesture.
      scheduleCanvasFit(() => {
        if (!viewLocked()) fitCanvas(canvasLayout().nodes, "anchor-top-left")
      })
    },
  ))

  onMount(() => {
    void ensureDrawmoonWorkflowTemplates()
    const stopHydrationWatch = subscribeDrawmoonWorkflowTemplatesHydrated(() => {
      setTemplateRevision((value) => value + 1)
    })
    scheduleCanvasFit(() => fitCanvas(canvasLayout().nodes, "anchor-top-left"))
    let resizeTimer: number | undefined
    let lastWidth = 0
    let lastHeight = 0
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || viewLocked()) return
      const { width, height } = entry.contentRect
      if (Math.abs(width - lastWidth) < 8 && Math.abs(height - lastHeight) < 8) return
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        lastWidth = width
        lastHeight = height
        if (!viewLocked()) scheduleCanvasFit(() => fitCanvas(canvasLayout().nodes, "anchor-top-left"))
      }, 120)
    })
    if (canvasHost) {
      const rect = canvasHost.getBoundingClientRect()
      lastWidth = rect.width
      lastHeight = rect.height
      observer.observe(canvasHost)
    }
    onCleanup(() => {
      window.clearTimeout(resizeTimer)
      observer.disconnect()
      stopHydrationWatch()
    })
  })

  function applyAutoLayout() {
    setViewLocked(false)
    setLayoutRevision((value) => value + 1)
  }

  const uiStatus = createMemo(() => mapDisplayStatus(props.item.status))
  const backendStatus = createMemo(() => mapDisplayStatus(props.runtimeRun?.status ?? props.item.status))
  const isPausedForReview = createMemo(() => {
    const paused = props.runtimeRun?.status === "paused" || props.item.status === "paused"
    return paused && props.runtimeRun?.error === "human-review"
  })
  const isPausedForInquiry = createMemo(() => {
    const paused = props.runtimeRun?.status === "paused" || props.item.status === "paused"
    return paused && props.runtimeRun?.error === "inquiry-pending"
  })
  const [inquiryReply, setInquiryReply] = createSignal("")
  const [inquiryConfirmed, setInquiryConfirmed] = createSignal(false)
  const isPausedForRepair = createMemo(() => {
    const paused = props.runtimeRun?.status === "paused" || props.item.status === "paused"
    return paused && Boolean(props.runtimeRun?.error?.startsWith("needs-repair:"))
  })
  const repairMessage = createMemo(() => props.runtimeRun?.error?.replace(/^needs-repair:\s*/, "") ?? "")
  const isUserPaused = createMemo(() => {
    const err = props.runtimeRun?.error ?? ""
    return (props.runtimeRun?.status === "paused" || props.item.status === "paused")
      && (err === "user-pause" || err === "user-interrupt")
  })
  const isFailedRun = createMemo(() =>
    props.runtimeRun?.status === "failed" || props.item.status === "failed",
  )
  const failedNodeIds = createMemo(() => props.runtimeRun?.failedNodeIds ?? [])
  const hasPausedNode = createMemo(() =>
    Object.values(props.runtimeRun?.nodeStates ?? {}).some((state) => state.status === "paused"),
  )
  // Spurious finalize / gated run: no real node failure but a node is still
  // paused — the backend `continue` restores paused state and resumes.
  const canContinueFailedRun = createMemo(() =>
    isFailedRun() && failedNodeIds().length === 0 && hasPausedNode(),
  )
  // Genuine node failure(s): retry the failed node(s) via the existing handler.
  const canRetryFailedRun = createMemo(() =>
    isFailedRun() && failedNodeIds().length > 0,
  )
  const isActive = createMemo(() => ACTIVE_STATUSES.has(props.item.status))
  const [runControlBusy, setRunControlBusy] = createSignal(false)
  const globalUsage = createMemo(() => entity().tokenUsage ?? props.item.tokenUsage)

  const [clockMs, setClockMs] = createSignal(Date.now())
  onMount(() => {
    const timer = setInterval(() => {
      const status = effectiveRuntimeRun()?.status ?? props.item.status
      if (status === "running") setClockMs(Date.now())
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })
  const activeDuration = createMemo(() => {
    const run = effectiveRuntimeRun()
    return formatActiveDuration({
      status: run?.status ?? props.item.status,
      activeDurationMs: run?.activeDurationMs ?? props.item.activeDurationMs,
      activeSegmentStartedAt: run?.activeSegmentStartedAt ?? props.item.activeSegmentStartedAt,
      startedAt: run?.startedAt ?? props.item.startedAt,
      finishedAt: run?.finishedAt ?? props.item.finishedAt,
    }, clockMs())
  })

  const activeNodeId = createMemo(() => {
    const run = effectiveRuntimeRun()
    const ids = run?.currentNodeIds
    if (ids?.length) return ids[0]!
    const running = Object.entries(run?.nodeStates ?? {}).find(([, state]) => state.status === "running")
    return running?.[0] ?? null
  })

  const activeNodeLabel = createMemo(() => {
    const id = activeNodeId()
    if (!id) return "—"
    return canvasTemplate().nodes.find((node) => node.id === id)?.name ?? id
  })

  const inquiryDisplay = createMemo(() => {
    if (!isPausedForInquiry()) return null
    return resolvePlannerInquiryDisplay(effectiveRuntimeRun(), canvasTemplate(), activeNodeId())
  })

  function selectNode(nodeId: string) {
    setWorkflowDetailSelection(runId(), { kind: "node", nodeId }, { pinned: true })
    setViewLocked(true)
  }

  function selectEdge(edgeId: string) {
    setWorkflowDetailSelection(runId(), { kind: "edge", edgeId }, { pinned: true })
    setViewLocked(true)
  }

  function clearSelection() {
    clearWorkflowDetailSelection(runId())
    setViewLocked(false)
    scheduleCanvasFit(() => fitCanvas(canvasLayout().nodes, "anchor-top-left"))
  }

  createEffect(on(isPausedForInquiry, (paused, wasPaused) => {
    if (paused && !wasPaused) {
      setInquiryReply("")
      setInquiryConfirmed(false)
      const nodeId = activeNodeId()
      if (nodeId && !selectionPinned()) {
        setWorkflowDetailSelection(runId(), { kind: "node", nodeId }, { pinned: true })
      }
    }
  }))

  createEffect(on(isPausedForReview, (paused, wasPaused) => {
    if (paused && !wasPaused && !selectionPinned()) {
      selectNode("submit-review-gate")
    }
  }))

  createEffect(on(activeNodeId, (id, prev) => {
    if (!id || id === prev || selectionPinned() || isPausedForReview()) return
    const status = effectiveRuntimeRun()?.nodeStates?.[id]?.status
    if (status === "running" && !selection()) {
      setWorkflowDetailSelection(runId(), { kind: "node", nodeId: id }, { pinned: false })
    }
  }))

  const viewNodeId = createMemo(() => {
    const sel = selection()
    if (sel?.kind === "node") return sel.nodeId
    return activeNodeId()
  })

  const viewNodeLabel = createMemo(() => {
    const id = viewNodeId()
    if (!id) return "—"
    return canvasTemplate().nodes.find((node) => node.id === id)?.name ?? id
  })

  const liveText = createMemo(() => {
    const id = viewNodeId()
    if (!id) return ""
    return props.liveOutputs?.[id] ?? ""
  })

  const aggregatedLiveText = createMemo(() => {
    const run = effectiveRuntimeRun()
    const outputs = props.liveOutputs ?? {}
    const runningIds = Object.entries(run?.nodeStates ?? {})
      .filter(([, state]) => state.status === "running")
      .map(([id]) => id)
    const chunks: string[] = []
    for (const id of runningIds) {
      const text = outputs[id]?.trim()
      const label = canvasTemplate().nodes.find((node) => node.id === id)?.name ?? id
      if (text) chunks.push(`[${label}]\n${text}`)
    }
    if (!chunks.length) {
      const id = viewNodeId()
      const text = id ? outputs[id] : ""
      if (text) return text
    }
    return chunks.join("\n\n")
  })

  const showLiveConsole = createMemo(() => {
    if (isActive()) return true
    const outputs = props.liveOutputs ?? {}
    if (Object.values(outputs).some((text) => text.trim().length > 0)) return true
    return (props.streamLogs?.length ?? 0) > 0
  })

  const tokenByNode = createMemo((): TokenUsageByNodeEntry[] => {
    const run = effectiveRuntimeRun()
    const byNode = run?.history?.usage?.byNode
    if (!byNode) return []
    const nodes = canvasTemplate().nodes
    return Object.entries(byNode).map(([nodeId, usage]) => ({
      nodeId,
      label: nodes.find((node) => node.id === nodeId)?.name ?? nodeId,
      usage,
    }))
  })

  const selectedNodeId = createMemo(() => (selection()?.kind === "node" ? selection()!.nodeId : undefined))
  const selectedEdgeId = createMemo(() => (selection()?.kind === "edge" ? selection()!.edgeId : undefined))

  createEffect(() => workflowSwitch.syncEntity(props.item.entity))

  const selectionLiveText = createMemo(() => {
    const sel = selection()
    if (sel?.kind !== "node") return ""
    return props.liveOutputs?.[sel.nodeId] ?? ""
  })

  async function approveHumanReview() {
    const run = await workflowEntityRunControls(props.item.id).continue()
    props.onRuntimeUpdated?.(run)
    setWorkflowDetailSelectionPinned(runId(), false)
    void props.onRequestDetailLoad?.()
  }

  async function submitInquiryReply() {
    const reply = inquiryReply().trim()
    if (!reply || !inquiryConfirmed()) return
    const run = await workflowEntityRunControls(props.item.id).continue({ inquiryReply: reply })
    props.onRuntimeUpdated?.(run)
    setInquiryReply("")
    setInquiryConfirmed(false)
    setWorkflowDetailSelectionPinned(runId(), false)
    void props.onRequestDetailLoad?.()
  }

  async function pauseRunGracefully() {
    if (runControlBusy()) return
    setRunControlBusy(true)
    try {
      const run = await workflowEntityRunControls(props.item.id).pauseGraceful()
      props.onRuntimeUpdated?.(run)
    } finally {
      setRunControlBusy(false)
    }
  }

  async function interruptRunHard() {
    if (runControlBusy()) return
    setRunControlBusy(true)
    try {
      const run = await workflowEntityRunControls(props.item.id).interruptHard()
      props.onRuntimeUpdated?.(run)
    } finally {
      setRunControlBusy(false)
    }
  }

  async function cancelRun() {
    if (runControlBusy()) return
    setRunControlBusy(true)
    try {
      const run = await workflowEntityRunControls(props.item.id).cancel()
      props.onRuntimeUpdated?.(run)
    } finally {
      setRunControlBusy(false)
    }
  }

  async function resumeUserPausedRun() {
    if (runControlBusy()) return
    setRunControlBusy(true)
    try {
      const run = await workflowEntityRunControls(props.item.id).continue()
      props.onRuntimeUpdated?.(run)
    } finally {
      setRunControlBusy(false)
    }
  }

  async function continueFailedRun() {
    if (runControlBusy()) return
    setRunControlBusy(true)
    try {
      const run = await workflowEntityRunControls(props.item.id).continue()
      props.onRuntimeUpdated?.(run)
      void props.onRequestDetailLoad?.()
    } finally {
      setRunControlBusy(false)
    }
  }

  async function retryFailedRun() {
    if (runControlBusy()) return
    const ids = failedNodeIds()
    if (!ids.length) return
    setRunControlBusy(true)
    try {
      let latest: RuntimeWorkflowRunRecord | undefined
      for (const nodeId of ids) {
        latest = await workflowEntityRunControls(props.item.id).retryNode(nodeId)
      }
      if (latest) props.onRuntimeUpdated?.(latest)
      void props.onRequestDetailLoad?.()
    } finally {
      setRunControlBusy(false)
    }
  }

  function handleRuntimeUpdated(run: RuntimeWorkflowRunRecord) {
    props.onRuntimeUpdated?.(run)
    void props.onRequestDetailLoad?.()
  }

  async function saveName() {
    const next = runName().trim()
    if (!next || next === props.item.name) return
    setIsSaving(true)
    try {
      props.onRename(next)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div class="workflow-switch-pane wf-run-detail-v2" style={{ "--wf-dir": "1" }}>
      <div class="workflow-detail-nav">
        <button type="button" class="workflow-summary-back" onClick={props.onBack}>
          <Icon name="chevronLeft" size={15} />All instances
        </button>
        <span class="wf-run-detail-hint">{t("run.detailHint")}</span>
      </div>

      <header class="detail-top workflow-instance-detail-top wf-run-detail-header">
        <div>
          <span class="eyebrow">{props.item.templateName}</span>
          <h2>{props.item.name}</h2>
          <p>{props.item.templateId} · {formatWhen(props.item.createdAt)} · {activeDuration()}</p>
        </div>
        <div class="wf-status-split">
          <div class="wf-status-chip">
            <span class="wf-status-chip__label">{t("run.uiStatus")}</span>
            <strong class={statusClass(uiStatus())}>{props.item.status}</strong>
            <small>{props.item.progressPercent}% · {props.item.completedNodes}/{props.item.totalNodes}</small>
          </div>
          <div class="wf-status-chip wf-status-chip--backend">
            <span class="wf-status-chip__label">{t("run.backendStatus")}</span>
            <strong class={statusClass(backendStatus())}>{props.runtimeRun?.status ?? props.item.status}</strong>
            <small>
              {props.runtimeRun?.progress?.percent ?? props.item.progressPercent}%
              <Show when={activeNodeId()}> · {activeNodeLabel()}</Show>
            </small>
          </div>
          <Show when={isActive()}>
            <div class="wf-run-control-actions">
              <button type="button" class="wf-button wf-button--ghost" disabled={runControlBusy()} onClick={() => void pauseRunGracefully()}>
                {t("run.pauseGraceful")}
              </button>
              <button type="button" class="wf-button wf-button--ghost" disabled={runControlBusy()} onClick={() => void interruptRunHard()}>
                {t("run.interruptHard")}
              </button>
              <button type="button" class="wf-button wf-button--ghost" disabled={runControlBusy()} onClick={() => void cancelRun()}>
                {t("run.cancelRun")}
              </button>
            </div>
          </Show>
        </div>
      </header>

      <Show when={isUserPaused()}>
        <div class="wf-human-review-banner">
          <p>{props.runtimeRun?.error === "user-interrupt" ? t("run.userInterruptPause") : t("run.userGracefulPause")}</p>
          <button type="button" class="wf-button" disabled={runControlBusy()} onClick={() => void resumeUserPausedRun()}>
            {t("run.resumeRun")}
          </button>
        </div>
      </Show>

      <Show when={isPausedForRepair()}>
        <div class="wf-human-review-banner wf-needs-repair-banner">
          <p>{t("run.needsRepairPause")} {repairMessage()}</p>
          <button type="button" class="wf-button" onClick={approveHumanReview}>{t("run.continueAfterRepair")}</button>
        </div>
      </Show>

      <Show when={isPausedForInquiry()}>
        <div class="wf-human-review-banner wf-inquiry-banner">
          <p class="wf-inquiry-lead">{t("run.inquiryPause")}</p>
          <Show when={inquiryDisplay()}>
            {(display) => (
              <PlannerInquiryQuestions
                href={display().href}
                markdown={display().markdown}
                fileName={display().fileName}
              />
            )}
          </Show>
          <label class="wf-inquiry-confirm">
            <input
              type="checkbox"
              checked={inquiryConfirmed()}
              onInput={(event) => setInquiryConfirmed(event.currentTarget.checked)}
            />
            <span>{t("run.inquiryConfirmRead")}</span>
          </label>
          <textarea
            class="wf-inquiry-reply"
            rows={5}
            placeholder={t("run.inquiryReplyPlaceholder")}
            value={inquiryReply()}
            onInput={(event) => setInquiryReply(event.currentTarget.value)}
          />
          <button
            type="button"
            class="wf-button wf-inquiry-submit"
            disabled={!inquiryReply().trim() || !inquiryConfirmed()}
            onClick={submitInquiryReply}
          >
            {t("run.continueAfterInquiry")}
          </button>
        </div>
      </Show>

      <Show when={isPausedForReview()}>
        <div class="wf-human-review-banner">
          <p>{t("run.humanReviewPause")}</p>
          <button type="button" class="wf-button" onClick={approveHumanReview}>{t("run.continueAfterReview")}</button>
        </div>
      </Show>

      <Show when={canContinueFailedRun() || canRetryFailedRun()}>
        <div class="wf-human-review-banner wf-failed-recovery-banner">
          <Show
            when={canContinueFailedRun()}
            fallback={(
              <>
                <p>{t("run.failedRecoveryRetryHint")}</p>
                <button type="button" class="wf-button" disabled={runControlBusy()} onClick={() => void retryFailedRun()}>
                  {t("run.failedRecoveryRetry")}
                </button>
              </>
            )}
          >
            <p>{t("run.failedRecoveryContinueHint")}</p>
            <button type="button" class="wf-button" disabled={runControlBusy()} onClick={() => void continueFailedRun()}>
              {t("run.failedRecoveryContinue")}
            </button>
          </Show>
        </div>
      </Show>

      <WorkflowGlobalTokenBar usage={globalUsage()} tokenByNode={tokenByNode()} />

      <Glass class="detail-map wf-run-detail-map wf-run-detail-map--compact">
        <div class="wf-run-map-toolbar">
          <select class="auto-layout-axis" value={autoLayoutAxis()} onChange={(event) => setAutoLayoutAxis(event.currentTarget.value as "stage" | "sessions")}>
            <option value="stage">{t("run.layoutStage")}</option>
            <option value="sessions">{t("run.layoutSessions")}</option>
          </select>
          <button type="button" class="wf-button wf-button--soft" onClick={applyAutoLayout}>{t("run.autoLayout")}</button>
          <button type="button" class="wf-button wf-button--soft" onClick={() => { setViewLocked(false); fitCanvas() }}>{t("run.fitCanvas")}</button>
          <span class="wf-run-map-node-count">{canvasTemplate().nodes.length} nodes · {Math.round(scale() * 100)}%</span>
        </div>
        <div class="detail-map-body" ref={canvasHost}>
          <TemplateCanvas
            template={canvasTemplate()}
            selectedNodeId={selectedNodeId()}
            selectedEdgeId={selectedEdgeId()}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onClearSelection={clearSelection}
            wheelZoomWhen="hover"
            scale={scale()}
            pan={pan()}
            onPan={(x, y) => {
              setViewLocked(true)
              setPan({ x, y })
            }}
            onZoom={(nextScale, x, y) => {
              setViewLocked(true)
              setScale(nextScale)
              setPan({ x, y })
            }}
          />
        </div>
        <p class="wf-run-canvas-hint">{t("run.canvasHint")}</p>
      </Glass>

      <WorkflowSelectionDetail
        selection={selection()}
        template={runtimeTemplate()}
        run={effectiveRuntimeRun()}
        runId={props.item.id}
        liveText={selectionLiveText()}
        onRuntimeUpdated={handleRuntimeUpdated}
      />

      <WorkflowRunDetailPanel
        selection={selection()}
        template={runtimeTemplate()}
        run={effectiveRuntimeRun()}
        runId={props.item.id}
        runLoading={props.runLoading ?? false}
        onSelectNode={selectNode}
        onRuntimeUpdated={handleRuntimeUpdated}
      />

      <details class="wf-run-meta-fold">
        <summary>{t("run.instanceSettings")}</summary>
        <div class="wf-run-meta-grid">
          <Glass>
            <label class="workflow-instance-rename-field">
              <span>Name</span>
              <input value={runName()} onInput={(event) => setRunName(event.currentTarget.value)} />
            </label>
            <div class="wf-run-meta-actions">
              <button type="button" disabled={isSaving()} onClick={saveName}>{isSaving() ? "Saving…" : "Save name"}</button>
              <button type="button" class="wf-button wf-button--danger workflow-instance-delete-detail" onClick={props.onDelete}>
                <Icon name="trash" size={13} />Delete history
              </button>
            </div>
            <MiniBelt entity={entity()} />
            <div class="registry-meta-grid">
              <span>template <b>{props.item.templateName}</b></span>
              <span>runtime <b>{entity().runtime}</b></span>
              <span>model <b>{entity().model}</b></span>
              <span>column <b>{entity().currentColumn}/{entity().columnStates.length}</b></span>
            </div>
            <p class="wf-run-meta-note">{entity().latestOutput}</p>
          </Glass>
        </div>
      </details>

      <Show when={showLiveConsole()}>
        <section class="wf-run-live-dock" aria-label="Running output">
          <WorkflowLiveConsole
            activeNodeId={activeNodeId()}
            activeNodeLabel={activeNodeLabel()}
            liveText={aggregatedLiveText() || liveText()}
            streamLogs={props.streamLogs ?? []}
            runStatus={backendStatus()}
          />
        </section>
      </Show>
    </div>
  )
}
