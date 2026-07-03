import { readLibraryManifest } from "../drawmoon/library.js"

export type ToolSource = "static" | "systemed" | "opencode-native" | "custom"

export interface SystemToolMapping {
  systemToolId: string
  opencodeToolId: string | null
  source: ToolSource
  description?: string
}

/** System-provided tools consumed by OpenCode (workflow defaults → OpenCode runtime). */
export const SYSTEM_TOOL_MAPPINGS: SystemToolMapping[] = [
  { systemToolId: "read_file", opencodeToolId: "read", source: "systemed", description: "Workflow read_file → OpenCode read" },
  { systemToolId: "write_file", opencodeToolId: "write", source: "systemed", description: "Workflow write_file → OpenCode write" },
  { systemToolId: "edit_file", opencodeToolId: "edit", source: "systemed", description: "Workflow edit_file → OpenCode edit" },
  { systemToolId: "latex_patch", opencodeToolId: "patch", source: "systemed", description: "Workflow latex_patch → OpenCode patch" },
  { systemToolId: "artifact_link", opencodeToolId: "read", source: "systemed", description: "Workflow artifact_link → OpenCode read" },
  { systemToolId: "shell_metadata", opencodeToolId: "bash", source: "systemed", description: "Workflow shell_metadata → OpenCode bash" },
  { systemToolId: "glob", opencodeToolId: "glob", source: "systemed" },
  { systemToolId: "list", opencodeToolId: "list", source: "systemed" },
  { systemToolId: "grep", opencodeToolId: "grep", source: "systemed" },
  { systemToolId: "webfetch", opencodeToolId: "webfetch", source: "systemed" },
  { systemToolId: "web_search", opencodeToolId: "webfetch", source: "systemed" },
  { systemToolId: "latex_build", opencodeToolId: "bash", source: "static", description: "LaTeX compile via shell" },
  { systemToolId: "pdf_audit", opencodeToolId: "read", source: "static", description: "PDF layout audit" },
  { systemToolId: "review_json", opencodeToolId: null, source: "static", description: "Structured review JSON output" },
  { systemToolId: "list_dir", opencodeToolId: "list", source: "systemed", description: "workflow-io list_dir → OpenCode list" },
  { systemToolId: "copy_file", opencodeToolId: null, source: "systemed", description: "workflow-io copy_file" },
  { systemToolId: "codex_exec", opencodeToolId: null, source: "static", description: "Codex CLI exec; not an OpenCode builtin" },
  { systemToolId: "copilot_chat", opencodeToolId: null, source: "static", description: "Copilot CLI chat; not an OpenCode builtin" },
]

/** OpenCode vendor builtins (not supplied by workflow system defaults). */
export const OPENCODE_NATIVE_TOOL_MAPPINGS: SystemToolMapping[] = [
  "bash", "read", "write", "edit", "grep", "glob", "list", "webfetch", "websearch",
  "task", "skill", "todowrite", "todoread", "lsp", "patch",
].map((toolId) => ({
  systemToolId: toolId,
  opencodeToolId: toolId,
  source: "opencode-native" as const,
}))

const BASE_TOOL_MAPPINGS: SystemToolMapping[] = [
  ...SYSTEM_TOOL_MAPPINGS,
  ...OPENCODE_NATIVE_TOOL_MAPPINGS,
]

/** Static workflow + OpenCode native mappings (custom tools merged at lookup time). */
export const ALL_TOOL_MAPPINGS: SystemToolMapping[] = BASE_TOOL_MAPPINGS

const mappingBySystemId = new Map(BASE_TOOL_MAPPINGS.map((m) => [m.systemToolId, m]))

export function customMappings(): SystemToolMapping[] {
  return (readLibraryManifest().tools ?? []).map((tool) => ({
    systemToolId: tool.id,
    opencodeToolId: tool.opencodeToolId ?? null,
    source: "custom" as const,
    description: tool.description,
  }))
}

export function allToolMappings(): SystemToolMapping[] {
  const custom = customMappings()
  const customIds = new Set(custom.map((m) => m.systemToolId))
  return [
    ...BASE_TOOL_MAPPINGS.filter((m) => !customIds.has(m.systemToolId)),
    ...custom,
  ]
}

export function lookupSystemToolMapping(systemToolId: string): SystemToolMapping | undefined {
  const custom = customMappings().find((m) => m.systemToolId === systemToolId)
  if (custom) return custom
  return mappingBySystemId.get(systemToolId)
}

export function normalizeSystemToolToOpencode(systemToolId: string): string {
  const mapped = lookupSystemToolMapping(systemToolId)
  if (mapped?.opencodeToolId) return mapped.opencodeToolId
  return systemToolId
}

/** Map runtime-enabled OpenCode tool ids back to display rows (native tools pass through). */
export function resolveToolMappingsForEnabledOpencode(opencodeToolIds: string[]): Array<SystemToolMapping & { enabled: boolean }> {
  const reverseByOpencode = new Map<string, string>()
  for (const m of SYSTEM_TOOL_MAPPINGS) {
    if (m.opencodeToolId && !reverseByOpencode.has(m.opencodeToolId)) {
      reverseByOpencode.set(m.opencodeToolId, m.systemToolId)
    }
  }
  const seen = new Set<string>()
  const out: Array<SystemToolMapping & { enabled: boolean }> = []
  for (const opencodeId of opencodeToolIds) {
    const systemId = reverseByOpencode.get(opencodeId) ?? opencodeId
    const mapping = lookupSystemToolMapping(systemId) ?? lookupSystemToolMapping(opencodeId) ?? {
      systemToolId: systemId,
      opencodeToolId: opencodeId,
      source: "opencode-native" as const,
    }
    const key = `${mapping.systemToolId}:${mapping.opencodeToolId ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...mapping, enabled: true })
  }
  return out
}

export function resolveToolMappingsForList(toolIds: string[]): Array<SystemToolMapping & { enabled: boolean }> {
  const seen = new Set<string>()
  const out: Array<SystemToolMapping & { enabled: boolean }> = []
  for (const id of toolIds) {
    const mapping = lookupSystemToolMapping(id) ?? {
      systemToolId: id,
      opencodeToolId: null,
      source: "static" as const,
    }
    const key = `${mapping.systemToolId}:${mapping.opencodeToolId ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...mapping, enabled: true })
  }
  return out
}

export function toolMappingCatalog() {
  return {
    systemTools: SYSTEM_TOOL_MAPPINGS,
    opencodeNativeTools: OPENCODE_NATIVE_TOOL_MAPPINGS,
    customTools: customMappings(),
    all: allToolMappings(),
  }
}
