import type { LocalCliInfo, RuntimeSnapshot } from "../../api"
import type { AgentRuntimeMode, BackendProvider, CliLiveModel, CliLiveSnapshot, CliModeOption, CliProviderTemplate, CliQuotaSnapshot, CliTelemetrySnapshot, SystemSnapshot, WorkflowNode, WorkflowTemplate } from "../../data/console-model"
import { getCliTemplate } from "../../data/cli-templates"
import { getAgentModeTemplate } from "../../data/template-registry"
import { backendProviders, systemSnapshot } from "./shared/core"

function parseCodexQuotaFields(summary: string, snapshot?: CliQuotaSnapshot) {
  const window = snapshot?.windows?.[0]
  const percent = window?.remainingPercent ?? summary.match(/\b(\d+(?:\.\d+)?)%/)?.[1]
  const reset = window?.resetsAt ?? summary.match(/(?:reset|refresh|renews?)[:\s]+([^,;]+)/i)?.[1]?.trim()
  return { percent, reset }
}

function cliAvailabilityFromRuntime(runtimeInfo: LocalCliInfo, providerId: string): CliLiveSnapshot["status"] | undefined {
  if (providerId === "codex") return runtimeInfo.codex.available ? "online" : "offline"
  if (providerId === "opencode") {
    if (runtimeInfo.opencode?.available) return "online"
    if (runtimeInfo.opencode?.usage.available || runtimeInfo.opencode?.quota.available) return "degraded"
    return "offline"
  }
  if (providerId === "copilot") return runtimeInfo.copilot.available ? "online" : runtimeInfo.copilot.ghAvailable ? "degraded" : "offline"
  if (providerId === "kiro") return runtimeInfo.kiro?.available ? "online" : "offline"
  if (providerId === "claude-code") return "offline"
  return undefined
}

const AGENT_RUNTIME_MODES: AgentRuntimeMode[] = ["chat", "plan", "build", "review", "agent"]

function isAgentRuntimeMode(value: unknown): value is AgentRuntimeMode {
  return AGENT_RUNTIME_MODES.includes(value as AgentRuntimeMode)
}

function normalizeModes(values: unknown[] | undefined): AgentRuntimeMode[] {
  return (values ?? []).filter(isAgentRuntimeMode)
}

function normalizeModeOptions(values: Array<{ id: string; label: string; editable: boolean; source: string; description?: string }> | undefined): CliModeOption[] | undefined {
  const sourceValues: CliModeOption["source"][] = ["native", "derived", "custom"]
  return values?.filter((value) => isAgentRuntimeMode(value.id)).map((value): CliModeOption => {
    const id = value.id as AgentRuntimeMode
    return {
    id,
    label: value.label,
    editable: value.editable,
    source: sourceValues.includes(value.source as CliModeOption["source"]) ? value.source as CliModeOption["source"] : "native",
    description: value.description,
    }
  })
}

function normalizeTelemetry(value: (Omit<CliTelemetrySnapshot, "source"> & { source: string }) | undefined): CliTelemetrySnapshot | undefined {
  if (!value) return undefined
  const allowed: CliTelemetrySnapshot["source"][] = ["local-db", "cli-probe", "api", "unavailable"]
  const source = allowed.includes(value.source as CliTelemetrySnapshot["source"])
    ? value.source as CliTelemetrySnapshot["source"]
    : "unavailable"
  return {
    ...value,
    source,
  }
}

function normalizeLiveModel(model: {
  id: string
  name: string
  statusLabel: string
  contextWindow?: number
  costMultiplier?: number
  fields: Array<{ key: string; value: string }>
  supportedModes?: string[]
}): CliLiveModel {
  return {
    id: model.id,
    name: model.name,
    statusLabel: model.statusLabel,
    contextWindow: model.contextWindow,
    costMultiplier: model.costMultiplier,
    fields: model.fields,
    supportedModes: normalizeModes(model.supportedModes),
  }
}

export function mergeCliSnapshot(
  cli: CliProviderTemplate,
  runtimeInfo: LocalCliInfo | null,
  options?: { inUseNodeCount?: number; activeModes?: AgentRuntimeMode[] },
): CliLiveSnapshot {
  const live = runtimeInfo?.liveSnapshots?.find((s) => s.cliTemplateId === cli.id || s.providerId === cli.providerId)
  const providerStatus = live?.status
    ?? (runtimeInfo ? cliAvailabilityFromRuntime(runtimeInfo, cli.providerId) ?? "degraded" : "offline")

  const resolvedStatus = providerStatus === "offline" && runtimeInfo?.generatedAt && (
    live?.quota?.summary?.includes("fast snapshot")
    || live?.quota?.summary?.includes("Config only")
    || live?.quota?.summary?.includes("Use Refresh")
  )
    ? "degraded"
    : providerStatus

  let quota: CliQuotaSnapshot = live?.quota ?? {
    kind: cli.capabilities.quota.kind,
    summary: "No runtime probe",
    available: false,
    windows: [],
  }

  let fields = [...cli.fields]
  if (cli.providerId === "codex") {
    if (live?.quota?.windows?.length) {
      quota = live.quota
    } else if (runtimeInfo?.codex.quota) {
      const codexSnap = runtimeInfo.codex.quota as typeof runtimeInfo.codex.quota & { snapshot?: CliQuotaSnapshot }
      quota = codexSnap.snapshot ?? quota
    }
    const weekly = quota.windows?.find((w) => w.kind === "weekly")
    const session = quota.windows?.find((w) => w.kind === "session")
    const { percent, reset } = parseCodexQuotaFields(runtimeInfo?.codex.quota.summary ?? quota.summary, quota)
    fields = [
      { key: "plan", value: live?.fields.find((f) => f.key === "plan")?.value ?? "unknown" },
      { key: "weekly remaining", value: weekly?.remainingPercent != null ? `${weekly.remainingPercent}%` : percent != null ? `${percent}%` : "not reported" },
      { key: "5h remaining", value: session?.remainingPercent != null ? `${session.remainingPercent}%` : "not reported" },
      { key: "weekly reset", value: weekly?.resetsAt ? new Date(weekly.resetsAt).toLocaleString() : reset ?? "not reported" },
      ...cli.fields.filter((f) => !["weekly remaining", "refresh", "plan", "5h remaining", "weekly reset"].includes(f.key)),
    ]
  } else if (cli.providerId === "kiro" && runtimeInfo?.kiro) {
    quota = {
      kind: "monthly_usd",
      summary: runtimeInfo.kiro.quota.summary,
      available: runtimeInfo.kiro.quota.available,
      windows: live?.quota.windows ?? [],
      balanceUsd: runtimeInfo.kiro.quota.balanceUsd,
      raw: runtimeInfo.kiro.quota.raw,
    }
    fields = [
      { key: "balance", value: runtimeInfo.kiro.quota.balanceUsd != null ? `$${runtimeInfo.kiro.quota.balanceUsd.toFixed(2)}` : "unknown" },
      { key: "quota", value: runtimeInfo.kiro.quota.summary },
      ...cli.fields.filter((f) => !["balance", "quota"].includes(f.key)),
    ]
  } else if (cli.providerId === "copilot" && runtimeInfo?.copilot) {
    const usage = runtimeInfo.copilot.usage as typeof runtimeInfo.copilot.usage & { snapshot?: CliQuotaSnapshot }
    quota = usage.snapshot ?? {
      kind: "hourly",
      summary: runtimeInfo.copilot.usage.summary,
      available: runtimeInfo.copilot.usage.available,
      windows: live?.quota.windows ?? [],
      raw: runtimeInfo.copilot.usage.raw,
    }
  }

  const modelCaps = cli.capabilities.modelCapabilities ?? []
  const liveModels = live?.models ?? []
  const models: CliLiveModel[] = (liveModels.length ? liveModels.map(normalizeLiveModel) : cli.models.map((m) => ({
    id: m.id,
    name: m.name,
    statusLabel: m.statusLabel,
    fields: m.fields,
    contextWindow: modelCaps.find((c) => c.id === m.id)?.contextWindow,
    costMultiplier: modelCaps.find((c) => c.id === m.id)?.costMultiplier,
    supportedModes: normalizeModes(modelCaps.find((c) => c.id === m.id)?.supportedModes),
  })))

  return {
    providerId: cli.providerId,
    cliTemplateId: cli.id,
    status: resolvedStatus,
    version: live?.version,
    path: live?.path,
    inUseNodeCount: options?.inUseNodeCount ?? 0,
    fields,
    quota,
    models,
    supportedModes: normalizeModes(live?.supportedModes ?? cli.capabilities.supportedModes),
    modeOptions: normalizeModeOptions(live?.modeOptions),
    controlSurface: live?.controlSurface ?? cli.capabilities.controlSurface,
    allowDerivedAgentModes: live?.allowDerivedAgentModes ?? cli.capabilities.allowDerivedAgentModes,
    editableAgentModeFields: live?.editableAgentModeFields ?? cli.capabilities.editableAgentModeFields,
    activeModesInWorkflow: options?.activeModes ?? [],
    telemetry: normalizeTelemetry(live?.telemetry),
  }
}

export function mergeCliSnapshotsForTemplate(
  template: WorkflowTemplate,
  clis: CliProviderTemplate[],
  runtimeInfo: LocalCliInfo | null,
): CliLiveSnapshot[] {
  const usedCliIds = new Set(template.nodes.map((n) => n.cliTemplateId).filter(Boolean))
  const usedProviders = new Set(template.nodes.map((n) => {
    if (n.cliTemplateId) return null
    const mode = n.agentModeTemplateId
    return mode ? undefined : null
  }))
  void usedProviders

  const relevant = clis.filter((cli) =>
    usedCliIds.has(cli.id) ||
    template.nodes.some((n) => !n.cliTemplateId && n.agentModeTemplateId && cli.providerId === resolveProviderForNode(n, template)),
  )

  return relevant.map((cli) => {
    const nodes = template.nodes.filter((n) => n.cliTemplateId === cli.id || (!n.cliTemplateId && resolveProviderForNode(n, template) === cli.providerId))
    const activeModes = [...new Set(nodes.map((n) => n.runtimeMode ?? "build").filter(Boolean))] as AgentRuntimeMode[]
    return mergeCliSnapshot(cli, runtimeInfo, { inUseNodeCount: nodes.length, activeModes })
  })
}

function resolveProviderForNode(node: WorkflowNode, _template: WorkflowTemplate): string {
  if (node.cliTemplateId) {
    const cli = getCliTemplate(node.cliTemplateId)
    return cli?.providerId ?? node.cliTemplateId.replace(/-cli$/, "")
  }
  const mode = node.agentModeTemplateId
  if (mode) {
    const agentMode = getAgentModeTemplate(mode)
    if (agentMode?.cliTemplateId) {
      const cli = getCliTemplate(agentMode.cliTemplateId)
      if (cli) return cli.providerId
    }
    if (mode.includes("codex")) return "codex"
    if (mode.includes("copilot")) return "copilot"
    if (mode.includes("kiro")) return "kiro"
    if (mode.includes("opencode")) return "opencode"
    if (mode.includes("claude")) return "claude-code"
  }
  const agent = node.agentId?.replace("agent-", "").replace("-cli", "")
  if (agent === "kuaipao") return "opencode"
  return agent ?? "opencode"
}
export function runtimeProviderStatus(available: boolean | undefined, binding: BackendProvider["binding"] = "bound"): BackendProvider["status"] {
  if (available) return "online"
  return binding === "disabled" ? "offline" : "degraded"
}

export function providersFromRuntime(runtime: RuntimeSnapshot | null): BackendProvider[] {
  if (!runtime) return backendProviders
  const discovered = new Map(runtime.providers.map((provider) => [provider.id, provider]))
  const merged = backendProviders.map((fallback) => {
    if (fallback.id === "kuaipao" && runtime.health) {
      return { ...fallback, status: "online" as const, binding: "bound" as const }
    }
    const provider = discovered.get(fallback.id)
    if (!provider) return fallback
    return {
      ...fallback,
      name: provider.name || fallback.name,
      status: runtimeProviderStatus(provider.available, fallback.binding),
      version: provider.version ?? fallback.version,
      path: provider.path ?? fallback.path,
    }
  })
  const extras = runtime.providers
    .filter((provider) => !backendProviders.some((fallback) => fallback.id === provider.id))
    .map((provider): BackendProvider => ({
      id: provider.id,
      name: provider.name || provider.id,
      status: runtimeProviderStatus(provider.available),
      version: provider.version ?? "unknown",
      path: provider.path ?? undefined,
      endpoint: "runtime",
      protocol: "cli",
      binding: provider.available ? "bound" : "missing",
    }))
  return [...merged, ...extras]
}

export function systemFromRuntime(runtime: RuntimeSnapshot | null): SystemSnapshot {
  if (!runtime?.cliInfo) {
    return {
      ...systemSnapshot,
      status: runtime?.health === false ? "partial" : systemSnapshot.status,
      lastUpdated: runtime ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : systemSnapshot.lastUpdated,
    }
  }
  const cli = runtime.cliInfo
  const providers = providersFromRuntime(runtime)
  const codexQuota = cli.codex.quota
  const copilotContext = cli.copilot.modelContext
  const copilotRows = copilotContext.rows.length ? copilotContext.rows : []
  const copilotModelLabel = copilotRows[0]
    ? Object.values(copilotRows[0]).filter(Boolean).slice(0, 2).join(" / ")
    : copilotContext.available ? copilotContext.summary : "unavailable"
  return {
    ...systemSnapshot,
    status: runtime.health ? "online" : "partial",
    lastUpdated: new Date(cli.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    cli: {
      version: cli.codex.version ?? "codex unavailable",
      uptime: `${cli.codex.sandbox} / ${cli.codex.reasoningEffort}`,
      path: cli.codex.path ?? cli.codex.configPath,
      available: cli.codex.available,
    },
    apiBinding: {
      endpoint: runtime.health ? "/api" : "API unavailable",
      protocol: "workflow runtime",
      status: runtime.health ? "online" : "degraded",
    },
    quota: {
      summary: codexQuota.summary || systemSnapshot.quota.summary,
      probes: [
        ...codexQuota.probes.map((probe) => ({
          name: probe.label,
          status: runtimeProviderStatus(probe.available),
          detail: probe.note || probe.stdout || probe.stderr || String(probe.exitCode ?? "n/a"),
        })),
        ...cli.copilot.probes.slice(0, 2).map((probe) => ({
          name: probe.label,
          status: runtimeProviderStatus(probe.available),
          detail: probe.note || probe.stdout || probe.stderr || String(probe.exitCode ?? "n/a"),
        })),
      ],
    },
    modelContext: [
      {
        provider: "codex",
        model: cli.codex.model,
        context: cli.codex.reasoningEffort,
        source: cli.codex.configExists ? cli.codex.configPath : "runtime default",
      },
      {
        provider: "copilot",
        model: copilotModelLabel,
        context: cli.copilot.usage.summary || "usage unavailable",
        source: copilotContext.available ? "copilot model probe" : cli.copilot.extensionDetected ? "gh extension" : "not detected",
      },
      ...systemSnapshot.modelContext.filter((item) => item.provider !== "codex" && item.provider !== "copilot"),
    ],
    events: [
      {
        time: new Date(cli.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: "runtime",
        level: runtime.health ? "info" as const : "warn" as const,
        message: runtime.health ? "Runtime API snapshot loaded." : "Runtime API responded with degraded health.",
      },
      ...systemSnapshot.events,
    ].slice(0, 8),
    runtime: {
      ...systemSnapshot.runtime,
      name: `providers ${providers.filter((provider) => provider.status === "online").length}/${providers.length}`,
    },
  }
}
