import { batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, Show, untrack } from "solid-js"

import {
  getWorkflowRun,
  deleteWorkflowRun,
  startWorkflowRun,
  updateWorkflowRunMetadata,
  type WorkflowRunListItem,
  type WorkflowRunRecord as RuntimeWorkflowRunRecord,
  type WorkflowTemplateInfo,
} from "../../../../api"
import { runtimeReconnecting } from "../../../../api/http-client"
import type { WorkflowEntity } from "../../../../data/console-model"
import { entityFromRuntimeRun, unregisterWorkflowEntity, updateWorkflowEntity } from "../../../../data/workflow-entity"
import { deleteWorkflowRunRecord } from "../../../../data/workflow-runs"
import { getCachedTemplateCatalog, revalidateTemplateCatalog } from "../../../../data/template-store"
import {
  fetchWorkflowRunsInDisplayThread,
  type WorkflowStreamLogEntry,
} from "../../../../runtime-bridge"
import {
  getCachedLiveOutputs,
  getCachedStreamLogs,
  getWorkflowRunStore,
  listCachedRuns,
  mergeCachedRunDetail,
  removeCachedRun,
  runsStale,
  setCachedRuns,
  upsertCachedRun,
} from "../../../../runtime-bridge/workflow-run-store"
import { syncRunMonitors, ensureRunMonitor } from "../../../../runtime-bridge/run-monitor"
import { Glass, workflowToRuntimeGraph } from "../../shared/core"
import { getWorkflowUiTemplate } from "../../../../data/template-registry"
import { workflowRunIdFromLocation, type View } from "../../navigation"
import {
  closeWorkflowDetailPane,
  openWorkflowDetailPane,
  registerWorkflowRunOpenHandler,
  syncWorkflowDetailPaneFromLocation,
  unregisterWorkflowRunOpenHandler,
  workflowDetailPaneOpen,
  workflowDetailSelectedId,
} from "./detail-nav"
import { mergeInstances, type WorkflowInstanceItem, type WorkflowSortMode } from "./instance-utils"
import { runDetailIsComplete } from "./workflow-run-detail-utils"
import { WorkflowInstanceBrowser } from "./WorkflowInstanceBrowser"
import { WorkflowInstanceDetail } from "./WorkflowInstanceDetail"

export type { WorkflowInstanceItem, WorkflowSortMode } from "./instance-utils"
export { WorkflowInstanceBrowser } from "./WorkflowInstanceBrowser"
export { WorkflowInstanceCard } from "./WorkflowInstanceCard"
export { WorkflowInstanceDetail } from "./WorkflowInstanceDetail"

export function DetailView(props: { entity?: WorkflowEntity; slideActive?: boolean; onView: (view: View) => void; onHome?: () => void }) {
  const runtimeRuns = createMemo(() => getWorkflowRunStore().runs)
  const runtimeDetails = createMemo(() => getWorkflowRunStore().details)
  const [templates, setTemplates] = createSignal<WorkflowTemplateInfo[]>(getCachedTemplateCatalog())
  const [openedItem, setOpenedItem] = createSignal<WorkflowInstanceItem | null>(null)
  const [focusId, setFocusId] = createSignal<string | null>(null)
  const [sortMode, setSortMode] = createSignal<WorkflowSortMode>("time")
  const [query, setQuery] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [loadError, setLoadError] = createSignal<string | null>(null)
  const [startError, setStartError] = createSignal<string | null>(null)
  const [deletedIds, setDeletedIds] = createSignal<Set<string>>(new Set())
  const [panelWidth, setPanelWidth] = createSignal(720)
  const [streamLogs, setStreamLogs] = createSignal<WorkflowStreamLogEntry[]>([])
  const [liveOutputs, setLiveOutputs] = createSignal<Record<string, string>>({})
  let panelRef: HTMLDivElement | undefined
  let panesRef: HTMLDivElement | undefined
  let listPaneRef: HTMLDivElement | undefined
  let listScrollTop = 0
  let listScrollSaveRaf = 0
  let refreshToken = 0
  let refreshPromise: Promise<void> | null = null
  const detailLoads = new Set<string>()

  const instances = createMemo(() => mergeInstances(runtimeRuns()).filter((item) => !deletedIds().has(item.id)))

  const detailItem = createMemo(() => {
    const id = workflowDetailSelectedId()
    if (!id) return null
    return instances().find((item) => item.id === id) ?? openedItem()
  })
  const selectedRuntime = createMemo(() => {
    const id = workflowDetailSelectedId()
    return id ? runtimeDetails()[id] ?? null : null
  })

  const detailRunLoading = createMemo(() => {
    const id = workflowDetailSelectedId()
    if (!id || !workflowDetailPaneOpen()) return false
    const item = detailItem()
    if (!item || item.source !== "runtime") return false
    if (!selectedRuntime()) return true
    return !runDetailIsComplete(selectedRuntime())
  })

  const TERMINAL_RUN_STATUSES = new Set(["completed", "success", "failed", "cancelled"])

  async function forceRuntimeDetail(runId: string, hint?: RuntimeWorkflowRunRecord) {
    if (hint) {
      refreshRuntimeDetail(runId, hint)
      return
    }
    detailLoads.delete(runId)
    try {
      const item = instances().find((entry) => entry.id === runId)
      const existing = runtimeDetails()[runId]
      const terminal = TERMINAL_RUN_STATUSES.has(item?.status ?? existing?.status ?? "")
      const detail = await getWorkflowRun(runId, { light: !terminal })
      mergeCachedRunDetail(runId, detail)
    } catch {
      // Keep last snapshot on transient errors.
    }
  }

  async function ensureRuntimeDetail(runId: string, options?: { force?: boolean }) {
    if (!runId) return
    if (!options?.force && detailLoads.has(runId)) return
    const existing = runtimeDetails()[runId]
    if (!options?.force && runDetailIsComplete(existing)) return
    detailLoads.add(runId)
    try {
      const item = instances().find((entry) => entry.id === runId)
      const terminal = TERMINAL_RUN_STATUSES.has(item?.status ?? existing?.status ?? "")
      const detail = await getWorkflowRun(runId, { light: !terminal })
      mergeCachedRunDetail(runId, detail)
    } catch {
      // Detail view stays open with list/entity snapshot data.
    } finally {
      detailLoads.delete(runId)
    }
  }

  // Live detail lifecycle for the open run. Keyed ONLY on the selection — NOT on
  // instances() — because subscribing to the list here created a self-sustaining
  // freeze loop during active runs: every SSE-driven store.runs mutation re-fired
  // instances(), re-ran this effect, and (since runDetailIsComplete() is false for
  // a running run) refetched the full detail, which mutated the store again, ad
  // infinitum — saturating the main thread/network and locking the whole UI.
  // Now it fires once per open: attach the SSE monitor (live token stream) and
  // poll the full detail on a bounded 4s cadence while the run is non-terminal.
  createEffect(on(
    () => [workflowDetailSelectedId(), workflowDetailPaneOpen(), props.slideActive] as const,
    ([runId, open, slideActive]) => {
      if (!runId || !open || !slideActive) return
      const item = untrack(() => instances().find((entry) => entry.id === runId))
      if (item && item.source !== "runtime") return
      ensureRunMonitor(runId)
      void ensureRuntimeDetail(runId)
      const poll = window.setInterval(() => {
        const status = listCachedRuns().find((entry) => entry.id === runId)?.status
          ?? untrack(() => runtimeDetails()[runId]?.status)
        if (status && TERMINAL_RUN_STATUSES.has(status)) {
          window.clearInterval(poll)
          return
        }
        void forceRuntimeDetail(runId)
      }, 4000)
      onCleanup(() => window.clearInterval(poll))
    },
  ))

  function requestRuntimeDetail() {
    const runId = workflowDetailSelectedId()
    if (!runId) return
    const item = instances().find((entry) => entry.id === runId)
    if (item?.source === "runtime") void ensureRuntimeDetail(runId, { force: true })
  }

  function handleRuntimeUpdated(run: RuntimeWorkflowRunRecord) {
    refreshRuntimeDetail(run.id, run)
  }

  function refreshRuntimeDetail(runId: string, detail: RuntimeWorkflowRunRecord) {
    mergeCachedRunDetail(runId, detail)
  }

  createEffect(on(
    () => [workflowDetailSelectedId(), workflowDetailPaneOpen()] as const,
    ([runId, open]) => {
      if (!runId || !open) return
      setStreamLogs([])
      setLiveOutputs({})
      setStreamLogs(getCachedStreamLogs(runId))
      setLiveOutputs(getCachedLiveOutputs(runId))
    },
  ))

  createEffect(() => {
    const runId = workflowDetailSelectedId()
    if (!runId) return
    getWorkflowRunStore().streamLogs[runId]
    const logs = getCachedStreamLogs(runId)
    setStreamLogs((prev) => {
      if (!prev.length) return logs
      if (logs.length <= prev.length) return prev
      return [...prev, ...logs.slice(prev.length)]
    })
    getWorkflowRunStore().liveOutputs[runId]
    setLiveOutputs(getCachedLiveOutputs(runId))
  })

  createEffect(() => {
    const runId = workflowDetailSelectedId()
    if (!runId || !workflowDetailPaneOpen()) return
    const item = instances().find((entry) => entry.id === runId)
    if (item) setOpenedItem(item)
  })

  createEffect(
    on(
      () => props.slideActive ?? false,
      (active, prevActive) => {
        if (active && !prevActive) {
          setFocusId(null)
          if (!workflowRunIdFromLocation()) closeWorkflowDetailPane()
          void refreshRuns().then(() => {
            if (props.slideActive) syncDetailFromLocation({ openWhenReady: true })
          })
          void revalidateTemplateCatalog().then(setTemplates).catch(() => undefined)
        }
        if (!active && prevActive) {
          setOpenedItem(null)
        }
      },
    ),
  )

  createEffect(
    on(
      () => [instances().length, sortMode(), query(), workflowDetailPaneOpen()] as const,
      ([, , , open]) => {
        if (open) return
        restoreListScroll()
      },
      { defer: true },
    ),
  )

  function rememberListScroll() {
    listScrollTop = listPaneRef?.scrollTop ?? 0
  }

  function restoreListScroll() {
    cancelAnimationFrame(listScrollSaveRaf)
    listScrollSaveRaf = requestAnimationFrame(() => {
      if (!listPaneRef || workflowDetailPaneOpen()) return
      listPaneRef.scrollTop = listScrollTop
      requestAnimationFrame(() => {
        if (listPaneRef && !workflowDetailPaneOpen()) listPaneRef.scrollTop = listScrollTop
      })
    })
  }

  function scrollDetailPaneToTop() {
    panesRef?.querySelector<HTMLElement>(".workflow-run-pane--detail")?.scrollTo({ top: 0 })
  }

  function preserveListScroll(run: () => void) {
    rememberListScroll()
    run()
    restoreListScroll()
  }

  onMount(() => {
    registerWorkflowRunOpenHandler((id) => {
      const item = instances().find((entry) => entry.id === id)
      if (item) openInstance(item)
      else openWorkflowDetailPane(id)
    })

    const ro = new ResizeObserver(([entry]) => {
      if (entry) setPanelWidth(entry.contentRect.width)
    })
    if (panelRef) ro.observe(panelRef)
    const onHashChange = () => {
      if (!props.slideActive) return
      syncDetailFromLocation({ openWhenReady: true })
    }
    window.addEventListener("hashchange", onHashChange)

    const onListScroll = () => rememberListScroll()
    queueMicrotask(() => {
      listPaneRef?.addEventListener("scroll", onListScroll, { passive: true })
    })

    onCleanup(() => {
      unregisterWorkflowRunOpenHandler()
      ro.disconnect()
      window.removeEventListener("hashchange", onHashChange)
      listPaneRef?.removeEventListener("scroll", onListScroll)
    })
    void revalidateTemplateCatalog().then(setTemplates).catch(() => undefined)
    if (props.slideActive) {
      void refreshRuns().then(() => {
        if (props.slideActive) syncDetailFromLocation({ openWhenReady: true })
      })
    }
  })

  function refreshRuns() {
    if (refreshPromise) return refreshPromise
    refreshPromise = loadRuns().finally(() => {
      refreshPromise = null
    })
    return refreshPromise
  }

  async function loadRuns() {
    const token = ++refreshToken
    const blockUi = instances().length === 0 && listCachedRuns().length === 0
    if (blockUi) setLoading(true)
    setLoadError(null)
    try {
      const runs = await fetchWorkflowRunsInDisplayThread()
      if (token !== refreshToken) return
      setCachedRuns(runs)
      syncRunMonitors(runs)
    } catch (error) {
      if (token !== refreshToken) return
      if (instances().length === 0 && listCachedRuns().length === 0) {
        setLoadError(error instanceof Error ? error.message : "Failed to load workflow runs.")
      }
    } finally {
      if (token === refreshToken && blockUi) setLoading(false)
    }
  }

  async function renameInstance(item: WorkflowInstanceItem, name: string) {
    if (item.source === "runtime") {
      try {
        const next = await updateWorkflowRunMetadata(item.id, { name })
        mergeCachedRunDetail(item.id, next)
      } catch {
        return
      }
    } else {
      updateWorkflowEntity(item.id, { name })
    }
    if (workflowDetailSelectedId() === item.id) openWorkflowDetailPane(item.id)
  }

  async function deleteInstance(item: WorkflowInstanceItem) {
    const confirmed = typeof window === "undefined" ? true : window.confirm(`Delete workflow history "${item.name}"?`)
    if (!confirmed) return
    if (workflowDetailSelectedId() === item.id) closeDetail()
    setDeletedIds((current) => new Set([...current, item.id]))
    removeCachedRun(item.id)
    unregisterWorkflowEntity(item.id)
    if (item.source === "runtime") {
      void deleteWorkflowRun(item.id).catch((error) => {
        setStartError(error instanceof Error ? error.message : "Failed to delete workflow history.")
      })
    } else {
      deleteWorkflowRunRecord(item.id)
    }
  }

  function openInstance(item: WorkflowInstanceItem) {
    if (workflowDetailPaneOpen() && workflowDetailSelectedId() === item.id) return
    rememberListScroll()
    batch(() => {
      setFocusId(null)
      setOpenedItem(item)
      openWorkflowDetailPane(item.id)
    })
    requestAnimationFrame(() => scrollDetailPaneToTop())
  }

  function closeDetail() {
    rememberListScroll()
    closeWorkflowDetailPane()
    setOpenedItem(null)
    restoreListScroll()
  }

  function syncDetailFromLocation(options?: { openWhenReady?: boolean }) {
    const runId = syncWorkflowDetailPaneFromLocation()
    if (!runId) return null
    const item = instances().find((entry) => entry.id === runId)
    if (item) {
      if (options?.openWhenReady) openInstance(item)
      return item
    }
    closeWorkflowDetailPane()
    setOpenedItem(null)
    return null
  }

  function goHomeFromDetail() {
    closeDetail()
    props.onHome?.()
  }

  async function startRun(templateId: string) {
    setStartError(null)
    try {
      const uiTemplate = getWorkflowUiTemplate(templateId)
      if (!uiTemplate) throw new Error(`Template not found: ${templateId}`)
      const graph = workflowToRuntimeGraph(uiTemplate)
      const run = await startWorkflowRun({ templateId, name: `Run from ${templateId}`, graph })
      const listItem: WorkflowRunListItem = {
        id: run.id,
        templateId: run.templateId,
        defaultLabel: run.defaultLabel,
        labels: run.labels,
        name: run.name,
        status: run.status,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        finishedAt: run.finishedAt,
        progress: run.progress,
        error: run.error,
      }
      upsertCachedRun(run, listItem)
      syncRunMonitors([listItem, ...runtimeRuns()])
      preserveListScroll(() => {
        setOpenedItem(null)
        openWorkflowDetailPane(run.id)
        scrollDetailPaneToTop()
      })
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Failed to start workflow run.")
    }
  }

  return (
    <div ref={panelRef} class="side-page-shell side-page-shell--detail">
      <div class="detail-layout workflow-run-library side-page-content">
        <Show when={startError()}>
          {(message) => <Glass class="wf-error-banner"><p>{message()}</p></Glass>}
        </Show>
        <Show when={loadError() && instances().length === 0}>
          {(message) => (
            <Glass class="wf-error-banner">
              <p>{message()}</p>
              <p>Ensure backend/opencode is running on port 3456, then refresh.</p>
            </Glass>
          )}
        </Show>
        <Show when={(runtimeReconnecting() || runsStale()) && instances().length > 0}>
          <Glass class="wf-reconnecting-banner">
            <p>Reconnecting to runtime… showing cached workflow data.</p>
          </Glass>
        </Show>
        <div ref={panesRef} class="workflow-run-panes" classList={{ "is-detail": workflowDetailPaneOpen() }}>
          <div ref={listPaneRef} class="workflow-run-pane workflow-run-pane--list">
            <WorkflowInstanceBrowser
              items={instances()}
              templates={templates()}
              sortMode={sortMode()}
              query={query()}
              panelWidth={panelWidth()}
              loading={loading() && instances().length === 0}
              focusId={focusId()}
              onSort={setSortMode}
              onQuery={setQuery}
              onOpen={openInstance}
              onRename={renameInstance}
              onDelete={(item) => void deleteInstance(item)}
              onStartRun={startRun}
              onRefresh={refreshRuns}
            />
          </div>
          <div class="workflow-run-pane workflow-run-pane--detail" data-primary-scroll>
            <Show
              when={detailItem()}
              fallback={(
                <Glass class="workflow-summary-empty">
                  <p>Loading instance…</p>
                  <button type="button" class="workflow-detail-back" onClick={closeDetail}>Back to list</button>
                </Glass>
              )}
            >
              {(item) => (
                <WorkflowInstanceDetail
                  item={item()}
                  items={instances()}
                  runtimeRun={selectedRuntime()}
                  runLoading={detailRunLoading()}
                  streamLogs={streamLogs()}
                  liveOutputs={liveOutputs()}
                  onBack={closeDetail}
                  onHome={goHomeFromDetail}
                  onSelect={openInstance}
                  onRename={(name) => renameInstance(item(), name)}
                  onDelete={() => void deleteInstance(item())}
                  onRequestDetailLoad={requestRuntimeDetail}
                  onRuntimeUpdated={handleRuntimeUpdated}
                />
              )}
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
