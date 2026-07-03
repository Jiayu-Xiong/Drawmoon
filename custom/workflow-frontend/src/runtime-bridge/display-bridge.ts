/**
 * Main-thread bridge to the display worker.
 * Keeps network polling off the Solid render path.
 */

import type { RuntimeSnapshot, WorkflowRunListItem } from "../api"
import { setRunsStale } from "./workflow-run-store"

type DisplayWorkerInbound =
  | { type: "start-runs-poll"; intervalMs?: number; stopWhenIdle?: boolean }
  | { type: "stop-runs-poll" }
  | { type: "fetch-runs" }
  | { type: "fetch-runtime-lite" }

type DisplayWorkerOutbound =
  | { type: "runs"; runs: WorkflowRunListItem[]; error?: string; stale?: boolean }
  | { type: "runtime-lite"; snapshot: RuntimeSnapshot | null; error?: string }

export interface RunsPollOptions {
  intervalMs?: number
  stopWhenIdle?: boolean
  onRuns: (runs: WorkflowRunListItem[]) => void
  shouldPoll?: () => boolean
}

let sharedWorker: Worker | null = null
const runsListeners = new Set<(runs: WorkflowRunListItem[]) => void>()
let runsPollActive = false
let pollStopWhenIdle = false
let pollIntervalMs = 8000

function worker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL("./display-worker.ts", import.meta.url), { type: "module" })
    sharedWorker.addEventListener("message", (event: MessageEvent<DisplayWorkerOutbound>) => {
      const data = event.data
      if (data?.type === "runs") {
        runsListeners.forEach((listener) => listener(data.runs ?? []))
      }
    })
  }
  return sharedWorker
}

export function fetchWorkflowRunsInDisplayThread(): Promise<WorkflowRunListItem[]> {
  return new Promise((resolve) => {
    const w = worker()
    const onMessage = (event: MessageEvent<DisplayWorkerOutbound>) => {
      if (event.data?.type !== "runs") return
      w.removeEventListener("message", onMessage)
      setRunsStale(event.data.stale === true)
      resolve(event.data.runs ?? [])
    }
    w.addEventListener("message", onMessage)
    w.postMessage({ type: "fetch-runs" } satisfies DisplayWorkerInbound)
  })
}

export function startWorkflowRunsPoll(options: RunsPollOptions): () => void {
  const w = worker()
  const listener = (runs: WorkflowRunListItem[]) => {
    if (options.shouldPoll && !options.shouldPoll()) return
    options.onRuns(runs)
  }
  runsListeners.add(listener)
  if (!runsPollActive) {
    runsPollActive = true
    pollStopWhenIdle = options.stopWhenIdle === true
    pollIntervalMs = options.intervalMs ?? 8000
    w.postMessage({
      type: "start-runs-poll",
      intervalMs: pollIntervalMs,
      stopWhenIdle: pollStopWhenIdle,
    } satisfies DisplayWorkerInbound)
  }
  return () => {
    runsListeners.delete(listener)
    if (runsListeners.size === 0 && runsPollActive) {
      runsPollActive = false
      w.postMessage({ type: "stop-runs-poll" } satisfies DisplayWorkerInbound)
    }
  }
}

export function fetchRuntimeSnapshotInDisplayThread(): Promise<RuntimeSnapshot | null> {
  return new Promise((resolve) => {
    const w = worker()
    const onMessage = (event: MessageEvent<DisplayWorkerOutbound>) => {
      if (event.data?.type !== "runtime-lite") return
      w.removeEventListener("message", onMessage)
      resolve((event.data.snapshot as RuntimeSnapshot | null) ?? null)
    }
    w.addEventListener("message", onMessage)
    w.postMessage({ type: "fetch-runtime-lite" } satisfies DisplayWorkerInbound)
  })
}

export function disposeDisplayBridge() {
  runsListeners.clear()
  runsPollActive = false
  sharedWorker?.terminate()
  sharedWorker = null
}
