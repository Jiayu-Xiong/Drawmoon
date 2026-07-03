/**
 * Normalized CLI limit windows (inspired by token-monitor limits.js).
 * Parses provider probe output into session / weekly / billing windows.
 */

export type CliLimitWindowKind = "session" | "weekly" | "billing"

export interface CliLimitWindow {
  kind: CliLimitWindowKind
  label?: string
  used?: number | null
  limit?: number | null
  remaining?: number | null
  usedPercent?: number | null
  remainingPercent?: number | null
  resetsAt?: string | null
}

export interface CliQuotaSnapshot {
  kind: "token" | "hourly" | "monthly_usd" | "weekly_percent" | "unlimited" | "unknown"
  summary: string
  available: boolean
  windows: CliLimitWindow[]
  balanceUsd?: number | null
  raw?: string | null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[%,$]/g, ""))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function percentFromParts(used: number | null, limit: number | null, explicit?: number | null): number | null {
  if (explicit !== null && explicit !== undefined) return clamp(explicit, 0, 100)
  if (used !== null && limit !== null && limit > 0) return clamp((used / limit) * 100, 0, 100)
  return null
}

export function parseCodexLimitWindows(raw: string): CliLimitWindow[] {
  const windows: CliLimitWindow[] = []
  const percentMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/)
  const remainingMatch = raw.match(/remaining[:\s]+(\d+(?:\.\d+)?)\s*%/i)
  const usedMatch = raw.match(/used[:\s]+(\d+(?:\.\d+)?)\s*%/i)
  const resetMatch = raw.match(/(?:reset|refresh|renews?)[:\s]+([^\n,;]+)/i)

  const usedPercent = asNumber(usedMatch?.[1]) ?? (percentMatch ? asNumber(percentMatch[1]) : null)
  const remainingPercent = asNumber(remainingMatch?.[1]) ?? (usedPercent !== null ? 100 - usedPercent : null)

  if (usedPercent !== null || remainingPercent !== null) {
    windows.push({
      kind: "weekly",
      label: "Weekly quota",
      usedPercent,
      remainingPercent,
      remaining: remainingPercent,
      used: usedPercent,
      limit: 100,
    })
  }

  if (resetMatch?.[1]) {
    const last = windows[windows.length - 1]
    if (last) last.resetsAt = resetMatch[1].trim()
  }

  return windows
}

export function parseKiroBalance(raw: string): { balanceUsd: number | null; windows: CliLimitWindow[] } {
  const balanceMatch = raw.match(/\$?(\d+(?:\.\d+)?)/)
  const usedMatch = raw.match(/used[:\s]+\$?(\d+(?:\.\d+)?)/i)
  const quotaMatch = raw.match(/quota[:\s]+\$?(\d+(?:\.\d+)?)/i)
  const balanceUsd = asNumber(balanceMatch?.[1])
  const used = asNumber(usedMatch?.[1])
  const limit = asNumber(quotaMatch?.[1])
  const windows: CliLimitWindow[] = []

  if (limit !== null || used !== null || balanceUsd !== null) {
    windows.push({
      kind: "billing",
      label: "Monthly billing",
      used,
      limit,
      remaining: balanceUsd ?? (limit !== null && used !== null ? limit - used : null),
      usedPercent: percentFromParts(used, limit),
      remainingPercent: percentFromParts(used, limit) !== null
        ? Number((100 - (percentFromParts(used, limit) ?? 0)).toFixed(1))
        : null,
    })
  }

  return { balanceUsd, windows }
}

export function parseCopilotUsageWindows(raw: string): CliLimitWindow[] {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    const windows: CliLimitWindow[] = []
    const hourly = asNumber(data.hourly ?? data.hours_used)
    const hourlyLimit = asNumber(data.hourly_limit ?? data.hours_limit)
    if (hourly !== null || hourlyLimit !== null) {
      windows.push({
        kind: "session",
        label: "Hourly usage",
        used: hourly,
        limit: hourlyLimit,
        usedPercent: percentFromParts(hourly, hourlyLimit),
        remainingPercent: percentFromParts(hourly, hourlyLimit) !== null
          ? Number((100 - (percentFromParts(hourly, hourlyLimit) ?? 0)).toFixed(1))
          : null,
      })
    }
    return windows
  } catch {
    return []
  }
}

export function buildQuotaSnapshot(
  kind: CliQuotaSnapshot["kind"],
  summary: string,
  available: boolean,
  raw: string | null,
  windows: CliLimitWindow[],
  balanceUsd?: number | null,
): CliQuotaSnapshot {
  return { kind, summary, available, windows, balanceUsd, raw }
}
