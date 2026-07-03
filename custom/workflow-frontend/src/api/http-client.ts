import type { RunEvent, WorkflowRunStoredEvent } from "./types/events"
import { createSignal } from "solid-js"

export const API_BASE = "/api"
export const REQUEST_TIMEOUT_MS = 12_000
export const WORKFLOW_RUN_TIMEOUT_MS = 120_000
export const OFFLINE_PROBE_MS = 15_000
export const OFFLINE_MAX_BACKOFF_MS = 120_000

let consecutiveFailures = 0
let offlineUntil = 0

export const [runtimeReconnecting, setRuntimeReconnecting] = createSignal(false)

function isProbePath(path: string) {
  return path === "/health" || path === "/bootstrap"
}

export function isRuntimeOffline() {
  return consecutiveFailures >= 2 && Date.now() < offlineUntil
}

export function runtimeOfflineBackoffMs() {
  return Math.min(OFFLINE_PROBE_MS * 2 ** Math.min(consecutiveFailures - 2, 4), OFFLINE_MAX_BACKOFF_MS)
}

export function markRuntimeSuccess() {
  consecutiveFailures = 0
  offlineUntil = 0
  setRuntimeReconnecting(false)
}

function markFailure() {
  consecutiveFailures += 1
  if (consecutiveFailures >= 2) {
    offlineUntil = Date.now() + runtimeOfflineBackoffMs()
    setRuntimeReconnecting(true)
  }
}

export async function fetchWithTimeout(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  if (isRuntimeOffline() && !isProbePath(path)) {
    const probeController = new AbortController()
    const probeTimeout = setTimeout(() => probeController.abort(), 5000)
    try {
      const probe = await fetch(`${API_BASE}/health`, { signal: probeController.signal })
      if (probe.ok) markRuntimeSuccess()
      else throw new Error("Runtime offline")
    } catch (error) {
      if (error instanceof Error && error.message === "Runtime offline") throw error
      throw new Error("Runtime offline")
    } finally {
      clearTimeout(probeTimeout)
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal })
    if (!response.ok) {
      markFailure()
      throw new Error(`${response.status} ${response.statusText}`)
    }
    markRuntimeSuccess()
    return response
  } catch (error) {
    if (!(error instanceof Error && error.message === "Runtime offline")) {
      markFailure()
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function json<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const response = await fetchWithTimeout(path, init, timeoutMs)
  return response.json() as Promise<T>
}

export async function* readNdjsonStream(response: Response): AsyncGenerator<WorkflowRunStoredEvent> {
  if (!response.body) throw new Error("No response body")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as WorkflowRunStoredEvent
    }
  }

  if (buffer.trim()) yield JSON.parse(buffer) as WorkflowRunStoredEvent
}

export async function* ndjson(path: string, body: unknown): AsyncGenerator<RunEvent> {
  const response = await fetchWithTimeout(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  for await (const event of readNdjsonStream(response)) {
    yield event as RunEvent
  }
}
