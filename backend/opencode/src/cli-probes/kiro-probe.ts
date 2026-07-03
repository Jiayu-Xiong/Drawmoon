import { buildQuotaSnapshot, parseKiroBalance } from "../cli-limits.js"
import type { CliLiveSnapshot, CliQuotaSnapshot } from "../schema/cli-budget-types.js"
import { parseTableLikeRows, runProbe } from "./probe-runner.js"
import type { CliProbe } from "./types.js"

export type KiroProbeResult = {
  available: boolean
  version: string | null
  probes: CliProbe[]
  quota: CliQuotaSnapshot
  balanceUsd: number | null
  whoamiRaw: string | null
  modelRows: Array<Record<string, string>>
  liveSnapshot: CliLiveSnapshot
}

export function probeKiro(): KiroProbeResult {
  const kiroVersion = runProbe("kiro-version", "KIRO version", "kiro-cli", ["--version"])
  const kiroWhoami = runProbe("kiro-whoami", "KIRO whoami", "kiro-cli", ["whoami"], 10_000)
  const kiroModels = runProbe("kiro-models", "KIRO models", "kiro-cli", ["chat", "--list-models", "--format", "json"], 15_000)
  const probes = [kiroVersion, kiroWhoami, kiroModels]
  const available = kiroVersion.available
  const whoamiRaw = kiroWhoami.stdout || null
  const balance = whoamiRaw ? parseKiroBalance(whoamiRaw) : { balanceUsd: null, windows: [] }
  const quota = buildQuotaSnapshot(
    "monthly_usd",
    kiroWhoami.available ? whoamiRaw?.split("\n").slice(0, 4).join(" · ") ?? "KIRO account" : "KIRO usage unavailable",
    kiroWhoami.available,
    whoamiRaw,
    balance.windows,
    balance.balanceUsd,
  )

  let modelRows: Array<Record<string, string>> = []
  if (kiroModels.available && kiroModels.stdout) {
    try {
      const parsed = JSON.parse(kiroModels.stdout) as unknown
      if (Array.isArray(parsed)) {
        modelRows = parsed.filter((item): item is Record<string, string> => typeof item === "object" && item !== null)
          .map((item) => ({
            id: String(item.id ?? item.name ?? ""),
            name: String(item.name ?? item.id ?? ""),
            status: String(item.status ?? "available"),
          }))
      }
    } catch {
      modelRows = parseTableLikeRows(kiroModels.stdout)
    }
  }

  const liveSnapshot: CliLiveSnapshot = {
    providerId: "kiro",
    cliTemplateId: "kiro-cli",
    status: available ? "online" : "offline",
    version: kiroVersion.stdout || undefined,
    path: available ? "kiro-cli" : undefined,
    inUseNodeCount: 0,
    fields: [
      { key: "balance", value: balance.balanceUsd != null ? `$${balance.balanceUsd.toFixed(2)}` : "unknown" },
      { key: "quota", value: quota.summary },
    ],
    quota,
    models: modelRows.length
      ? modelRows.map((row) => ({
        id: row.id ?? row.name ?? "kiro-model",
        name: row.name ?? row.id ?? "kiro model",
        statusLabel: row.status ?? "available",
        fields: Object.entries(row).map(([key, value]) => ({ key, value })),
        supportedModes: ["chat", "plan", "agent", "review"] as CliLiveSnapshot["supportedModes"],
      }))
      : [
        { id: "deepseek-3.2", name: "deepseek-3.2", statusLabel: "preview", costMultiplier: 0.25, fields: [{ key: "credits", value: "0.25x" }], supportedModes: ["chat", "agent"] },
        { id: "minimax-m2.5", name: "minimax-m2.5", statusLabel: "available", costMultiplier: 0.25, fields: [{ key: "credits", value: "0.25x" }], supportedModes: ["chat", "agent"] },
        { id: "qwen3-coder-next", name: "qwen3-coder-next", statusLabel: "active", costMultiplier: 0.05, fields: [{ key: "credits", value: "0.05x" }], supportedModes: ["chat", "plan"] },
      ],
    supportedModes: ["chat", "plan", "agent", "review"],
    modeOptions: [
      { id: "chat", label: "Chat", editable: true, source: "derived", description: "Editable KIRO chat strategy." },
      { id: "plan", label: "Plan", editable: true, source: "derived", description: "Editable KIRO planning strategy." },
      { id: "agent", label: "Agent", editable: true, source: "derived", description: "Editable KIRO agent strategy." },
      { id: "review", label: "Review", editable: true, source: "derived", description: "Editable KIRO review strategy." },
    ],
    controlSurface: "customizable",
    allowDerivedAgentModes: true,
    editableAgentModeFields: [
      "defaultSystemPrompt",
      "defaultUserPromptBias",
      "contextMode",
      "maxIterations",
      "timeoutMs",
    ],
    activeModesInWorkflow: [],
  }

  return {
    available,
    version: kiroVersion.stdout || null,
    probes,
    quota,
    balanceUsd: balance.balanceUsd,
    whoamiRaw,
    modelRows,
    liveSnapshot,
  }
}
