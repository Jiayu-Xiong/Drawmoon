import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import type { CliLimitWindow, CliLiveModel, CliTelemetrySnapshot, CliUsagePeriod } from "./schema/cli-budget-types.js"
import type { TokenUsage } from "./schema/types.js"

export const EMPTY_CLI_TELEMETRY: CliTelemetrySnapshot = {
  source: "unavailable",
  available: false,
  summary: "OpenCode telemetry probe failed.",
  periods: {},
  rawPath: null,
}

type SqliteRow = Record<string, unknown>

interface SqliteStatement {
  all(...params: unknown[]): SqliteRow[]
}

interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

interface SqliteModule {
  Database?: new (path: string, options?: { readonly?: boolean }) => SqliteDatabase
  DatabaseSync?: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase
}

interface OpenCodeMessageRow {
  createdMs: number
  sessionId: string
  providerId: string
  modelId: string
  role: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  costUsd: number
}

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_OPENCODE_GO_LIMITS = { session: 12, weekly: 30, billing: 60 }

const MESSAGE_SQL = `
  SELECT session_id AS sessionId,
         CAST(COALESCE(json_extract(data,'$.time.created'), time_created) AS INTEGER) AS createdMs,
         COALESCE(json_extract(data,'$.providerID'), json_extract(data,'$.providerId'), '') AS providerId,
         COALESCE(json_extract(data,'$.modelID'), json_extract(data,'$.modelId'), json_extract(data,'$.model'), '') AS modelId,
         COALESCE(json_extract(data,'$.role'), '') AS role,
         CAST(COALESCE(json_extract(data,'$.tokens.input'), 0) AS INTEGER) AS inputTokens,
         CAST(COALESCE(json_extract(data,'$.tokens.output'), 0) AS INTEGER) AS outputTokens,
         CAST(COALESCE(json_extract(data,'$.tokens.cache.read'), 0) AS INTEGER) AS cacheReadTokens,
         CAST(COALESCE(json_extract(data,'$.tokens.cache.write'), 0) AS INTEGER) AS cacheWriteTokens,
         CAST(COALESCE(json_extract(data,'$.tokens.reasoning'), 0) AS INTEGER) AS reasoningTokens,
         CAST(COALESCE(json_extract(data,'$.cost'), 0) AS REAL) AS costUsd
  FROM message
  WHERE json_valid(data)
  ORDER BY createdMs ASC`

function numberValue(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function isoFromMs(value: number | null): string | null {
  return value && Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null
}

function weekStartMs(nowMs: number) {
  const date = new Date(nowMs)
  const day = date.getUTCDay()
  const sinceMonday = day === 0 ? 6 : day - 1
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceMonday)
}

function monthBoundsMs(nowMs: number) {
  const date = new Date(nowMs)
  const startMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  const endMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  return { startMs, endMs }
}

function sameLocalDay(ms: number, now: Date) {
  const date = new Date(ms)
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

function isOpenCodeDbFilename(name: string) {
  if (!name.endsWith(".db")) return false
  const stem = name.slice(0, -3)
  if (stem === "opencode") return true
  if (!stem.startsWith("opencode-")) return false
  return /^[A-Za-z0-9._-]+$/.test(stem.slice("opencode-".length))
}

function openCodeDataDir(env: NodeJS.ProcessEnv = process.env) {
  if (env.XDG_DATA_HOME) return join(env.XDG_DATA_HOME, "opencode")
  return join(env.HOME || env.USERPROFILE || homedir(), ".local", "share", "opencode")
}

export function discoverOpenCodeDbPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const explicit = env.OPENCODE_DB?.trim()
  if (explicit && existsSync(explicit)) return [explicit]

  const dataDir = openCodeDataDir(env)
  try {
    return readdirSync(dataDir)
      .filter(isOpenCodeDbFilename)
      .sort()
      .map((name) => join(dataDir, name))
  } catch {
    return []
  }
}

async function loadSqlite(): Promise<SqliteModule | null> {
  const dynamicImport = Function("specifier", "return import(specifier)") as (specifier: string) => Promise<SqliteModule>
  try {
    return await dynamicImport("bun:sqlite")
  } catch {
    try {
      return await dynamicImport("node:sqlite")
    } catch {
      return null
    }
  }
}

function openDatabase(sqlite: SqliteModule, path: string): SqliteDatabase | null {
  if (sqlite.Database) return new sqlite.Database(path, { readonly: true })
  if (sqlite.DatabaseSync) return new sqlite.DatabaseSync(path, { readOnly: true })
  return null
}

function normalizeRow(row: SqliteRow): OpenCodeMessageRow {
  return {
    createdMs: numberValue(row.createdMs),
    sessionId: stringValue(row.sessionId),
    providerId: stringValue(row.providerId),
    modelId: stringValue(row.modelId),
    role: stringValue(row.role),
    inputTokens: numberValue(row.inputTokens),
    outputTokens: numberValue(row.outputTokens),
    cacheReadTokens: numberValue(row.cacheReadTokens),
    cacheWriteTokens: numberValue(row.cacheWriteTokens),
    reasoningTokens: numberValue(row.reasoningTokens),
    costUsd: numberValue(row.costUsd),
  }
}

function readRows(path: string, sqlite: SqliteModule): OpenCodeMessageRow[] {
  const db = openDatabase(sqlite, path)
  if (!db) return []
  try {
    db.exec("PRAGMA busy_timeout = 250")
    return db.prepare(MESSAGE_SQL).all().map(normalizeRow).filter((row) => row.createdMs > 0)
  } finally {
    db.close()
  }
}

function emptyPeriod(): CliUsagePeriod {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    costUsd: 0,
    messageCount: 0,
    sessionCount: 0,
    models: {},
  }
}

function addRow(period: CliUsagePeriod, row: OpenCodeMessageRow, sessions: Set<string>) {
  const total = row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
  period.totalTokens += total
  period.inputTokens = (period.inputTokens ?? 0) + row.inputTokens
  period.outputTokens = (period.outputTokens ?? 0) + row.outputTokens
  period.cacheReadTokens = (period.cacheReadTokens ?? 0) + row.cacheReadTokens
  period.cacheWriteTokens = (period.cacheWriteTokens ?? 0) + row.cacheWriteTokens
  period.reasoningTokens = (period.reasoningTokens ?? 0) + row.reasoningTokens
  period.costUsd = Number(((period.costUsd ?? 0) + row.costUsd).toFixed(6))
  period.messageCount = (period.messageCount ?? 0) + 1
  if (row.sessionId) sessions.add(row.sessionId)
  const model = row.modelId || row.providerId || "configured"
  period.models = { ...(period.models ?? {}), [model]: (period.models?.[model] ?? 0) + total }
}

function finalizePeriod(period: CliUsagePeriod, sessions: Set<string>): CliUsagePeriod {
  return {
    ...period,
    totalTokens: Math.round(period.totalTokens),
    inputTokens: Math.round(period.inputTokens ?? 0),
    outputTokens: Math.round(period.outputTokens ?? 0),
    cacheReadTokens: Math.round(period.cacheReadTokens ?? 0),
    cacheWriteTokens: Math.round(period.cacheWriteTokens ?? 0),
    reasoningTokens: Math.round(period.reasoningTokens ?? 0),
    costUsd: Number((period.costUsd ?? 0).toFixed(6)),
    sessionCount: sessions.size,
  }
}

function periodFromRows(rows: OpenCodeMessageRow[], predicate: (row: OpenCodeMessageRow) => boolean) {
  const period = emptyPeriod()
  const sessions = new Set<string>()
  for (const row of rows) {
    if (predicate(row)) addRow(period, row, sessions)
  }
  return finalizePeriod(period, sessions)
}

function sumCost(rows: OpenCodeMessageRow[], startMs: number, endMs: number) {
  return rows.reduce((sum, row) => row.createdMs >= startMs && row.createdMs < endMs ? sum + row.costUsd : sum, 0)
}

function percent(used: number, limit: number) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null
  return Math.max(0, Math.min(100, Number(((used / limit) * 100).toFixed(1))))
}

function opencodeGoLimits(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.OPENCODE_GO_LIMITS ?? env.TOKEN_MONITOR_OPENCODE_GO_LIMITS
  const parts = raw?.split(",").map((item) => Number(item.trim()))
  if (parts?.length === 3 && parts.every((n) => Number.isFinite(n) && n > 0)) {
    return { session: parts[0]!, weekly: parts[1]!, billing: parts[2]! }
  }
  return DEFAULT_OPENCODE_GO_LIMITS
}

function buildQuotaWindows(rows: OpenCodeMessageRow[], nowMs: number, env: NodeJS.ProcessEnv): CliLimitWindow[] {
  const goRows = rows.filter((row) => row.providerId === "opencode-go")
  if (!goRows.length) return []
  const limits = opencodeGoLimits(env)
  const sessionStart = nowMs - FIVE_HOURS_MS
  const sessionRows = goRows.filter((row) => row.createdMs >= sessionStart && row.createdMs < nowMs)
  const sessionOldest = sessionRows.reduce((min, row) => Math.min(min, row.createdMs), nowMs)
  const weeklyStart = weekStartMs(nowMs)
  const month = monthBoundsMs(nowMs)
  const makeWindow = (kind: CliLimitWindow["kind"], used: number, limit: number, resetsAt: number): CliLimitWindow => ({
    kind,
    label: kind === "session" ? "OpenCode Go 5h" : kind === "weekly" ? "OpenCode Go weekly" : "OpenCode Go monthly",
    used: Number(used.toFixed(4)),
    limit,
    remaining: Number(Math.max(0, limit - used).toFixed(4)),
    usedPercent: percent(used, limit),
    remainingPercent: percent(Math.max(0, limit - used), limit),
    resetsAt: new Date(resetsAt).toISOString(),
  })
  return [
    makeWindow("session", sumCost(goRows, sessionStart, nowMs), limits.session, sessionOldest + FIVE_HOURS_MS),
    makeWindow("weekly", sumCost(goRows, weeklyStart, weeklyStart + WEEK_MS), limits.weekly, weeklyStart + WEEK_MS),
    makeWindow("billing", sumCost(goRows, month.startMs, month.endMs), limits.billing, month.endMs),
  ]
}

function modelsFromRows(rows: OpenCodeMessageRow[]): CliLiveModel[] {
  const byModel = new Map<string, { tokens: number; costUsd: number; providers: Set<string> }>()
  for (const row of rows) {
    const model = row.modelId || row.providerId || "configured"
    const entry = byModel.get(model) ?? { tokens: 0, costUsd: 0, providers: new Set<string>() }
    entry.tokens += row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
    entry.costUsd += row.costUsd
    if (row.providerId) entry.providers.add(row.providerId)
    byModel.set(model, entry)
  }

  return [...byModel.entries()]
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, 12)
    .map(([id, item]) => ({
      id,
      name: id,
      statusLabel: item.tokens > 0 ? "used" : "available",
      fields: [
        { key: "tokens", value: Math.round(item.tokens).toLocaleString() },
        { key: "cost", value: `$${item.costUsd.toFixed(4)}` },
        { key: "provider", value: [...item.providers].join(", ") || "configured" },
      ],
      supportedModes: ["chat", "plan", "build", "agent"],
    }))
}

export async function collectOpenCodeTelemetry(env: NodeJS.ProcessEnv = process.env): Promise<{
  telemetry: CliTelemetrySnapshot
  models: CliLiveModel[]
  quotaWindows: CliLimitWindow[]
}> {
  const paths = discoverOpenCodeDbPaths(env)
  if (!paths.length) {
    return {
      telemetry: {
        source: "unavailable",
        available: false,
        summary: "OpenCode data directory not found.",
        periods: {},
        rawPath: null,
      },
      models: [],
      quotaWindows: [],
    }
  }

  const sqlite = await loadSqlite()
  if (!sqlite) {
    return {
      telemetry: {
        source: "unavailable",
        available: false,
        summary: "SQLite reader unavailable in this runtime.",
        periods: {},
        rawPath: paths[0] ?? null,
      },
      models: [],
      quotaWindows: [],
    }
  }

  const rows = paths.flatMap((path) => {
    try {
      return readRows(path, sqlite)
    } catch {
      return []
    }
  })
  if (!rows.length) {
    return {
      telemetry: {
        source: "local-db",
        available: false,
        summary: "OpenCode database found but no readable message usage rows.",
        periods: {},
        rawPath: paths[0] ?? null,
      },
      models: [],
      quotaWindows: [],
    }
  }

  const now = new Date()
  const nowMs = now.getTime()
  const month = monthBoundsMs(nowMs)
  const today = periodFromRows(rows, (row) => sameLocalDay(row.createdMs, now))
  const monthPeriod = periodFromRows(rows, (row) => row.createdMs >= month.startMs && row.createdMs < month.endMs)
  const allTime = periodFromRows(rows, () => true)
  const lastActivity = rows.reduce<number | null>((max, row) => max == null ? row.createdMs : Math.max(max, row.createdMs), null)
  const activeSessions = new Set(rows.filter((row) => nowMs - row.createdMs < FIVE_HOURS_MS).map((row) => row.sessionId).filter(Boolean))
  const quotaWindows = buildQuotaWindows(rows, nowMs, env)

  return {
    telemetry: {
      source: "local-db",
      available: true,
      summary: `${today.totalTokens.toLocaleString()} tokens today / $${(today.costUsd ?? 0).toFixed(4)} · ${monthPeriod.totalTokens.toLocaleString()} this month`,
      periods: { today, month: monthPeriod, allTime },
      activeSessionCount: activeSessions.size,
      lastActivityAt: isoFromMs(lastActivity),
      rawPath: paths[0] ?? null,
    },
    models: modelsFromRows(rows),
    quotaWindows,
  }
}

function usageFromRows(rows: OpenCodeMessageRow[]): TokenUsage | undefined {
  if (!rows.length) return undefined
  const period = emptyPeriod()
  const sessions = new Set<string>()
  for (const row of rows) addRow(period, row, sessions)
  const finalized = finalizePeriod(period, sessions)
  if (!finalized.totalTokens) return undefined
  return {
    inputTokens: finalized.inputTokens ?? 0,
    outputTokens: finalized.outputTokens ?? 0,
    cacheReadTokens: finalized.cacheReadTokens ?? 0,
    cacheWriteTokens: finalized.cacheWriteTokens ?? 0,
    reasoningTokens: finalized.reasoningTokens ?? 0,
    totalTokens: finalized.totalTokens,
    costUsd: finalized.costUsd,
    source: "run-results",
  }
}

export async function summarizeUsageForSessionIds(
  sessionIds: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<TokenUsage | undefined> {
  const ids = new Set(sessionIds.map((id) => id.trim()).filter(Boolean))
  if (!ids.size) return undefined

  const paths = discoverOpenCodeDbPaths(env)
  if (!paths.length) return undefined

  const sqlite = await loadSqlite()
  if (!sqlite) return undefined

  const rows = paths.flatMap((path) => {
    try {
      return readRows(path, sqlite)
    } catch {
      return []
    }
  }).filter((row) => ids.has(row.sessionId))

  return usageFromRows(rows)
}
