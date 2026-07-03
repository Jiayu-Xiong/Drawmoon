/**
 * Bun worker — runs workflow execution off the HTTP/main event-loop thread.
 * Store + event log are file-backed so the API thread can read progress while nodes run here.
 */

import { AgentRuntime } from "../../runtime.js"
import { FileWorkflowRunEventLog } from "../events.js"
import { WorkflowRunRunner } from "../runner.js"
import { FileWorkflowRunStore } from "../store.js"
import type { ExecutionWorkerInbound, ExecutionWorkerOutbound } from "./types.js"

declare const self: { postMessage(message: ExecutionWorkerOutbound): void; onmessage: ((event: MessageEvent) => void) | null }

let runner: WorkflowRunRunner | null = null

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as ExecutionWorkerInbound
  if (msg.type === "init") {
    const runtime = new AgentRuntime({ dataDir: msg.dataDir, cacheMode: msg.cacheMode })
    const store = new FileWorkflowRunStore({ dataDir: msg.dataDir })
    const events = new FileWorkflowRunEventLog({ dataDir: msg.dataDir })
    runner = new WorkflowRunRunner({ runtime, store, events, dataDir: msg.dataDir })
    self.postMessage({ type: "ready" })
    return
  }

  if (!runner) return

  if (msg.type === "execute") {
    try {
      await runner.runExecution(msg.runId, msg.options ?? {}, msg.startAtNodeId)
      self.postMessage({ type: "execute-done", runId: msg.runId })
    } catch (err) {
      self.postMessage({
        type: "execute-done",
        runId: msg.runId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (msg.type === "cancel") {
    runner.cancelWorkflowRun(msg.runId)
    return
  }

  if (msg.type === "shutdown") {
    runner.shutdown(msg.reason)
  }
}
