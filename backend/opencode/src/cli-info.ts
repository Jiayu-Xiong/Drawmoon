import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { buildQuotaSnapshot, type CliQuotaSnapshot } from "./cli-limits.js"
import type { CliLiveSnapshot } from "./schema/cli-budget-types.js"
import { probeCodex } from "./cli-probes/codex-probe.js"
import { readCodexConfig } from "./cli-probes/codex-config.js"
import { probeCopilot } from "./cli-probes/copilot-probe.js"
import { probeKiro } from "./cli-probes/kiro-probe.js"
import { probeOpenCode } from "./cli-probes/opencode-probe.js"
import type { CliProbe } from "./cli-probes/types.js"
import { getAllCommands } from "./command-registry.js"
import { collectOpenCodeTelemetry, EMPTY_CLI_TELEMETRY } from "./opencode-telemetry.js"

export type { CliProbe } from "./cli-probes/types.js"

function unavailableProbe(id: string, label: string, command: string, note = "not probed in fast snapshot"): CliProbe {
  return {
    id,
    label,
    command,
    available: false,
    exitCode: null,
    stdout: "",
    stderr: note,
    durationMs: 0,
    note,
  }
}

function parseCodexConfigText(text: string | null) {
  return {
    model: text?.match(/^\s*model\s*=\s*["']?([^"'\r\n]+)/m)?.[1]?.trim() ?? "configured default",
    reasoningEffort: text?.match(/^\s*model_reasoning_effort\s*=\s*["']?([^"'\r\n]+)/m)?.[1]?.trim() ?? "configured effort",
    sandbox: text?.match(/^\s*sandbox\s*=\s*["']?([^"'\r\n]+)/m)?.[1]?.trim() ?? "workspace-write",
  }
}

export interface LocalCliInfo {
  generatedAt: string
  codex: {
    available: boolean
    version: string | null
    path: string | null
    model: string
    reasoningEffort: string
    sandbox: string
    configExists: boolean
    configPath: string
    quota: {
      available: boolean
      summary: string
      raw: string | null
      accountEmail: string | null
      probes: CliProbe[]
      snapshot?: CliQuotaSnapshot
    }
    features: {
      enabled: number
      total: number
      stableEnabled: number
    }
    probes: CliProbe[]
  }
  copilot: {
    available: boolean
    ghAvailable: boolean
    extensionDetected: boolean
    modelContext: {
      available: boolean
      summary: string
      raw: string | null
      rows: Array<Record<string, string>>
    }
    usage: {
      available: boolean
      summary: string
      raw: string | null
      snapshot?: CliQuotaSnapshot
    }
    probes: CliProbe[]
  }
  kiro: {
    available: boolean
    version: string | null
    path: string | null
    quota: {
      available: boolean
      summary: string
      raw: string | null
      balanceUsd: number | null
      probes: CliProbe[]
    }
    models: {
      available: boolean
      summary: string
      raw: string | null
      rows: Array<Record<string, string>>
    }
    probes: CliProbe[]
  }
  opencode: {
    available: boolean
    version: string | null
    path: string | null
    quota: {
      available: boolean
      summary: string
      rawPath: string | null
      probes: CliProbe[]
    }
    usage: {
      available: boolean
      summary: string
      source: string
      activeSessionCount: number
      lastActivityAt: string | null
    }
    models: {
      available: boolean
      summary: string
      rows: Array<Record<string, string>>
    }
    probes: CliProbe[]
  }
  liveSnapshots: CliLiveSnapshot[]
  commands: Record<string, unknown>
}

export async function getLocalCliInfo(): Promise<LocalCliInfo> {
  const [codex, opencode, copilot, kiro] = await Promise.all([
    probeCodex(),
    probeOpenCode(),
    Promise.resolve(probeCopilot()),
    Promise.resolve(probeKiro()),
  ])
  const codexStatus = codex.codexStatus
  const codexProviderInfo = codex.codexProviderInfo

  const codexFeaturesMap: Record<string, { stage: string; enabled: boolean }> = codexStatus?.features ?? {}
  const featureValues = Object.values(codexFeaturesMap)
  const enabledFeatures = featureValues.filter((feature) => feature.enabled)

  const liveSnapshots: CliLiveSnapshot[] = [
    opencode.liveSnapshot,
    codex.liveSnapshot,
    copilot.liveSnapshot,
    kiro.liveSnapshot,
  ]

  return {
    generatedAt: new Date().toISOString(),
    codex: {
      available: Boolean(codexProviderInfo?.available),
      version: codex.version,
      path: codexProviderInfo?.path ?? codexStatus?.path ?? null,
      model: codexStatus?.model ?? "unknown",
      reasoningEffort: codexStatus?.reasoningEffort ?? "unknown",
      sandbox: codexStatus?.sandbox ?? "unknown",
      configExists: Boolean(codexStatus?.configExists),
      configPath: codex.configPath,
      quota: codex.quota,
      features: {
        enabled: enabledFeatures.length,
        total: featureValues.length,
        stableEnabled: enabledFeatures.filter((feature) => feature.stage === "stable").length,
      },
      probes: codex.probes,
    },
    copilot: {
      available: copilot.available,
      ghAvailable: copilot.ghAvailable,
      extensionDetected: copilot.extensionDetected,
      modelContext: copilot.modelContext,
      usage: {
        available: copilot.quota.available,
        summary: copilot.quota.available
          ? "Copilot usage data returned by gh api /copilot/usage."
          : "Copilot usage API unavailable. Install GitHub CLI (`gh`) and authenticate to see usage data.",
        raw: copilot.quota.raw ?? null,
        snapshot: copilot.quota,
      },
      probes: copilot.probes,
    },
    kiro: {
      available: kiro.available,
      version: kiro.version,
      path: kiro.available ? "kiro-cli" : null,
      quota: {
        available: kiro.quota.available,
        summary: kiro.quota.summary,
        raw: kiro.whoamiRaw,
        balanceUsd: kiro.balanceUsd,
        probes: kiro.probes.filter((probe) => probe.id === "kiro-whoami"),
      },
      models: {
        available: kiro.modelRows.length > 0,
        summary: kiro.modelRows.length ? `${kiro.modelRows.length} models` : "KIRO models unavailable",
        raw: kiro.probes.find((probe) => probe.id === "kiro-models")?.stdout ?? null,
        rows: kiro.modelRows,
      },
      probes: kiro.probes,
    },
    opencode: {
      available: Boolean(opencode.providerInfo?.available),
      version: opencode.providerInfo?.version ?? null,
      path: opencode.providerInfo?.path ?? null,
      quota: {
        available: opencode.quota.available,
        summary: opencode.quota.summary,
        rawPath: opencode.telemetry.telemetry.rawPath ?? null,
        probes: [opencode.probe],
      },
      usage: {
        available: opencode.telemetry.telemetry.available,
        summary: opencode.telemetry.telemetry.summary,
        source: opencode.telemetry.telemetry.source,
        activeSessionCount: opencode.telemetry.telemetry.activeSessionCount ?? 0,
        lastActivityAt: opencode.telemetry.telemetry.lastActivityAt ?? null,
      },
      models: {
        available: opencode.telemetry.models.length > 0,
        summary: opencode.telemetry.models.length ? `${opencode.telemetry.models.length} models observed` : "No OpenCode model rows observed",
        rows: opencode.telemetry.models.map((model) => ({
          id: model.id,
          name: model.name,
          status: model.statusLabel,
          ...Object.fromEntries(model.fields.map((field) => [field.key, field.value])),
        })),
      },
      probes: [opencode.probe],
    },
    liveSnapshots,
    commands: getAllCommands(),
  }
}

export async function getLocalCliInfoFast(): Promise<LocalCliInfo> {
  const generatedAt = new Date().toISOString()
  const codexConfig = readCodexConfig()
  const codexParsed = parseCodexConfigText(codexConfig.text)
  const copilotCommand = process.platform === "win32"
    ? join(homedir(), "AppData", "Roaming", "npm", "copilot.cmd")
    : "copilot"
  const copilotExists = process.platform === "win32" ? existsSync(copilotCommand) : false
  const codexQuota = buildQuotaSnapshot("unknown", "Config only — use Refresh to run live CLI probes.", Boolean(codexConfig.text), codexConfig.configPath, [])
  const opencodeQuota = buildQuotaSnapshot("unknown", "Use Refresh to load OpenCode CLI and usage probes.", false, null, [])
  const copilotQuota = buildQuotaSnapshot("hourly", copilotExists ? "Copilot CLI found. Use Refresh for live usage probes." : "Copilot CLI not found in npm global path.", copilotExists, null, [])
  const kiroQuota = buildQuotaSnapshot("monthly_usd", "Use Refresh to run KIRO CLI probes.", false, null, [])

  const liveSnapshots: CliLiveSnapshot[] = [
    {
      providerId: "opencode",
      cliTemplateId: "opencode-cli",
      status: "offline",
      inUseNodeCount: 0,
      fields: [
        { key: "today", value: "refresh to probe" },
        { key: "month", value: "refresh to probe" },
        { key: "source", value: "live CLI probe required" },
      ],
      quota: opencodeQuota,
      models: [{ id: "workflow-selected", name: "workflow selected", statusLabel: "runtime-bound", fields: [{ key: "source", value: "Workflow node LLM API/model" }], supportedModes: ["chat", "plan", "build", "agent"] }],
      supportedModes: ["chat", "plan", "build", "agent"],
      modeOptions: [
        { id: "chat", label: "Chat", editable: true, source: "native" },
        { id: "plan", label: "Plan", editable: true, source: "native" },
        { id: "build", label: "Build", editable: true, source: "native" },
        { id: "agent", label: "Agent", editable: true, source: "native" },
      ],
      controlSurface: "customizable",
      allowDerivedAgentModes: true,
      editableAgentModeFields: ["defaultSystemPrompt", "model", "contextMode", "maxIterations", "timeoutMs"],
      activeModesInWorkflow: [],
    },
    {
      providerId: "codex",
      cliTemplateId: "codex-cli",
      status: codexConfig.text ? "degraded" : "offline",
      path: codexConfig.configPath,
      inUseNodeCount: 0,
      fields: [
        { key: "plan", value: "unknown" },
        { key: "current model", value: codexParsed.model },
        { key: "reasoning", value: codexParsed.reasoningEffort },
        { key: "sandbox", value: codexParsed.sandbox },
      ],
      quota: codexQuota,
      models: [{ id: "codex/configured", name: codexParsed.model, statusLabel: "from config", fields: [{ key: "source", value: codexConfig.configPath }], supportedModes: ["build", "review"] }],
      supportedModes: ["build", "review"],
      modeOptions: [
        { id: "build", label: "Build", editable: false, source: "native" },
        { id: "review", label: "Review", editable: false, source: "native" },
      ],
      controlSurface: "cli-owned",
      allowDerivedAgentModes: false,
      editableAgentModeFields: [],
      activeModesInWorkflow: [],
    },
    {
      providerId: "copilot",
      cliTemplateId: "copilot-cli",
      status: copilotExists ? "degraded" : "offline",
      path: copilotCommand,
      inUseNodeCount: 0,
      fields: [
        { key: "model", value: "copilot/selected-model" },
        { key: "mode", value: "chat" },
      ],
      quota: copilotQuota,
      models: [{ id: "copilot/selected-model", name: "selected model", statusLabel: copilotExists ? "from CLI path" : "not found", fields: [{ key: "source", value: copilotCommand }], supportedModes: ["chat"] }],
      supportedModes: ["chat"],
      modeOptions: [{ id: "chat", label: "Chat", editable: false, source: "native" }],
      controlSurface: "cli-owned",
      allowDerivedAgentModes: false,
      editableAgentModeFields: [],
      activeModesInWorkflow: [],
    },
    {
      providerId: "kiro",
      cliTemplateId: "kiro-cli",
      status: "offline",
      inUseNodeCount: 0,
      fields: [{ key: "status", value: "fast snapshot" }],
      quota: kiroQuota,
      models: [],
      supportedModes: ["chat", "plan"],
      modeOptions: [
        { id: "chat", label: "Chat", editable: false, source: "native" },
        { id: "plan", label: "Plan", editable: false, source: "native" },
      ],
      controlSurface: "cli-owned",
      allowDerivedAgentModes: false,
      editableAgentModeFields: [],
      activeModesInWorkflow: [],
    },
  ]

  return {
    generatedAt,
    codex: {
      available: Boolean(codexConfig.text),
      version: null,
      path: null,
      model: codexParsed.model,
      reasoningEffort: codexParsed.reasoningEffort,
      sandbox: codexParsed.sandbox,
      configExists: Boolean(codexConfig.text),
      configPath: codexConfig.configPath,
      quota: {
        available: Boolean(codexConfig.text),
        summary: codexQuota.summary,
        raw: codexConfig.text,
        accountEmail: null,
        probes: [unavailableProbe("codex-fast", "Codex fast snapshot", codexConfig.configPath)],
        snapshot: codexQuota,
      },
      features: { enabled: 0, total: 0, stableEnabled: 0 },
      probes: [unavailableProbe("codex-fast", "Codex fast snapshot", codexConfig.configPath)],
    },
    copilot: {
      available: copilotExists,
      ghAvailable: false,
      extensionDetected: copilotExists,
      modelContext: { available: false, summary: "Fast snapshot; refresh CLI for model rows.", raw: null, rows: [] },
      usage: { available: copilotExists, summary: copilotQuota.summary, raw: null, snapshot: copilotQuota },
      probes: [unavailableProbe("copilot-fast", "Copilot fast snapshot", copilotCommand)],
    },
    kiro: {
      available: false,
      version: null,
      path: null,
      quota: { available: false, summary: kiroQuota.summary, raw: null, balanceUsd: null, probes: [unavailableProbe("kiro-fast", "KIRO fast snapshot", "kiro")] },
      models: { available: false, summary: "Fast snapshot; refresh CLI for model rows.", raw: null, rows: [] },
      probes: [unavailableProbe("kiro-fast", "KIRO fast snapshot", "kiro")],
    },
    opencode: {
      available: false,
      version: null,
      path: null,
      quota: { available: false, summary: opencodeQuota.summary, rawPath: null, probes: [unavailableProbe("opencode-fast", "OpenCode fast snapshot", "refresh required")] },
      usage: {
        available: false,
        summary: "Use Refresh to load OpenCode usage.",
        source: "unavailable",
        activeSessionCount: 0,
        lastActivityAt: null,
      },
      models: {
        available: false,
        summary: "Use Refresh to list OpenCode models.",
        rows: [],
      },
      probes: [unavailableProbe("opencode-fast", "OpenCode fast snapshot", "refresh required")],
    },
    liveSnapshots,
    commands: getAllCommands(),
  }
}

export type CliRefreshProvider = "opencode" | "codex" | "copilot" | "kiro"

export const CLI_REFRESH_PROVIDERS: CliRefreshProvider[] = ["opencode", "codex", "copilot", "kiro"]

function replaceLiveSnapshot(snapshots: CliLiveSnapshot[], next: CliLiveSnapshot): CliLiveSnapshot[] {
  return [
    ...snapshots.filter((snapshot) => snapshot.cliTemplateId !== next.cliTemplateId && snapshot.providerId !== next.providerId),
    next,
  ]
}

/** Probe one CLI provider and merge into an existing in-memory snapshot. */
export async function refreshCliProvider(info: LocalCliInfo, provider: CliRefreshProvider): Promise<LocalCliInfo> {
  const generatedAt = new Date().toISOString()
  if (provider === "codex") {
    const codex = await probeCodex()
    const codexStatus = codex.codexStatus
    const codexProviderInfo = codex.codexProviderInfo
    const codexFeaturesMap: Record<string, { stage: string; enabled: boolean }> = codexStatus?.features ?? {}
    const featureValues = Object.values(codexFeaturesMap)
    const enabledFeatures = featureValues.filter((feature) => feature.enabled)
    return {
      ...info,
      generatedAt,
      codex: {
        available: Boolean(codexProviderInfo?.available),
        version: codex.version,
        path: codexProviderInfo?.path ?? codexStatus?.path ?? null,
        model: codexStatus?.model ?? "unknown",
        reasoningEffort: codexStatus?.reasoningEffort ?? "unknown",
        sandbox: codexStatus?.sandbox ?? "unknown",
        configExists: Boolean(codexStatus?.configExists),
        configPath: codex.configPath,
        quota: codex.quota,
        features: {
          enabled: enabledFeatures.length,
          total: featureValues.length,
          stableEnabled: enabledFeatures.filter((feature) => feature.stage === "stable").length,
        },
        probes: codex.probes,
      },
      liveSnapshots: replaceLiveSnapshot(info.liveSnapshots, codex.liveSnapshot),
    }
  }

  if (provider === "opencode") {
    const opencode = await probeOpenCode()
    return {
      ...info,
      generatedAt,
      opencode: {
        available: Boolean(opencode.providerInfo?.available),
        version: opencode.providerInfo?.version ?? null,
        path: opencode.providerInfo?.path ?? null,
        quota: {
          available: opencode.quota.available,
          summary: opencode.quota.summary,
          rawPath: opencode.telemetry.telemetry.rawPath ?? null,
          probes: [opencode.probe],
        },
        usage: {
          available: opencode.telemetry.telemetry.available,
          summary: opencode.telemetry.telemetry.summary,
          source: opencode.telemetry.telemetry.source,
          activeSessionCount: opencode.telemetry.telemetry.activeSessionCount ?? 0,
          lastActivityAt: opencode.telemetry.telemetry.lastActivityAt ?? null,
        },
        models: {
          available: opencode.telemetry.models.length > 0,
          summary: opencode.telemetry.models.length ? `${opencode.telemetry.models.length} models observed` : "No OpenCode model rows observed",
          rows: opencode.telemetry.models.map((model) => ({
            id: model.id,
            name: model.name,
            status: model.statusLabel,
            ...Object.fromEntries(model.fields.map((field) => [field.key, field.value])),
          })),
        },
        probes: [opencode.probe],
      },
      liveSnapshots: replaceLiveSnapshot(info.liveSnapshots, opencode.liveSnapshot),
    }
  }

  if (provider === "copilot") {
    const copilot = probeCopilot()
    return {
      ...info,
      generatedAt,
      copilot: {
        available: copilot.available,
        ghAvailable: copilot.ghAvailable,
        extensionDetected: copilot.extensionDetected,
        modelContext: copilot.modelContext,
        usage: {
          available: copilot.quota.available,
          summary: copilot.quota.available
            ? "Copilot usage data returned by gh api /copilot/usage."
            : "Copilot usage API unavailable. Install GitHub CLI (`gh`) and authenticate to see usage data.",
          raw: copilot.quota.raw ?? null,
          snapshot: copilot.quota,
        },
        probes: copilot.probes,
      },
      liveSnapshots: replaceLiveSnapshot(info.liveSnapshots, copilot.liveSnapshot),
    }
  }

  const kiro = probeKiro()
  return {
    ...info,
    generatedAt,
    kiro: {
      available: kiro.available,
      version: kiro.version,
      path: kiro.available ? "kiro-cli" : null,
      quota: {
        available: kiro.quota.available,
        summary: kiro.quota.summary,
        raw: kiro.whoamiRaw,
        balanceUsd: kiro.balanceUsd,
        probes: kiro.probes.filter((probe) => probe.id === "kiro-whoami"),
      },
      models: {
        available: kiro.modelRows.length > 0,
        summary: kiro.modelRows.length ? `${kiro.modelRows.length} models` : "KIRO models unavailable",
        raw: kiro.probes.find((probe) => probe.id === "kiro-models")?.stdout ?? null,
        rows: kiro.modelRows,
      },
      probes: kiro.probes,
    },
    liveSnapshots: replaceLiveSnapshot(info.liveSnapshots, kiro.liveSnapshot),
  }
}
