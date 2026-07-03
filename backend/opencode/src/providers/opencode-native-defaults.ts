/**
 * Native OpenCode runtime defaults mirrored from vendor agent.ts + tool/registry.ts.
 *
 * Parity invariant: xy assembles OPENCODE_CONFIG_CONTENT starting from these defaults;
 * workflow constraints and workspace sandbox apply as overrides only — never replacing
 * vendor provider prompts or stripping native tools unless explicitly constrained.
 * System tool ids map via cli-probes/tool-mapping.ts.
 */

import { OPENCODE_BUILTIN_TOOLS } from "../cli-probes/opencode-strategy-schema.js"

/** Delegation tools disabled in workflow node runs (subagent/shell delegation). */
export const WORKFLOW_DELEGATION_TOOLS = ["task", "skill", "todowrite", "todoread", "bash"] as const

/** Mirrors vendor tool/registry.ts: gpt-4* uses edit/write; newer gpt-* uses patch. */
export function usesPatchTool(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return id.includes("gpt-") && !id.includes("oss") && !id.includes("gpt-4")
}

export function resolveModelId(model: string | undefined): string {
  if (!model?.trim()) return ""
  return model.includes("/") ? model.split("/").slice(1).join("/") : model
}

/** Native tool toggles before workflow constraints (all enabled except patch/edit split). */
export function nativeToolTogglesForModel(modelId: string): Record<string, boolean> {
  const usePatch = usesPatchTool(modelId)
  const toggles: Record<string, boolean> = {}
  for (const tool of OPENCODE_BUILTIN_TOOLS) {
    if (tool === "patch") toggles[tool] = usePatch
    else if (tool === "edit" || tool === "write") toggles[tool] = !usePatch
    else toggles[tool] = true
  }
  return toggles
}

export function constrainToolTogglesToAllowed(
  base: Record<string, boolean>,
  allowedOpencodeIds: Set<string>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const tool of OPENCODE_BUILTIN_TOOLS) {
    out[tool] = allowedOpencodeIds.has(tool) && (base[tool] ?? true)
  }
  for (const tool of WORKFLOW_DELEGATION_TOOLS) {
    if (tool === "bash" && allowedOpencodeIds.has("bash")) continue
    out[tool] = false
  }
  return out
}

export interface WorkspaceSandboxOptions {
  allowWebFetch?: boolean
  /** When true, permit OpenCode bash (latex_build / shell_metadata nodes). */
  allowBash?: boolean
}

/**
 * Workflow workspace sandbox — shared by runner (opencode.ts) and strategy preview.
 * Merges deny overrides onto existing config.tools; unlisted tools keep native agent defaults.
 */
export function applyWorkspaceSandbox(
  config: Record<string, unknown>,
  options: WorkspaceSandboxOptions = {},
): void {
  const allowWebFetch = options.allowWebFetch ?? false
  const allowBash = options.allowBash ?? false
  const tools = (config.tools && typeof config.tools === "object" ? config.tools : {}) as Record<string, boolean>
  config.tools = {
    bash: allowBash,
    webfetch: allowWebFetch,
    task: false,
    skill: false,
    todowrite: false,
    todoread: false,
    ...tools,
  }
  // Do NOT use { [root]/**: allow, "*": deny } for read/edit — OpenCode treats a trailing
  // "*": "deny" rule as disabling the whole tool. Rely on --dir worktree + external_directory.
  config.permission = {
    ...(config.permission as Record<string, unknown> | undefined),
    read: tools.read === false ? "deny" : "allow",
    edit: tools.write === false && tools.edit === false && tools.patch === false ? "deny" : "allow",
    glob: tools.glob === false ? "deny" : "allow",
    grep: tools.grep === false ? "deny" : "allow",
    list: tools.list === false ? "deny" : "allow",
    task: "deny",
    skill: "deny",
    bash: allowBash ? "allow" : "deny",
    webfetch: allowWebFetch ? "allow" : "deny",
    websearch: allowWebFetch ? "allow" : "deny",
    external_directory: "deny",
  }
}

export function enabledToolsFromConfig(config: Record<string, unknown>): string[] {
  const tools = (config.tools ?? {}) as Record<string, boolean>
  const permission = (config.permission ?? {}) as Record<string, unknown>
  return OPENCODE_BUILTIN_TOOLS.filter((toolId) => {
    if (tools[toolId] === false) return false
    const rule = permission[toolId]
    if (rule === "deny") return false
    if (typeof rule === "object" && rule !== null) {
      const values = Object.values(rule as Record<string, string>)
      if (values.length && values.every((v) => v === "deny")) return false
    }
    return true
  })
}

/** Config-permitted tools after vendor model filter (patch vs edit/write). */
export function enabledToolsForRuntime(config: Record<string, unknown>, model?: string): string[] {
  const modelId = resolveModelId(model ?? (typeof config.model === "string" ? config.model : undefined))
  const usePatch = usesPatchTool(modelId)
  return enabledToolsFromConfig(config).filter((toolId) => {
    if (toolId === "patch") return usePatch
    if (toolId === "edit" || toolId === "write") return !usePatch
    return true
  })
}

export function workflowAllowsWebFetch(toolIds: string[]): boolean {
  return toolIds.some((t) => t === "webfetch" || t === "web_search")
}

/** latex_build and shell_metadata map to OpenCode bash at runtime. */
export function workflowAllowsShell(toolIds: string[]): boolean {
  return toolIds.some((t) => t === "latex_build" || t === "shell_metadata" || t === "bash")
}
