/**
 * Display thread — polls workflow/runtime APIs off the UI render thread.
 */

const API_BASE = "/api"
const REQUEST_TIMEOUT_MS = 12_000
const OFFLINE_PROBE_MS = 15_000
const OFFLINE_MAX_BACKOFF_MS = 120_000

const ACTIVE_STATUSES = new Set(["queued", "running", "paused", "looping"])

type DisplayWorkerInbound =
  | { type: "start-runs-poll"; intervalMs?: number; stopWhenIdle?: boolean }
  | { type: "stop-runs-poll" }
  | { type: "fetch-runs" }
  | { type: "fetch-runtime-lite" }

type DisplayWorkerOutbound =
  | { type: "runs"; runs: unknown[]; error?: string; stale?: boolean }
  | { type: "runtime-lite"; snapshot: unknown | null; error?: string }

let runsTimer: ReturnType<typeof setInterval> | null = null
let stopWhenIdle = true
let idlePollStreak = 0
let consecutiveFailures = 0
let offlineUntil = 0
let lastGoodRuns: unknown[] = []

function isProbePath(path: string) {
  return path === "/health" || path === "/bootstrap"
}

function runtimeOfflineBackoffMs() {
  return Math.min(OFFLINE_PROBE_MS * 2 ** Math.min(consecutiveFailures - 2, 4), OFFLINE_MAX_BACKOFF_MS)
}

function markSuccess() {
  consecutiveFailures = 0
  offlineUntil = 0
}

function markFailure() {
  consecutiveFailures += 1
  if (consecutiveFailures >= 2) {
    offlineUntil = Date.now() + runtimeOfflineBackoffMs()
  }
}

function isRuntimeOffline() {
  return consecutiveFailures >= 2 && Date.now() < offlineUntil
}

async function fetchJson<T>(path: string, options?: { allowOffline?: boolean }): Promise<T> {
  if (!options?.allowOffline && isRuntimeOffline() && !isProbePath(path)) {
    throw new Error("Runtime offline")
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    markSuccess()
    return await response.json() as T
  } catch (error) {
    markFailure()
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchRuns() {
  try {
    if (isRuntimeOffline()) {
      await fetchJson<{ status?: string }>("/health", { allowOffline: true }).catch(() => undefined)
    }
    const data = await fetchJson<{ runs?: Array<{ status?: string }> }>("/workflow-runs")
    const runs = data.runs ?? []
    lastGoodRuns = runs
    const hasActive = runs.some((run) => ACTIVE_STATUSES.has(run.status ?? ""))
    if (stopWhenIdle) {
      idlePollStreak = hasActive ? 0 : idlePollStreak + 1
      const cacheEmpty = lastGoodRuns.length === 0
      if (!hasActive && !cacheEmpty && idlePollStreak >= 2 && runsTimer) {
        clearInterval(runsTimer)
        runsTimer = null
        idlePollStreak = 0
      }
    }
    self.postMessage({ type: "runs", runs } satisfies DisplayWorkerOutbound)
  } catch (err) {
    if (lastGoodRuns.length) {
      self.postMessage({
        type: "runs",
        runs: lastGoodRuns,
        stale: true,
        error: err instanceof Error ? err.message : String(err),
      } satisfies DisplayWorkerOutbound)
      return
    }
    self.postMessage({
      type: "runs",
      runs: [],
      error: err instanceof Error ? err.message : String(err),
    } satisfies DisplayWorkerOutbound)
  }
}

async function fetchRuntimeLite() {
  try {
    const bootstrap = await fetchJson<{
      health?: { status?: string }
      providers?: unknown[]
      commands?: Record<string, unknown>
      cliInfo?: unknown
      cliRefreshing?: string[]
      cliRefreshActive?: boolean
      templates?: unknown[]
    }>("/bootstrap", { allowOffline: true })
    self.postMessage({
      type: "runtime-lite",
      snapshot: {
        health: bootstrap.health?.status === "ok",
        providers: bootstrap.providers ?? [],
        commands: bootstrap.commands ?? {},
        cliInfo: bootstrap.cliInfo ?? null,
        cliRefreshing: bootstrap.cliRefreshing ?? [],
        cliRefreshActive: bootstrap.cliRefreshActive ?? false,
        cacheEntries: [],
        traces: [],
        sessions: [],
        templates: bootstrap.templates ?? [],
      },
    } satisfies DisplayWorkerOutbound)
  } catch (err) {
    self.postMessage({
      type: "runtime-lite",
      snapshot: null,
      error: err instanceof Error ? err.message : String(err),
    } satisfies DisplayWorkerOutbound)
  }
}

self.onmessage = (event: MessageEvent<DisplayWorkerInbound>) => {
  const msg = event.data
  if (msg.type === "start-runs-poll") {
    if (runsTimer) clearInterval(runsTimer)
    stopWhenIdle = msg.stopWhenIdle !== false
    idlePollStreak = 0
    void fetchRuns()
    runsTimer = setInterval(() => void fetchRuns(), msg.intervalMs ?? 3000)
    return
  }
  if (msg.type === "stop-runs-poll") {
    if (runsTimer) clearInterval(runsTimer)
    runsTimer = null
    return
  }
  if (msg.type === "fetch-runs") {
    void fetchRuns()
    return
  }
  if (msg.type === "fetch-runtime-lite") {
    void fetchRuntimeLite()
  }
}
