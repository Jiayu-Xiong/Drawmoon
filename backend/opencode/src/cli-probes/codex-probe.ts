import { codexProvider } from "../providers/codex.js"
import type { CliLiveSnapshot, CliQuotaSnapshot } from "../schema/cli-budget-types.js"
import { readCodexConfig } from "./codex-config.js"
import { collectCodexLimits } from "./codex-limits.js"
import { runProbe } from "./probe-runner.js"
import type { CliProbe } from "./types.js"

export type CodexProbeResult = {
  codexStatus: Awaited<ReturnType<typeof codexProvider.getStatus>> | null
  codexProviderInfo: Awaited<ReturnType<typeof codexProvider.detect>> | null
  configPath: string
  version: string | null
  probes: CliProbe[]
  quota: {
    available: boolean
    summary: string
    raw: string | null
    accountEmail: string | null
    probes: CliProbe[]
    snapshot: CliQuotaSnapshot
  }
  liveSnapshot: CliLiveSnapshot
}

export async function probeCodex(): Promise<CodexProbeResult> {
  const codexStatus = await codexProvider.getStatus().catch(() => null)
  const codexProviderInfo = await codexProvider.detect().catch(() => null)
  const config = readCodexConfig()
  const limits = collectCodexLimits()

  const codexProbes = [
    limits.probe,
    runProbe("codex-version", "Codex version", "codex", ["--version"]),
    runProbe("codex-features", "Codex features", "codex", ["features", "list"]),
    runProbe("codex-help", "Codex help", "codex", ["--help"]),
  ]

  const codexVersion = codexStatus?.version
    ?? codexProviderInfo?.version
    ?? codexProbes.find((probe) => probe.id === "codex-version" && probe.stdout)?.stdout
    ?? null

  const codexWindows = limits.quota.windows
  const weekly = codexWindows.find((w) => w.kind === "weekly")
  const session = codexWindows.find((w) => w.kind === "session")

  const liveSnapshot: CliLiveSnapshot = {
    providerId: "codex",
    cliTemplateId: "codex-cli",
    status: codexProviderInfo?.available ? "online" : limits.quota.available ? "degraded" : "offline",
    version: codexVersion ?? undefined,
    path: codexProviderInfo?.path ?? codexStatus?.path ?? undefined,
    inUseNodeCount: 0,
    fields: [
      { key: "plan", value: limits.planType ?? "unknown" },
      { key: "weekly remaining", value: weekly?.remainingPercent != null ? `${weekly.remainingPercent}%` : "not reported" },
      { key: "5h remaining", value: session?.remainingPercent != null ? `${session.remainingPercent}%` : "not reported" },
      { key: "weekly reset", value: weekly?.resetsAt ? new Date(weekly.resetsAt).toLocaleString() : "not reported" },
      { key: "current model", value: codexStatus?.model ?? "configured default" },
    ],
    quota: limits.quota,
    models: [
      {
        id: "codex/configured",
        name: codexStatus?.model ?? "configured default",
        statusLabel: "active",
        contextWindow: limits.telemetry?.periods.today?.totalTokens ? undefined : undefined,
        fields: [{ key: "config", value: config.configPath }],
        supportedModes: ["build", "review"],
      },
    ],
    supportedModes: ["build", "review"],
    modeOptions: [
      { id: "build", label: "Build", editable: false, source: "native", description: "Codex exec/build behavior is CLI-owned." },
      { id: "review", label: "Review", editable: false, source: "native", description: "Readonly strategy wrapper around Codex review behavior." },
    ],
    controlSurface: "cli-owned",
    allowDerivedAgentModes: false,
    editableAgentModeFields: [],
    activeModesInWorkflow: [],
    telemetry: limits.telemetry,
  }

  return {
    codexStatus,
    codexProviderInfo,
    configPath: config.configPath,
    version: codexVersion,
    probes: codexProbes,
    quota: {
      available: limits.quota.available,
      summary: limits.quota.summary,
      raw: limits.quota.raw ?? null,
      accountEmail: limits.accountEmail,
      probes: [limits.probe],
      snapshot: limits.quota,
    },
    liveSnapshot,
  }
}
