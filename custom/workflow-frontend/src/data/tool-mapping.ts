export type ToolSource = "static" | "systemed" | "opencode-native" | "custom"

export interface SystemToolMapping {
  systemToolId: string
  opencodeToolId: string | null
  source: ToolSource
  description?: string
}

export const SYSTEM_TOOL_MAPPINGS: SystemToolMapping[] = [
  { systemToolId: "read_file", opencodeToolId: "read", source: "systemed" },
  { systemToolId: "write_file", opencodeToolId: "write", source: "systemed" },
  { systemToolId: "edit_file", opencodeToolId: "edit", source: "systemed" },
  { systemToolId: "latex_patch", opencodeToolId: "patch", source: "systemed" },
  { systemToolId: "artifact_link", opencodeToolId: "read", source: "systemed" },
  { systemToolId: "shell_metadata", opencodeToolId: "bash", source: "systemed" },
  { systemToolId: "glob", opencodeToolId: "glob", source: "systemed" },
  { systemToolId: "list", opencodeToolId: "list", source: "systemed" },
  { systemToolId: "grep", opencodeToolId: "grep", source: "systemed" },
  { systemToolId: "webfetch", opencodeToolId: "webfetch", source: "systemed" },
  { systemToolId: "web_search", opencodeToolId: "webfetch", source: "systemed" },
  { systemToolId: "latex_build", opencodeToolId: "bash", source: "static" },
  { systemToolId: "pdf_audit", opencodeToolId: "read", source: "static" },
  { systemToolId: "review_json", opencodeToolId: null, source: "static" },
  { systemToolId: "list_dir", opencodeToolId: "list", source: "systemed" },
  { systemToolId: "copy_file", opencodeToolId: null, source: "systemed" },
  { systemToolId: "codex_exec", opencodeToolId: null, source: "static" },
  { systemToolId: "copilot_chat", opencodeToolId: null, source: "static" },
]

const mappingById = new Map(SYSTEM_TOOL_MAPPINGS.map((m) => [m.systemToolId, m]))

export function lookupSystemToolMapping(systemToolId: string): SystemToolMapping | undefined {
  return mappingById.get(systemToolId)
}

export function toolSourceLabel(source: ToolSource): string {
  switch (source) {
    case "systemed": return "systemed"
    case "opencode-native": return "opencode-native"
    case "custom": return "custom"
    default: return "static"
  }
}
