import type { AgentModeTemplate } from "./console-model"
import type { ToolSource } from "./tool-mapping"

export interface ExposedStrategyKv {
  group: string
  key: string
  label: string
  value: string
  editable: boolean
  source: "vendor" | "runtime" | "overlay"
  description?: string
  tokens?: number
  toolSource?: ToolSource
  opencodeToolId?: string | null
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
    estimatedSchemaTokens?: number
  }
}

/** CLI-backed agent modes with vendor/runtime strategy preview. */
export function isCliStrategyMode(mode: AgentModeTemplate): boolean {
  return Boolean(mode.cliTemplateId)
}

export function isOpencodeStrategyMode(mode: AgentModeTemplate): boolean {
  return mode.provider === "opencode" && mode.cliTemplateId === "opencode-cli"
}

export function isOpencodeCustomizableMode(mode: AgentModeTemplate): boolean {
  return isOpencodeStrategyMode(mode) && mode.controlSurface === "customizable"
}

export function cliStrategyLabelKey(mode: AgentModeTemplate): string {
  if (mode.provider === "opencode") return "agentModes.cliLabels.opencode"
  if (mode.provider === "codex") return "agentModes.cliLabels.codex"
  if (mode.provider === "kiro") return "agentModes.cliLabels.kiro"
  if (mode.provider === "copilot") return "agentModes.cliLabels.copilot"
  if (mode.cliTemplateId === "claude-code-cli") return "agentModes.cliLabels.claudeCode"
  return "agentModes.cliLabels.fallback"
}

export function composeStrategySystemPrompt(mode: AgentModeTemplate): string {
  return mode.defaultSystemPrompt?.trim() ?? ""
}

export function cliEditableOverlayKeys(mode: AgentModeTemplate): string[] {
  if (mode.controlSurface !== "customizable") return []
  if (isOpencodeStrategyMode(mode)) {
    return [
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
  return [
    "defaultSystemPrompt",
    "defaultUserPromptBias",
    "contextMode",
    "maxIterations",
    "timeoutMs",
  ]
}

/** @deprecated use cliEditableOverlayKeys */
export function opencodeEditableOverlayKeys(mode: AgentModeTemplate): string[] {
  return cliEditableOverlayKeys(mode)
}

export function groupExposedKv(items: ExposedStrategyKv[]): Array<{ group: string; items: ExposedStrategyKv[] }> {
  const map = new Map<string, ExposedStrategyKv[]>()
  for (const item of items) {
    const bucket = map.get(item.group) ?? []
    bucket.push(item)
    map.set(item.group, bucket)
  }
  return [...map.entries()].map(([group, groupItems]) => ({ group, items: groupItems }))
}

function parseCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean)
}

export function overlayPatchFromKey(key: string, value: string, mode: AgentModeTemplate): Partial<AgentModeTemplate> | null {
  switch (key) {
    case "overlay.defaultSystemPrompt":
      return { defaultSystemPrompt: value }
    case "overlay.defaultUserPromptBias":
      return { defaultUserPromptBias: value }
    case "overlay.allowedTools":
      return { allowedTools: parseCsv(value) }
    case "overlay.forcedTools":
      return { constraints: { ...mode.constraints, forcedTools: parseCsv(value) } }
    case "overlay.forcedMcpServers":
      return { constraints: { ...mode.constraints, forcedMcpServers: parseCsv(value) } }
    case "overlay.allowedMcpServers":
      return { constraints: { ...mode.constraints, allowedMcpServers: parseCsv(value) } }
    case "overlay.forcedSkills":
      return { constraints: { ...mode.constraints, forcedSkills: parseCsv(value) } }
    case "overlay.allowedSkills":
      return { constraints: { ...mode.constraints, allowedSkills: parseCsv(value) } }
    default:
      return null
  }
}

export function strategyPreviewRequestBody(mode: AgentModeTemplate) {
  return {
    provider: mode.provider,
    cliTemplateId: mode.cliTemplateId,
    mode: mode.mode,
    model: mode.model || "workflow-selected",
    systemPrompt: mode.defaultSystemPrompt,
    userPromptBias: mode.defaultUserPromptBias,
    controlSurface: mode.controlSurface,
    allowedTools: mode.allowedTools,
    editableOverlayKeys: cliEditableOverlayKeys(mode),
    constraints: {
      allowedTools: mode.constraints?.allowedTools ?? mode.allowedTools,
      forcedTools: mode.constraints?.forcedTools,
      forcedMcpServers: mode.constraints?.forcedMcpServers,
      allowedMcpServers: mode.constraints?.allowedMcpServers,
      forcedSkills: mode.constraints?.forcedSkills,
      allowedSkills: mode.constraints?.allowedSkills,
    },
  }
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

function translateOrFallback(t: TranslateFn, key: string, fallback: string, vars?: Record<string, string | number>) {
  const message = t(key, vars)
  return message === key ? fallback : message
}

export function strategyGroupLabel(t: TranslateFn, group: string) {
  return translateOrFallback(t, `strategy.group.${group}`, group)
}

export function strategyFieldLabel(t: TranslateFn, item: ExposedStrategyKv) {
  const overlay = t(`strategy.overlay.${item.label}`)
  if (overlay !== `strategy.overlay.${item.label}`) return overlay

  if (item.label === "system.provider_prompt") {
    const id = item.key.startsWith("system.") ? item.key.slice("system.".length) : item.key
    return translateOrFallback(t, "strategy.label.system.provider_prompt", item.label, { id })
  }

  if (item.label === "tool.enabled" && item.key.startsWith("tools.")) {
    const tool = item.key.slice("tools.".length)
    return translateOrFallback(t, "strategy.label.tool.enabled", item.label, { tool })
  }

  return translateOrFallback(t, `strategy.label.${item.label}`, item.label)
}

export function strategyFieldDescription(t: TranslateFn, description?: string) {
  if (!description) return undefined
  const translated = t(`strategy.desc.${description}`)
  if (translated !== `strategy.desc.${description}`) return translated
  return description
}

export function strategySourceBadge(t: TranslateFn, source: "vendor" | "runtime" | "overlay" | "locked") {
  return translateOrFallback(t, `strategy.badge.${source}`, source)
}

export function strategyToolSourceBadge(t: TranslateFn, toolSource: ToolSource) {
  const key = toolSource === "opencode-native" ? "strategy.source.opencodeNative" : `strategy.source.${toolSource}`
  return translateOrFallback(t, key, toolSource)
}
