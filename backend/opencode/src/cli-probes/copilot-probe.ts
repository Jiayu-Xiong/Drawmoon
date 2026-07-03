import { homedir } from "node:os"
import { join } from "node:path"

import { buildQuotaSnapshot, parseCopilotUsageWindows } from "../cli-limits.js"
import type { CliLiveSnapshot, CliQuotaSnapshot } from "../schema/cli-budget-types.js"
import { probeCopilotExtensions } from "./copilot-extensions.js"
import { parseTableLikeRows, runFileProbe, runProbe } from "./probe-runner.js"
import type { CliProbe } from "./types.js"

export type CopilotProbeResult = {
  available: boolean
  ghAvailable: boolean
  extensionDetected: boolean
  command: string
  probes: CliProbe[]
  quota: CliQuotaSnapshot
  modelContext: {
    available: boolean
    summary: string
    raw: string | null
    rows: Array<Record<string, string>>
  }
  liveSnapshot: CliLiveSnapshot
}

export function probeCopilot(): CopilotProbeResult {
  const copilotCommand = process.platform === "win32"
    ? join(homedir(), "AppData", "Roaming", "npm", "copilot.cmd")
    : "copilot"

  const copilotVersion = runFileProbe("copilot-version", "Copilot CLI version", copilotCommand, ["--version"])
  const copilotHelp = runFileProbe("copilot-help", "Copilot CLI help", copilotCommand, ["--help"])
  const editorExtensions = probeCopilotExtensions()
  const ghVersion = runProbe("gh-version", "GitHub CLI version", "gh", ["--version"])
  const ghExtensions = runProbe("gh-extensions", "GitHub CLI extensions", "gh", ["extension", "list"])
  const ghCopilotModels = runProbe("gh-copilot-models", "GH Copilot models", "gh", ["copilot", "models", "list"])
  const ghCopilotUsage = runProbe("gh-copilot-usage", "GH Copilot usage", "gh", ["api", "/copilot/usage"])
  const probes = [copilotVersion, copilotHelp, editorExtensions, ghVersion, ghExtensions, ghCopilotModels, ghCopilotUsage]

  const available = copilotVersion.available || (ghVersion.available && ghCopilotModels.available)
  const extensionDetected = editorExtensions.available
    || (ghExtensions.available && /copilot/i.test(`${ghExtensions.stdout}\n${ghExtensions.stderr}`))
  const copilotRaw = ghCopilotModels.stdout || null
  const summary = ghCopilotModels.available
    ? "Copilot model/context data returned by gh copilot models list."
    : "Copilot model/context data is unavailable from non-dialog commands."

  const usageRaw = ghCopilotUsage.stdout || null
  const quota = buildQuotaSnapshot(
    "hourly",
    ghCopilotUsage.available ? usageRaw?.slice(0, 200) ?? summary : summary,
    ghCopilotUsage.available,
    usageRaw,
    usageRaw ? parseCopilotUsageWindows(usageRaw) : [],
  )
  const rows = copilotRaw ? parseTableLikeRows(copilotRaw) : []

  const liveSnapshot: CliLiveSnapshot = {
    providerId: "copilot",
    cliTemplateId: "copilot-cli",
    status: available ? "online" : "degraded",
    version: copilotVersion.stdout || undefined,
    path: copilotCommand,
    inUseNodeCount: 0,
    fields: [
      { key: "usage", value: quota.summary },
      { key: "models", value: String(rows.length || 0) },
    ],
    quota,
    models: rows.map((row) => {
      const contextKey = Object.keys(row).find((k) => /context/i.test(k))
      const contextVal = contextKey ? row[contextKey] : undefined
      const ctxNum = contextVal ? Number(contextVal.replace(/[^\d]/g, "")) : undefined
      return {
        id: row.Model ?? row.model ?? row.name ?? "copilot-model",
        name: row.Model ?? row.model ?? row.name ?? "copilot model",
        statusLabel: row.Status ?? row.status ?? "available",
        contextWindow: ctxNum && Number.isFinite(ctxNum) ? ctxNum : undefined,
        fields: Object.entries(row).map(([key, value]) => ({ key, value })),
        supportedModes: ["chat"],
      }
    }),
    supportedModes: ["chat"],
    modeOptions: [
      { id: "chat", label: "Chat", editable: false, source: "native", description: "Copilot strategy is CLI-owned." },
    ],
    controlSurface: "cli-owned",
    allowDerivedAgentModes: false,
    editableAgentModeFields: [],
    activeModesInWorkflow: [],
  }

  return {
    available,
    ghAvailable: ghVersion.available,
    extensionDetected,
    command: copilotCommand,
    probes,
    quota,
    modelContext: { available: ghCopilotModels.available, summary, raw: copilotRaw, rows },
    liveSnapshot,
  }
}
