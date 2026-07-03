import { defaultAgentModes } from "./defaults.js"
import { lookupSystemToolMapping } from "../cli-probes/tool-mapping.js"

/** Lightweight agent-mode → tool list for Tools APP (backend mirror of frontend registry). */
export function listBuiltinAgentModeSummaries() {
  return Object.values(defaultAgentModes)
    .map((template) => template.toData())
    .filter((mode) => mode.providerCompatibility.providerIds.includes("opencode"))
    .map((mode) => {
      const tools = mode.constraints.allowedTools?.length
        ? mode.constraints.allowedTools
        : mode.constraints.forcedTools?.length
          ? mode.constraints.forcedTools
          : inferDefaultTools(mode.id)
      return {
        id: mode.id,
        name: mode.name,
        mode: mode.defaultBinding?.cliAlias ?? "build",
        tools: tools.map((toolId) => {
          const mapping = lookupSystemToolMapping(toolId)
          return {
            systemToolId: toolId,
            opencodeToolId: mapping?.opencodeToolId ?? null,
            source: mapping?.source ?? "static",
          }
        }),
      }
    })
}

function inferDefaultTools(id: string): string[] {
  if (id.includes("chat")) return ["read_file", "artifact_link"]
  if (id.includes("plan")) return ["read_file", "write_file", "edit_file", "glob", "list", "grep", "artifact_link"]
  return ["read_file", "write_file", "edit_file", "shell_metadata", "artifact_link"]
}
