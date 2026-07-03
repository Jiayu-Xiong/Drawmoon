import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import type { CliLimitWindow, CliQuotaSnapshot, CliTelemetrySnapshot, CliUsagePeriod } from "../schema/cli-budget-types.js"
import { buildQuotaSnapshot } from "../cli-limits.js"
import type { CliProbe } from "./types.js"

type CodexRateWindow = {
  used_percent?: number
  usedPercent?: number
  window_minutes?: number
  windowMinutes?: number
  window_duration_mins?: number
  windowDurationMins?: number
  resets_at?: number | string
  resetsAt?: number | string
}

export type CodexRateLimitsPayload = {
  limit_id?: string
  plan_type?: string
  planType?: string
  primary?: CodexRateWindow
  secondary?: CodexRateWindow
  rate_limit_reached_type?: string | null
}

type CodexTokenCountPayload = {
  type?: string
  info?: {
    total_token_usage?: {
      input_tokens?: number
      cached_input_tokens?: number
      output_tokens?: number
      reasoning_output_tokens?: number
      total_tokens?: number
    }
    model_context_window?: number
  }
  rate_limits?: CodexRateLimitsPayload
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeResetsAt(value: unknown): string | null {
  const num = asNumber(value)
  if (num == null) return null
  const ms = num < 20_000_000_000 ? num * 1000 : num
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function windowKind(name: "primary" | "secondary", window: CodexRateWindow): CliLimitWindow["kind"] {
  const mins = asNumber(window.window_minutes ?? window.windowMinutes ?? window.window_duration_mins ?? window.windowDurationMins) ?? 0
  if (mins >= 7 * 24 * 60) return "weekly"
  if (name === "secondary") return "weekly"
  return "session"
}

function windowLabel(name: "primary" | "secondary", window: CodexRateWindow): string {
  const mins = asNumber(window.window_minutes ?? window.windowMinutes ?? window.window_duration_mins ?? window.windowDurationMins)
  if (name === "secondary" || (mins != null && mins >= 7 * 24 * 60)) return "Weekly quota"
  if (mins === 300) return "5-hour window"
  return mins != null ? `${mins}m window` : "Session window"
}

export function mapCodexRateLimitWindows(rateLimits: CodexRateLimitsPayload): CliLimitWindow[] {
  const windows: CliLimitWindow[] = []
  for (const key of ["secondary", "primary"] as const) {
    const window = rateLimits[key]
    if (!window) continue
    const usedPercent = asNumber(window.used_percent ?? window.usedPercent)
    const remainingPercent = usedPercent != null ? Number((100 - usedPercent).toFixed(1)) : null
    windows.push({
      kind: windowKind(key, window),
      label: windowLabel(key, window),
      used: usedPercent,
      limit: 100,
      remaining: remainingPercent,
      usedPercent,
      remainingPercent,
      resetsAt: normalizeResetsAt(window.resets_at ?? window.resetsAt),
    })
  }
  return windows
}

function discoverCodexSessionFiles(root = join(homedir(), ".codex", "sessions")): string[] {
  if (!existsSync(root)) return []
  const files: Array<{ path: string; mtime: number }> = []

  function walk(dir: string) {
    let entries: import("node:fs").Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import("node:fs").Dirent[]
    } catch {
      return
    }
    for (const entry of entries) {
      const name = String(entry.name)
      const full = join(dir, name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!name.endsWith(".jsonl")) continue
      try {
        files.push({ path: full, mtime: statSync(full).mtimeMs })
      } catch {
        // skip unreadable files
      }
    }
  }

  walk(root)
  return files.sort((a, b) => b.mtime - a.mtime).map((item) => item.path)
}

function parseSessionLine(line: string): { timestamp?: string; rateLimits?: CodexRateLimitsPayload; usage?: CodexTokenCountPayload["info"] } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith("{")) return null
  try {
    const row = JSON.parse(trimmed) as {
      timestamp?: string
      type?: string
      payload?: CodexTokenCountPayload
    }
    if (row.type !== "event_msg" || row.payload?.type !== "token_count") return null
    return {
      timestamp: row.timestamp,
      rateLimits: row.payload.rate_limits,
      usage: row.payload.info ?? undefined,
    }
  } catch {
    return null
  }
}

export function extractLatestCodexRateLimits(sessionFiles: string[], maxFiles = 12): {
  rateLimits: CodexRateLimitsPayload | null
  lastActivityAt: string | null
  sessionPath: string | null
  usage: CodexTokenCountPayload["info"] | null
} {
  for (const filePath of sessionFiles.slice(0, maxFiles)) {
    let text = ""
    try {
      text = readFileSync(filePath, "utf-8")
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/).filter(Boolean)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const parsed = parseSessionLine(lines[index] ?? "")
      if (!parsed?.rateLimits?.primary && !parsed?.rateLimits?.secondary) continue
      return {
        rateLimits: parsed.rateLimits ?? null,
        lastActivityAt: parsed.timestamp ?? null,
        sessionPath: filePath,
        usage: parsed.usage ?? null,
      }
    }
  }
  return { rateLimits: null, lastActivityAt: null, sessionPath: null, usage: null }
}

function buildCodexTelemetry(usage: CodexTokenCountPayload["info"] | null, sessionPath: string | null): CliTelemetrySnapshot | undefined {
  if (!usage?.total_token_usage) return undefined
  const total = usage.total_token_usage
  const period: CliUsagePeriod = {
    totalTokens: total.total_tokens ?? 0,
    inputTokens: total.input_tokens,
    outputTokens: total.output_tokens,
    cacheReadTokens: total.cached_input_tokens,
    reasoningTokens: total.reasoning_output_tokens,
  }
  return {
    source: "local-db",
    available: true,
    summary: `Latest Codex session: ${(total.total_tokens ?? 0).toLocaleString()} tokens`,
    periods: { today: period },
    rawPath: sessionPath,
  }
}

function formatQuotaSummary(rateLimits: CodexRateLimitsPayload, windows: CliLimitWindow[]): string {
  const weekly = windows.find((w) => w.kind === "weekly")
  const session = windows.find((w) => w.kind === "session")
  const plan = rateLimits.plan_type ?? rateLimits.planType ?? "unknown"
  const parts = [`plan ${plan}`]
  if (weekly?.remainingPercent != null) parts.push(`weekly ${weekly.remainingPercent}% left`)
  if (session?.remainingPercent != null) parts.push(`5h ${session.remainingPercent}% left`)
  return parts.join(" · ")
}

export type CodexLimitsResult = {
  quota: CliQuotaSnapshot
  telemetry?: CliTelemetrySnapshot
  probe: CliProbe
  accountEmail: string | null
  planType: string | null
}

export function collectCodexLimits(env: NodeJS.ProcessEnv = process.env): CodexLimitsResult {
  const started = Date.now()
  const sessionsRoot = join(homedir(), ".codex", "sessions")
  const sessionFiles = discoverCodexSessionFiles(sessionsRoot)
  const latest = extractLatestCodexRateLimits(sessionFiles)
  const windows = latest.rateLimits ? mapCodexRateLimitWindows(latest.rateLimits) : []
  const available = windows.length > 0
  const summary = latest.rateLimits
    ? formatQuotaSummary(latest.rateLimits, windows)
    : sessionFiles.length
      ? "Codex sessions found but no rate_limits snapshot yet — run Codex once to refresh."
      : "No Codex session logs at ~/.codex/sessions"

  const quota = buildQuotaSnapshot(
    "weekly_percent",
    summary,
    available,
    latest.sessionPath,
    windows,
  )

  return {
    quota,
    telemetry: buildCodexTelemetry(latest.usage, latest.sessionPath),
    probe: {
      id: "codex-session-rate-limits",
      label: "Codex session rate_limits",
      command: `scan ${sessionsRoot}`,
      available,
      exitCode: available ? 0 : 1,
      stdout: summary,
      stderr: available ? "" : summary,
      durationMs: Date.now() - started,
      note: latest.sessionPath ?? undefined,
    },
    accountEmail: null,
    planType: latest.rateLimits?.plan_type ?? latest.rateLimits?.planType ?? null,
  }
}
