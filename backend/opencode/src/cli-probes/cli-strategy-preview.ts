import { parse as parseTOML } from "smol-toml"

import { codexProvider } from "../providers/codex.js"
import type { AgentNodeConfig } from "../schema/types.js"
import { readCodexConfig } from "./codex-config.js"
import { probeCopilot } from "./copilot-probe.js"
import { probeKiro } from "./kiro-probe.js"
import { runProbe } from "./probe-runner.js"
import type { ExposedStrategyKv } from "./opencode-strategy-schema.js"
import { STRATEGY_GROUP_KEYS } from "./opencode-strategy-schema.js"
import { previewOpencodeRuntimePayload } from "./opencode-config-preview.js"
import { resolveToolMappingsForList, toolMappingCatalog, type ToolSource } from "./tool-mapping.js"

export interface CliStrategyPreviewInput {
  provider: string
  cliTemplateId?: string
  mode?: string
  model?: string
  systemPrompt?: string
  userPromptBias?: string
  controlSurface?: "cli-owned" | "customizable"
  constraints?: AgentNodeConfig["constraints"]
  allowedTools?: string[]
  editableOverlayKeys?: string[]
  workspaceDir?: string
  readRoots?: string[]
  flatWriteOnly?: boolean
}

export interface CliStrategyToolEntry {
  systemToolId: string
  opencodeToolId: string | null
  source: ToolSource
  enabled: boolean
  description?: string
}

export interface CliStrategyPreview {
  provider: string
  cliLabel: string
  opencodeAgent?: string
  exposedKv: ExposedStrategyKv[]
  tools: CliStrategyToolEntry[]
  totals?: {
    kvCount: number
    estimatedPromptTokens?: number
    enabledToolCount: number
  }
  catalog?: ReturnType<typeof toolMappingCatalog>
}

function pushKv(out: ExposedStrategyKv[], item: Omit<ExposedStrategyKv, "value"> & { value: unknown }) {
  const value = stringify(item.value)
  if (!value.trim() || value.trim() === "(unset)" || value.trim() === "[]" || value.trim() === "{}") return
  out.push({ ...item, value })
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function overlayKeysForControlSurface(controlSurface: "cli-owned" | "customizable" | undefined, input: CliStrategyPreviewInput): string[] {
  if (controlSurface !== "customizable") return []
  return input.editableOverlayKeys ?? [
    "defaultSystemPrompt",
    "defaultUserPromptBias",
    "allowedTools",
    "forcedTools",
    "forcedMcpServers",
    "allowedMcpServers",
    "forcedSkills",
    "allowedSkills",
  ]
}

function buildWorkflowOverlay(input: CliStrategyPreviewInput, editableKeys: string[]): { overlay: Record<string, unknown>; kv: ExposedStrategyKv[] } {
  const overlay: Record<string, unknown> = {}
  const kv: ExposedStrategyKv[] = []
  if (input.systemPrompt?.trim()) overlay.defaultSystemPrompt = input.systemPrompt.trim()
  if (input.userPromptBias?.trim()) overlay.defaultUserPromptBias = input.userPromptBias.trim()
  const allowedTools = input.constraints?.allowedTools ?? input.allowedTools
  if (allowedTools?.length) overlay.allowedTools = allowedTools
  if (input.constraints?.forcedTools?.length) overlay.forcedTools = input.constraints.forcedTools
  if (input.constraints?.forcedMcpServers?.length) overlay.forcedMcpServers = input.constraints.forcedMcpServers
  if (input.constraints?.allowedMcpServers?.length) overlay.allowedMcpServers = input.constraints.allowedMcpServers
  if (input.constraints?.forcedSkills?.length) overlay.forcedSkills = input.constraints.forcedSkills
  if (input.constraints?.allowedSkills?.length) overlay.allowedSkills = input.constraints.allowedSkills

  for (const [k, v] of Object.entries(overlay)) {
    pushKv(kv, {
      group: STRATEGY_GROUP_KEYS.workflow_overlay,
      key: `overlay.${k}`,
      label: k,
      value: v,
      editable: editableKeys.includes(k),
      source: "overlay",
    })
  }
  return { overlay, kv }
}

function toolEntriesFromIds(toolIds: string[]): CliStrategyToolEntry[] {
  return resolveToolMappingsForList(toolIds).map((m) => ({
    systemToolId: m.systemToolId,
    opencodeToolId: m.opencodeToolId,
    source: m.source,
    enabled: m.enabled,
    description: m.description,
  }))
}

function appendToolKv(out: ExposedStrategyKv[], tools: CliStrategyToolEntry[]) {
  for (const tool of tools) {
    pushKv(out, {
      group: STRATEGY_GROUP_KEYS.tools,
      key: `tool.${tool.systemToolId}`,
      label: tool.systemToolId,
      value: tool.opencodeToolId
        ? `→ ${tool.opencodeToolId}`
        : "(no OpenCode mapping)",
      editable: false,
      source: "runtime",
      description: tool.description ?? `tool_source:${tool.source}`,
      toolSource: tool.source,
      opencodeToolId: tool.opencodeToolId,
    })
  }
}

async function previewCodexStrategy(input: CliStrategyPreviewInput): Promise<CliStrategyPreview> {
  const out: ExposedStrategyKv[] = []
  const config = readCodexConfig()
  const status = await codexProvider.getStatus().catch(() => null)
  const execHelp = runProbe("codex-exec-help", "Codex exec help", "codex", ["exec", "--help"])

  if (config.text) {
    pushKv(out, {
      group: STRATEGY_GROUP_KEYS.config,
      key: "config.toml",
      label: "config.toml",
      value: config.text,
      editable: false,
      source: "vendor",
      description: config.configPath,
      tokens: Math.ceil(config.text.length / 4),
    })
  } else {
    pushKv(out, {
      group: STRATEGY_GROUP_KEYS.config,
      key: "config.path",
      label: "config path",
      value: `${config.configPath} (not found)`,
      editable: false,
      source: "vendor",
    })
  }

  if (status) {
    pushKv(out, {
      group: "runtime",
      key: "runtime.model",
      label: "model",
      value: status.model,
      editable: false,
      source: "runtime",
    })
    pushKv(out, {
      group: "runtime",
      key: "runtime.reasoningEffort",
      label: "reasoning effort",
      value: status.reasoningEffort,
      editable: false,
      source: "runtime",
    })
    pushKv(out, {
      group: "runtime",
      key: "runtime.sandbox",
      label: "sandbox",
      value: status.sandbox,
      editable: false,
      source: "runtime",
    })
    pushKv(out, {
      group: "runtime",
      key: "runtime.version",
      label: "version",
      value: status.version,
      editable: false,
      source: "runtime",
    })

    const featureLines = Object.entries(status.features)
      .map(([name, info]) => `${name}\t${info.stage}\t${info.enabled}`)
    if (featureLines.length) {
      pushKv(out, {
        group: "features",
        key: "features.list",
        label: "feature flags",
        value: featureLines.join("\n"),
        editable: false,
        source: "vendor",
      })
    }
  }

  if (config.text) {
    try {
      const parsed = parseTOML(config.text) as Record<string, unknown>
      for (const [key, value] of Object.entries(parsed)) {
        if (key === "features") continue
        pushKv(out, {
          group: STRATEGY_GROUP_KEYS.config,
          key: `config.${key}`,
          label: key,
          value,
          editable: false,
          source: "vendor",
        })
      }
    } catch {
      /* raw toml already shown */
    }
  }

  if (execHelp.stdout) {
    pushKv(out, {
      group: STRATEGY_GROUP_KEYS.runtime_envelope,
      key: "runtime.execHelp",
      label: "codex exec --help",
      value: execHelp.stdout,
      editable: false,
      source: "vendor",
    })
  }

  const mode = input.mode ?? "build"
  pushKv(out, {
    group: STRATEGY_GROUP_KEYS.runtime_envelope,
    key: "runtime.argv",
    label: "argv template",
    value: ["codex", "exec", "--json", "--ephemeral", "--sandbox", "workspace-write", "--cd", "<workspace>", "--skip-git-repo-check", "<prompt>"],
    editable: false,
    source: "runtime",
    description: `AGENT_MODE=${mode}`,
  })

  const editableKeys = overlayKeysForControlSurface(input.controlSurface, input)
  const { kv: overlayKv } = buildWorkflowOverlay(input, editableKeys)
  out.push(...overlayKv)

  const toolIds = input.constraints?.forcedTools ?? input.constraints?.allowedTools ?? input.allowedTools ?? ["codex_exec"]
  const tools = toolEntriesFromIds(toolIds)
  appendToolKv(out, tools)

  return {
    provider: "codex",
    cliLabel: "Codex",
    exposedKv: out,
    tools,
    totals: { kvCount: out.length, enabledToolCount: tools.length },
    catalog: toolMappingCatalog(),
  }
}

function previewKiroStrategy(input: CliStrategyPreviewInput): CliStrategyPreview {
  const out: ExposedStrategyKv[] = []
  const probe = probeKiro()
  const mode = input.mode ?? "chat"
  const agentName = input.model?.includes("/") ? input.model.split("/").slice(1).join("/") : "kiro_default"

  if (probe.version) {
    pushKv(out, {
      group: "runtime",
      key: "runtime.version",
      label: "version",
      value: probe.version,
      editable: false,
      source: "runtime",
    })
  }

  if (probe.whoamiRaw) {
    pushKv(out, {
      group: "account",
      key: "account.whoami",
      label: "whoami",
      value: probe.whoamiRaw,
      editable: false,
      source: "vendor",
    })
  }

  if (probe.modelRows.length) {
    pushKv(out, {
      group: "models",
      key: "models.list",
      label: "available models",
      value: probe.modelRows,
      editable: false,
      source: "vendor",
    })
  }

  pushKv(out, {
    group: STRATEGY_GROUP_KEYS.runtime_envelope,
    key: "runtime.argv",
    label: "argv template",
    value: ["kiro-cli", mode === "plan" ? "plan" : "chat", "--agent", agentName, "<prompt>"],
    editable: false,
    source: "runtime",
    description: `KIRO ${mode} mode`,
  })

  const editableKeys = overlayKeysForControlSurface(input.controlSurface, input)
  const { kv: overlayKv } = buildWorkflowOverlay(input, editableKeys)
  out.push(...overlayKv)

  const toolIds = input.constraints?.forcedTools ?? input.constraints?.allowedTools ?? input.allowedTools ?? []
  const tools = toolEntriesFromIds(toolIds)
  if (tools.length) appendToolKv(out, tools)

  return {
    provider: "kiro",
    cliLabel: "KIRO",
    exposedKv: out,
    tools,
    totals: { kvCount: out.length, enabledToolCount: tools.length },
    catalog: toolMappingCatalog(),
  }
}

function previewCopilotStrategy(input: CliStrategyPreviewInput): CliStrategyPreview {
  const out: ExposedStrategyKv[] = []
  const probe = probeCopilot()

  if (probe.command) {
    pushKv(out, {
      group: "runtime",
      key: "runtime.command",
      label: "command",
      value: probe.command,
      editable: false,
      source: "runtime",
    })
  }

  const helpProbe = probe.probes.find((p) => p.id === "copilot-help")
  if (helpProbe?.stdout) {
    pushKv(out, {
      group: STRATEGY_GROUP_KEYS.runtime_envelope,
      key: "runtime.help",
      label: "copilot --help",
      value: helpProbe.stdout,
      editable: false,
      source: "vendor",
    })
  }

  if (probe.modelContext.raw) {
    pushKv(out, {
      group: "models",
      key: "models.list",
      label: "gh copilot models",
      value: probe.modelContext.raw,
      editable: false,
      source: "vendor",
    })
  }

  pushKv(out, {
    group: STRATEGY_GROUP_KEYS.runtime_envelope,
    key: "runtime.argv",
    label: "argv template",
    value: ["copilot", "<prompt>"],
    editable: false,
    source: "runtime",
  })

  const editableKeys = overlayKeysForControlSurface(input.controlSurface, input)
  const { kv: overlayKv } = buildWorkflowOverlay(input, editableKeys)
  out.push(...overlayKv)

  const toolIds = input.constraints?.forcedTools ?? input.constraints?.allowedTools ?? input.allowedTools ?? ["copilot_chat"]
  const tools = toolEntriesFromIds(toolIds)
  appendToolKv(out, tools)

  return {
    provider: "copilot",
    cliLabel: "Copilot",
    exposedKv: out,
    tools,
    totals: { kvCount: out.length, enabledToolCount: tools.length },
    catalog: toolMappingCatalog(),
  }
}

function previewClaudeCodeStrategy(input: CliStrategyPreviewInput): CliStrategyPreview {
  const out: ExposedStrategyKv[] = []
  const help = runProbe("claude-help", "Claude Code help", "claude", ["--help"])
  const version = runProbe("claude-version", "Claude Code version", "claude", ["--version"])

  if (version.stdout) {
    pushKv(out, {
      group: "runtime",
      key: "runtime.version",
      label: "version",
      value: version.stdout,
      editable: false,
      source: "runtime",
    })
  }

  if (help.stdout) {
    pushKv(out, {
      group: STRATEGY_GROUP_KEYS.runtime_envelope,
      key: "runtime.help",
      label: "claude --help",
      value: help.stdout,
      editable: false,
      source: "vendor",
    })
  }

  pushKv(out, {
    group: STRATEGY_GROUP_KEYS.runtime_envelope,
    key: "runtime.argv",
    label: "argv template",
    value: ["claude", "-p", "<prompt>"],
    editable: false,
    source: "runtime",
  })

  const editableKeys = overlayKeysForControlSurface(input.controlSurface, input)
  const { kv: overlayKv } = buildWorkflowOverlay(input, editableKeys)
  out.push(...overlayKv)

  const toolIds = input.constraints?.forcedTools ?? input.constraints?.allowedTools ?? input.allowedTools ?? []
  const tools = toolEntriesFromIds(toolIds)
  if (tools.length) appendToolKv(out, tools)

  return {
    provider: "custom",
    cliLabel: "Claude Code",
    exposedKv: out,
    tools,
    totals: { kvCount: out.length, enabledToolCount: tools.length },
    catalog: toolMappingCatalog(),
  }
}

export async function previewCliStrategy(input: CliStrategyPreviewInput): Promise<CliStrategyPreview> {
  const provider = input.provider

  if (provider === "opencode") {
    const preview = previewOpencodeRuntimePayload({
      model: input.model,
      mode: input.mode,
      systemPrompt: input.systemPrompt,
      userPromptBias: input.userPromptBias,
      constraints: input.constraints,
      workspaceDir: input.workspaceDir,
      readRoots: input.readRoots,
      flatWriteOnly: input.flatWriteOnly,
      editableOverlayKeys: overlayKeysForControlSurface(input.controlSurface ?? "customizable", input),
    })
    const toolIds = [
      ...(input.constraints?.forcedTools ?? []),
      ...(input.constraints?.allowedTools ?? input.allowedTools ?? []),
    ]
    const tools = preview.runtimeToolMappings?.map((m) => ({
      systemToolId: m.systemToolId,
      opencodeToolId: m.opencodeToolId,
      source: m.source,
      enabled: m.enabled ?? true,
      description: m.description,
    })) ?? toolEntriesFromIds(toolIds)
    return {
      provider: "opencode",
      cliLabel: "OpenCode",
      opencodeAgent: preview.opencodeAgent,
      exposedKv: preview.exposedKv,
      tools,
      totals: {
        kvCount: preview.totals.kvCount,
        estimatedPromptTokens: preview.totals.estimatedPromptTokens,
        enabledToolCount: preview.totals.enabledToolCount,
      },
      catalog: { ...toolMappingCatalog(), ...preview.catalog },
    }
  }

  if (provider === "codex") return previewCodexStrategy(input)
  if (provider === "kiro") return previewKiroStrategy(input)
  if (provider === "copilot") return previewCopilotStrategy(input)
  if (input.cliTemplateId === "claude-code-cli" || provider === "custom") {
    return previewClaudeCodeStrategy(input)
  }

  return {
    provider,
    cliLabel: provider,
    exposedKv: [],
    tools: [],
    totals: { kvCount: 0, enabledToolCount: 0 },
    catalog: toolMappingCatalog(),
  }
}
