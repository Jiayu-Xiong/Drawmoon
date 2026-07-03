import { batch } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSignal } from "solid-js"

import type { WorkflowRunListItem, WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../api"
import type { WorkflowStreamLogEntry } from "./workflow-run-stream"
import { entityFromRuntimeRun, entityFromRunListItem } from "../data/workflow-entity"
import { lifecycleNodeStatus, mergeRuntimeRunDetail, runtimeDetailContentVersion } from "../pages/console/slides/workflow-runs/workflow-run-detail-utils"

export interface WorkflowRunStoreState {
  runs: WorkflowRunListItem[]
  details: Record<string, RuntimeWorkflowRunRecord>
  liveOutputs: Record<string, Record<string, string>>
  streamLogs: Record<string, WorkflowStreamLogEntry[]>
}

const [store, setStore] = createStore<WorkflowRunStoreState>({
  runs: [],
  details: {},
  liveOutputs: {},
  streamLogs: {},
})

export const [runsStale, setRunsStale] = createSignal(false)

const MAX_LIVE_OUTPUT_CHARS = 48_000
const MAX_STREAM_LOGS = 120

// SSE events (stdout tokens, progress/log lines) can arrive hundreds of times a
// second during an active run. Writing to the store per event — and concatenating
// the whole live-output buffer per token — pegs the main thread and starves
// rendering/input (the UI freeze). Instead we buffer per-event work as O(delta)
// pushes and flush the store at most ~10x/sec in a single batched pass, so the
// number of reactive re-renders is bounded regardless of event rate.
const FLUSH_INTERVAL_MS = 100
const liveOutputPending = new Map<string, Map<string, string[]>>()
const liveOutputResets = new Map<string, Set<string>>()
const streamLogPending = new Map<string, WorkflowStreamLogEntry[]>()
let flushTimer = 0
let lastFlushAt = 0

function flushStoreUpdates() {
  flushTimer = 0
  lastFlushAt = Date.now()
  if (!liveOutputPending.size && !streamLogPending.size) return
  batch(() => {
    if (liveOutputPending.size) {
      setStore(produce((draft) => {
        for (const [runId, nodes] of liveOutputPending.entries()) {
          const current = { ...(draft.liveOutputs[runId] ?? {}) }
          const resets = liveOutputResets.get(runId)
          for (const [nodeId, chunks] of nodes.entries()) {
            const base = resets?.has(nodeId) ? "" : (current[nodeId] ?? "")
            const merged = base + chunks.join("")
            current[nodeId] = merged.length > MAX_LIVE_OUTPUT_CHARS ? merged.slice(-MAX_LIVE_OUTPUT_CHARS) : merged
          }
          draft.liveOutputs[runId] = current
        }
      }))
    }
    if (streamLogPending.size) {
      setStore(produce((draft) => {
        for (const [runId, entries] of streamLogPending.entries()) {
          const next = [...(draft.streamLogs[runId] ?? [])]
          for (const entry of entries) {
            const last = next[next.length - 1]
            if (last && last.message === entry.message && last.nodeId === entry.nodeId) continue
            next.push(entry)
          }
          draft.streamLogs[runId] = next.length > MAX_STREAM_LOGS ? next.slice(-MAX_STREAM_LOGS) : next
        }
      }))
    }
  })
  liveOutputPending.clear()
  liveOutputResets.clear()
  streamLogPending.clear()
}

function scheduleStoreFlush() {
  if (flushTimer) return
  const wait = Math.max(0, FLUSH_INTERVAL_MS - (Date.now() - lastFlushAt))
  flushTimer = window.setTimeout(flushStoreUpdates, wait)
}

export function scheduleLiveOutputFlush() {
  scheduleStoreFlush()
}

export function getWorkflowRunStore() {
  return store
}

export function listCachedRuns(): WorkflowRunListItem[] {
  return store.runs
}

export function getCachedRunDetail(runId: string): RuntimeWorkflowRunRecord | undefined {
  return store.details[runId]
}

export function getCachedLiveOutputs(runId: string): Record<string, string> {
  return store.liveOutputs[runId] ?? {}
}

export function getCachedStreamLogs(runId: string): WorkflowStreamLogEntry[] {
  return store.streamLogs[runId] ?? []
}

function runListItemSignature(run: WorkflowRunListItem): string {
  return [
    run.status,
    run.updatedAt,
    run.progress?.percent,
    run.progress?.completedNodes,
    run.progress?.runningNodes,
    (run.currentNodeIds ?? []).join(","),
    run.error ?? "",
  ].join("|")
}

export function setCachedRuns(runs: WorkflowRunListItem[], options?: { stale?: boolean }) {
  const prevById = new Map(store.runs.map((run) => [run.id, run]))
  setStore("runs", runs)
  setRunsStale(options?.stale === true)
  for (const run of runs) {
    const prev = prevById.get(run.id)
    if (!prev || runListItemSignature(prev) !== runListItemSignature(run)) {
      entityFromRunListItem(run)
    }
  }
}

export function patchCachedRunListItem(runId: string, patch: Partial<WorkflowRunListItem>) {
  setStore("runs", (run) => run.id === runId, (item) => ({ ...item, ...patch }))
}

export function mergeCachedRunDetail(runId: string, detail: RuntimeWorkflowRunRecord) {
  const prev = store.details[runId]
  const merged = mergeRuntimeRunDetail(prev, detail)
  if (prev && runtimeDetailContentVersion(prev) === runtimeDetailContentVersion(merged)) return merged

  batch(() => {
    setStore("details", runId, merged)
    const prevList = store.runs.find((run) => run.id === runId)
    if (prevList) {
      setStore("runs", (run) => run.id === runId, {
        status: merged.status,
        updatedAt: merged.updatedAt,
        finishedAt: merged.finishedAt,
        progress: merged.progress,
        currentNodeIds: merged.currentNodeIds,
        nodeStates: Object.fromEntries(
          Object.entries(merged.nodeStates ?? {}).map(([nodeId, state]) => [nodeId, { status: state.status }]),
        ),
        error: merged.error,
      })
    }
  })
  entityFromRuntimeRun(merged, store.runs.findIndex((entry) => entry.id === runId) + 1)
  return merged
}

export function patchCachedNodeLifecycle(
  runId: string,
  event: { type: string; nodeId?: string; status?: string; error?: string },
) {
  const nodeId = event.nodeId
  if (!nodeId) return
  const status = lifecycleNodeStatus(event)
  if (!status) return

  const prev = store.details[runId]
  if (!prev) return
  const prevStatus = prev.nodeStates?.[nodeId]?.status
  if (prevStatus === status && !event.error) return

  const next: RuntimeWorkflowRunRecord = {
    ...prev,
    nodeStates: {
      ...prev.nodeStates,
      [nodeId]: {
        id: nodeId,
        status,
        startedAt: prev.nodeStates?.[nodeId]?.startedAt ?? null,
        finishedAt: prev.nodeStates?.[nodeId]?.finishedAt ?? null,
        ...(event.error ? { error: event.error } : {}),
        ...(prev.nodeStates?.[nodeId]?.sessionId ? { sessionId: prev.nodeStates[nodeId]!.sessionId } : {}),
      },
    },
    currentNodeIds: status === "running"
      ? [...new Set([...(prev.currentNodeIds ?? []), nodeId])]
      : (prev.currentNodeIds ?? []).filter((id) => id !== nodeId),
    updatedAt: new Date().toISOString(),
  }

  batch(() => {
    setStore("details", runId, next)
    setStore("runs", (run) => run.id === runId, {
      currentNodeIds: next.currentNodeIds,
      nodeStates: Object.fromEntries(
        Object.entries(next.nodeStates ?? {}).map(([id, state]) => [id, { status: state.status }]),
      ),
      updatedAt: next.updatedAt,
    })
  })
  entityFromRuntimeRun(next, store.runs.findIndex((entry) => entry.id === runId) + 1)
}

function normalizeStreamLogMessage(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed) return null
  if (/^opencode$/i.test(trimmed)) return null
  const tool = trimmed.match(/^opencode\s+(.+)$/i)
  if (tool) return `工具调用: ${tool[1]}`
  if (trimmed.length < 4 && !/[\u4e00-\u9fff]/.test(trimmed)) return null
  return trimmed
}

export function appendCachedStreamLog(runId: string, entry: WorkflowStreamLogEntry) {
  const message = normalizeStreamLogMessage(entry.message)
  if (!message) return
  const entries = streamLogPending.get(runId) ?? []
  const last = entries[entries.length - 1]
  if (last && last.message === message && last.nodeId === entry.nodeId) return
  entries.push({ ...entry, message })
  streamLogPending.set(runId, entries)
  scheduleStoreFlush()
}

export function appendCachedLiveOutput(runId: string, nodeId: string, text: string, append: boolean) {
  // O(1) per event: buffer the raw chunk; the full string is joined once per
  // flush instead of re-concatenating the (up to 48k char) buffer per token.
  let bucket = liveOutputPending.get(runId)
  if (!bucket) {
    bucket = new Map<string, string[]>()
    liveOutputPending.set(runId, bucket)
  }
  if (!append) {
    bucket.set(nodeId, [text])
    let resets = liveOutputResets.get(runId)
    if (!resets) {
      resets = new Set<string>()
      liveOutputResets.set(runId, resets)
    }
    resets.add(nodeId)
  } else {
    const chunks = bucket.get(nodeId)
    if (chunks) chunks.push(text)
    else bucket.set(nodeId, [text])
  }
  scheduleStoreFlush()
}

export function clearCachedLiveOutputs(runId: string) {
  liveOutputPending.delete(runId)
  liveOutputResets.delete(runId)
  setStore(produce((draft) => {
    delete draft.liveOutputs[runId]
  }))
}

export function clearCachedStreamLogs(runId: string) {
  streamLogPending.delete(runId)
  setStore(produce((draft) => {
    delete draft.streamLogs[runId]
  }))
}

export function removeCachedRun(runId: string) {
  batch(() => {
    setStore(produce((draft) => {
      draft.runs = draft.runs.filter((run) => run.id !== runId)
      delete draft.details[runId]
      delete draft.liveOutputs[runId]
      delete draft.streamLogs[runId]
    }))
  })
}

export function upsertCachedRun(run: RuntimeWorkflowRunRecord, listItem?: WorkflowRunListItem) {
  mergeCachedRunDetail(run.id, run)
  if (listItem) {
    const exists = store.runs.some((item) => item.id === run.id)
    if (exists) patchCachedRunListItem(run.id, listItem)
    else setStore("runs", (items) => [listItem, ...items])
  }
}
