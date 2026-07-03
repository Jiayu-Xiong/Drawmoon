import { buildQuotaSnapshot } from "../cli-limits.js"
import { collectOpenCodeTelemetry, EMPTY_CLI_TELEMETRY } from "../opencode-telemetry.js"
import { opencodeProvider } from "../providers/opencode.js"
import type { CliLiveSnapshot, CliQuotaSnapshot } from "../schema/cli-budget-types.js"
import { providerInfoProbe } from "./probe-runner.js"
import type { CliProbe } from "./types.js"

export type OpenCodeProbeResult = {
  providerInfo: Awaited<ReturnType<typeof opencodeProvider.detect>> | null
  telemetry: Awaited<ReturnType<typeof collectOpenCodeTelemetry>>
  quota: CliQuotaSnapshot
  probe: CliProbe
  liveSnapshot: CliLiveSnapshot
}

export async function probeOpenCode(): Promise<OpenCodeProbeResult> {
  const providerInfo = await opencodeProvider.detect().catch(() => null)
  const telemetry = await collectOpenCodeTelemetry().catch(() => ({
    telemetry: EMPTY_CLI_TELEMETRY,
    models: [],
    quotaWindows: [],
  }))

  const quota = buildQuotaSnapshot(
    telemetry.quotaWindows.length ? "monthly_usd" : "unknown",
    telemetry.telemetry.summary,
    telemetry.telemetry.available,
    telemetry.telemetry.rawPath ?? null,
    telemetry.quotaWindows,
    telemetry.quotaWindows.find((window) => window.kind === "billing")?.remaining ?? null,
  )

  const probe = providerInfoProbe(
    "opencode-usage-db",
    "OpenCode usage database",
    "read ~/.local/share/opencode/opencode*.db",
    telemetry.telemetry.available,
    telemetry.telemetry.summary,
    telemetry.telemetry.rawPath ?? undefined,
  )

  const liveSnapshot: CliLiveSnapshot = {
    providerId: "opencode",
    cliTemplateId: "opencode-cli",
    status: providerInfo?.available
      ? "online"
      : telemetry.telemetry.available ? "degraded" : "offline",
    version: providerInfo?.version ?? undefined,
    path: providerInfo?.path ?? telemetry.telemetry.rawPath ?? undefined,
    inUseNodeCount: 0,
    fields: [
      { key: "today", value: `${telemetry.telemetry.periods.today?.totalTokens?.toLocaleString() ?? 0} tokens` },
      { key: "month", value: `${telemetry.telemetry.periods.month?.totalTokens?.toLocaleString() ?? 0} tokens` },
      { key: "cost today", value: `$${(telemetry.telemetry.periods.today?.costUsd ?? 0).toFixed(4)}` },
      { key: "last activity", value: telemetry.telemetry.lastActivityAt ?? "not reported" },
    ],
    quota,
    models: telemetry.models.length
      ? telemetry.models
      : [
        { id: "workflow-selected", name: "workflow selected", statusLabel: "runtime-bound", fields: [{ key: "source", value: "Workflow node LLM API/model" }], supportedModes: ["chat", "plan", "build", "agent"] },
      ],
    supportedModes: ["chat", "plan", "build", "agent"],
    modeOptions: [
      { id: "chat", label: "Chat", editable: true, source: "native", description: "Prompt/reply mode, lowest ceremony." },
      { id: "plan", label: "Plan", editable: true, source: "native", description: "Planning-first workflow mode." },
      { id: "build", label: "Build", editable: true, source: "native", description: "Implementation mode with write-capable tools." },
      { id: "agent", label: "Agent", editable: true, source: "native", description: "Native OpenCode agent alias." },
    ],
    controlSurface: "customizable",
    allowDerivedAgentModes: true,
    editableAgentModeFields: [
      "defaultSystemPrompt",
      "defaultUserPromptBias",
      "model",
      "contextMode",
      "maxIterations",
      "timeoutMs",
      "allowFileWrites",
      "allowedTools",
      "forcedSkills",
      "forcedMcpServers",
    ],
    activeModesInWorkflow: [],
    telemetry: telemetry.telemetry,
  }

  return { providerInfo, telemetry, quota, probe, liveSnapshot }
}
