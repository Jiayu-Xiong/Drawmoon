import type { WorkflowRunListItem } from "../api"
import { subscribeWorkflowRunStream, type WorkflowRunStreamHandlers } from "./workflow-run-stream"
import {
  appendCachedLiveOutput,
  appendCachedStreamLog,
  clearCachedLiveOutputs,
  clearCachedStreamLogs,
  listCachedRuns,
  mergeCachedRunDetail,
  patchCachedNodeLifecycle,
} from "./workflow-run-store"

const TERMINAL_RUN_STATUSES = new Set(["completed", "success", "failed", "cancelled"])

interface MonitorEntry {
  abort: AbortController
  subscribers: number
}

const monitors = new Map<string, MonitorEntry>()

function shouldMonitorRun(run: WorkflowRunListItem) {
  return run.status === "running" || run.status === "queued" || run.status === "looping"
}

function startMonitor(runId: string) {
  if (monitors.has(runId)) return
  const abort = new AbortController()
  monitors.set(runId, { abort, subscribers: 0 })

  const handlers: WorkflowRunStreamHandlers = {
    onLog: (entry) => appendCachedStreamLog(runId, entry),
    onLiveOutput: (nodeId, text, append) => appendCachedLiveOutput(runId, nodeId, text, append),
    onNodeLifecycle: (event) => patchCachedNodeLifecycle(runId, event),
    onRunUpdated: (detail) => {
      mergeCachedRunDetail(runId, detail)
      if (TERMINAL_RUN_STATUSES.has(detail.status)) {
        stopMonitor(runId)
        clearCachedLiveOutputs(runId)
      }
    },
  }

  void subscribeWorkflowRunStream(runId, handlers, abort.signal).catch(() => {
    // Reconnect handled inside subscribeWorkflowRunStream.
  }).finally(() => {
    if (monitors.get(runId)?.abort === abort) {
      monitors.delete(runId)
    }
  })
}

function stopMonitor(runId: string) {
  const entry = monitors.get(runId)
  if (!entry) return
  entry.abort.abort()
  monitors.delete(runId)
}

export function syncRunMonitors(runs: WorkflowRunListItem[] = listCachedRuns()) {
  const activeIds = new Set<string>()
  for (const run of runs) {
    if (shouldMonitorRun(run)) {
      activeIds.add(run.id)
      startMonitor(run.id)
    }
  }
  for (const runId of monitors.keys()) {
    if (!activeIds.has(runId)) {
      stopMonitor(runId)
      clearCachedStreamLogs(runId)
    }
  }
}

export function ensureRunMonitor(runId: string) {
  startMonitor(runId)
}

export function disposeRunMonitors() {
  for (const runId of [...monitors.keys()]) stopMonitor(runId)
}

export function subscribeRunMonitor(runId: string): () => void {
  ensureRunMonitor(runId)
  const entry = monitors.get(runId)
  if (entry) entry.subscribers += 1
  return () => {
    const current = monitors.get(runId)
    if (!current) return
    current.subscribers = Math.max(0, current.subscribers - 1)
  }
}
