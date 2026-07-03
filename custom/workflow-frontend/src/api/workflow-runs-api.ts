import { API_BASE, WORKFLOW_RUN_TIMEOUT_MS, json, readNdjsonStream } from "./http-client"
import type { WorkflowRunStoredEvent } from "./types/events"
import type { StartWorkflowRunOptions, WorkflowRunListItem, WorkflowRunRecord } from "./types/workflow-runs"

export async function startWorkflowRun(options: StartWorkflowRunOptions) {
  return json<{ run: WorkflowRunRecord }>("/workflow-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  }).then((x) => x.run)
}

export async function listWorkflowRuns() {
  return json<{ runs: WorkflowRunListItem[] }>("/workflow-runs").then((x) => x.runs)
}

export async function getWorkflowRun(id: string, options?: { light?: boolean }) {
  const query = options?.light === false ? "" : "?view=light"
  return json<{ run: WorkflowRunRecord }>(`/workflow-runs/${encodeURIComponent(id)}${query}`, undefined, WORKFLOW_RUN_TIMEOUT_MS).then((x) => x.run)
}

export async function* streamWorkflowRun(runId: string, signal?: AbortSignal): AsyncGenerator<WorkflowRunStoredEvent> {
  const response = await fetch(`${API_BASE}/workflow-runs/${encodeURIComponent(runId)}/stream`, { signal })
  if (!response.ok) throw new Error(await response.text().catch(() => `${response.status} ${response.statusText}`))
  yield* readNdjsonStream(response)
}

export async function updateWorkflowRunLabels(id: string, labels: string[], defaultLabel?: string) {
  return json<{ run: WorkflowRunRecord }>(`/workflow-runs/${encodeURIComponent(id)}/labels`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labels, defaultLabel }),
  }).then((x) => x.run)
}

export async function updateWorkflowRunMetadata(id: string, metadata: { name?: string; labels?: string[]; defaultLabel?: string }) {
  return json<{ run: WorkflowRunRecord }>(`/workflow-runs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  }).then((x) => x.run)
}

export async function deleteWorkflowRun(id: string) {
  return json<{ deleted: string }>(`/workflow-runs/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function cancelWorkflowRun(id: string) {
  return json<{ run: WorkflowRunRecord }>(`/workflow-runs/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  }).then((x) => x.run)
}

export async function pauseWorkflowRun(id: string) {
  return json<{ run: WorkflowRunRecord }>(`/workflow-runs/${encodeURIComponent(id)}/pause`, {
    method: "POST",
  }).then((x) => x.run)
}

export async function interruptWorkflowRun(id: string) {
  return json<{ run: WorkflowRunRecord }>(`/workflow-runs/${encodeURIComponent(id)}/interrupt`, {
    method: "POST",
  }).then((x) => x.run)
}

export async function continueWorkflowRun(id: string, options?: { inquiryReply?: string }) {
  return json<{ run: WorkflowRunRecord }>(`/workflow-runs/${encodeURIComponent(id)}/continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  }).then((x) => x.run)
}

export async function retryWorkflowNode(id: string, nodeId: string) {
  return json<{ run: WorkflowRunRecord }>(`/workflow-runs/${encodeURIComponent(id)}/retry-node`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeId }),
  }).then((x) => x.run)
}
