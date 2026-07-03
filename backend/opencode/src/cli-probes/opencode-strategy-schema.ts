import type { SystemToolMapping, ToolSource } from "./tool-mapping.js"

/** Canonical OpenCode strategy surface loaded from vendor + runtime overlay. */

/** Stable group keys — translate on the frontend via strategy.group.* */
export const STRATEGY_GROUP_KEYS = {
  agent: "agent",
  system_prompt: "system_prompt",
  plan_mode: "plan_mode",
  environment: "environment",
  subagents: "subagents",
  tools: "tools",
  permission: "permission",
  mcp: "mcp",
  skills: "skills",
  config: "config",
  runtime_envelope: "runtime_envelope",
  workflow_overlay: "workflow_overlay",
} as const

export type StrategyGroupKey = (typeof STRATEGY_GROUP_KEYS)[keyof typeof STRATEGY_GROUP_KEYS]

export const OPENCODE_BUILTIN_TOOLS = [
  "bash",
  "read",
  "edit",
  "write",
  "grep",
  "glob",
  "list",
  "webfetch",
  "websearch",
  "task",
  "skill",
  "todowrite",
  "todoread",
  "lsp",
  "patch",
] as const

export const OPENCODE_PERMISSION_KEYS = [
  "read",
  "edit",
  "write",
  "glob",
  "grep",
  "list",
  "bash",
  "webfetch",
  "websearch",
  "task",
  "skill",
  "todowrite",
  "todoread",
  "lsp",
  "external_directory",
] as const

export interface ExposedStrategyKv {
  group: StrategyGroupKey | string
  key: string
  /** Stable label key — translate on the frontend via strategy.label.* */
  label: string
  value: string
  editable: boolean
  /** locked = runtime/vendor; overlay = xy customizable override */
  source: "vendor" | "runtime" | "overlay"
  /** Stable description key (strategy.desc.*) or raw vendor path */
  description?: string
  tokens?: number
  /** Present on workflow tool rows mapped to OpenCode builtins */
  toolSource?: ToolSource
  opencodeToolId?: string | null
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

function isEmptyValue(value: string): boolean {
  const trimmed = value.trim()
  return trimmed === "" || trimmed === "(unset)" || trimmed === "[]" || trimmed === "{}"
}

function push(
  out: ExposedStrategyKv[],
  item: Omit<ExposedStrategyKv, "value"> & { value: unknown },
) {
  const value = stringify(item.value)
  if (isEmptyValue(value)) return
  out.push({ ...item, value })
}

export function flattenOpencodePreviewToKv(input: {
  opencodeAgent: string
  agentInfo?: { description?: string; prompt?: string; promptSource?: string }
  providerPrompt?: { id: string; source: string; text: string; tokens: number }
  planPrompts?: Array<{ key: string; source: string; text: string; tokens: number }>
  toolDescriptions?: Record<string, { source: string; text: string; tokens: number }>
  enabledTools?: string[]
  opencodeConfig: Record<string, unknown>
  runtimeEnvelope: Record<string, unknown>
  workflowOverlay?: Record<string, unknown>
  editableOverlayKeys?: string[]
  environmentTemplate?: string
  subagentCatalog?: string
  runtimeToolMappings?: Array<SystemToolMapping & { enabled?: boolean }>
}): ExposedStrategyKv[] {
  const out: ExposedStrategyKv[] = []
  const editableOverlay = new Set(input.editableOverlayKeys ?? [])
  const config = input.opencodeConfig
  const tools = (config.tools ?? {}) as Record<string, boolean>
  const permission = (config.permission ?? {}) as Record<string, unknown>
  const mcp = (config.mcp ?? {}) as Record<string, unknown>
  const skills = config.skills

  push(out, {
    group: STRATEGY_GROUP_KEYS.agent,
    key: "agent.name",
    label: "agent.name",
    value: input.opencodeAgent,
    editable: false,
    source: "vendor",
    description: "agent_name",
  })

  if (input.agentInfo?.description) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.agent,
      key: "agent.description",
      label: "agent.description",
      value: input.agentInfo.description,
      editable: false,
      source: "vendor",
    })
  }

  if (input.agentInfo?.prompt) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.agent,
      key: "agent.prompt",
      label: "agent.prompt",
      value: input.agentInfo.prompt,
      editable: false,
      source: "vendor",
      description: input.agentInfo.promptSource,
      tokens: Math.ceil(input.agentInfo.prompt.length / 4),
    })
  }

  if (input.providerPrompt?.text) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.system_prompt,
      key: `system.${input.providerPrompt.id}`,
      label: "system.provider_prompt",
      value: input.providerPrompt.text,
      editable: false,
      source: "vendor",
      description: input.providerPrompt.source,
      tokens: input.providerPrompt.tokens,
    })
  }

  for (const plan of input.planPrompts ?? []) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.plan_mode,
      key: `plan.${plan.key}`,
      label: plan.key,
      value: plan.text,
      editable: false,
      source: "vendor",
      description: plan.source,
      tokens: plan.tokens,
    })
  }

  if (input.environmentTemplate) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.environment,
      key: "environment.template",
      label: "environment.template",
      value: input.environmentTemplate,
      editable: false,
      source: "runtime",
      description: "environment_template",
      tokens: Math.ceil(input.environmentTemplate.length / 4),
    })
  }

  if (input.subagentCatalog) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.subagents,
      key: "subagents.catalog",
      label: "subagents.catalog",
      value: input.subagentCatalog,
      editable: false,
      source: "vendor",
      description: "subagent_catalog",
      tokens: Math.ceil(input.subagentCatalog.length / 4),
    })
  }

  const enabled = new Set(input.enabledTools ?? OPENCODE_BUILTIN_TOOLS)
  for (const toolId of OPENCODE_BUILTIN_TOOLS) {
    if (!enabled.has(toolId)) continue
    const desc = input.toolDescriptions?.[toolId]
    if (desc?.text) {
      push(out, {
        group: STRATEGY_GROUP_KEYS.tools,
        key: `tool.${toolId}.description`,
        label: toolId,
        value: desc.text,
        editable: false,
        source: "vendor",
        description: desc.source,
        tokens: desc.tokens,
      })
    }
    const toggle = tools[toolId]
    if (toggle !== undefined) {
      push(out, {
        group: STRATEGY_GROUP_KEYS.tools,
        key: `tools.${toolId}`,
        label: "tool.enabled",
        value: toggle,
        editable: false,
        source: "runtime",
        description: "tool_toggle",
      })
    }
  }

  for (const mapping of input.runtimeToolMappings ?? []) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.tools,
      key: `tool.map.${mapping.systemToolId}`,
      label: mapping.systemToolId,
      value: mapping.opencodeToolId ? `→ ${mapping.opencodeToolId}` : "(no OpenCode builtin)",
      editable: false,
      source: "runtime",
      description: mapping.description ?? "tool_mapping",
      toolSource: mapping.source,
      opencodeToolId: mapping.opencodeToolId,
    })
  }

  for (const key of OPENCODE_PERMISSION_KEYS) {
    const rule = permission[key]
    if (rule === undefined || rule === null) continue
    push(out, {
      group: STRATEGY_GROUP_KEYS.permission,
      key: `permission.${key}`,
      label: key,
      value: rule,
      editable: false,
      source: "runtime",
      description: "permission_merged",
    })
  }

  for (const [id, server] of Object.entries(mcp)) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.mcp,
      key: `mcp.${id}`,
      label: id,
      value: server,
      editable: false,
      source: "runtime",
      description: "mcp_injected",
    })
  }

  if (skills !== undefined && skills !== null && stringify(skills).trim() !== "") {
    push(out, {
      group: STRATEGY_GROUP_KEYS.skills,
      key: "skills",
      label: "skills",
      value: skills,
      editable: false,
      source: "runtime",
    })
  }

  push(out, {
    group: STRATEGY_GROUP_KEYS.config,
    key: "config.model",
    label: "config.model",
    value: config.model,
    editable: false,
    source: "runtime",
  })

  push(out, {
    group: STRATEGY_GROUP_KEYS.config,
    key: "opencodeConfig",
    label: "config.opencode_config",
    value: config,
    editable: false,
    source: "runtime",
    description: "opencode_config_full",
    tokens: Math.ceil(stringify(config).length / 4),
  })

  const env = (input.runtimeEnvelope as { env?: Record<string, string> }).env ?? {}
  for (const [k, v] of Object.entries(env)) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.runtime_envelope,
      key: `env.${k}`,
      label: k,
      value: v,
      editable: false,
      source: "runtime",
    })
  }

  const argv = (input.runtimeEnvelope as { argv?: unknown }).argv
  if (argv) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.runtime_envelope,
      key: "runtime.argv",
      label: "runtime.argv",
      value: argv,
      editable: false,
      source: "runtime",
    })
  }

  const stdin = (input.runtimeEnvelope as { stdin?: unknown }).stdin
  if (stdin) {
    push(out, {
      group: STRATEGY_GROUP_KEYS.runtime_envelope,
      key: "runtime.stdin",
      label: "runtime.stdin",
      value: stdin,
      editable: false,
      source: "runtime",
      description: "runtime_stdin",
    })
  }

  if (input.workflowOverlay) {
    for (const [k, v] of Object.entries(input.workflowOverlay)) {
      push(out, {
        group: STRATEGY_GROUP_KEYS.workflow_overlay,
        key: `overlay.${k}`,
        label: k,
        value: v,
        editable: editableOverlay.has(k),
        source: "overlay",
      })
    }
  }

  return out
}
