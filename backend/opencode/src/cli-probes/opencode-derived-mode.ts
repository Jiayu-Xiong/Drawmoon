import { probeOpenCode } from "./opencode-probe.js"

export interface OpencodeDerivedAgentModeSpec {
  id: string
  name: string
  description: string
  provider: "opencode"
  cliTemplateId: "opencode-cli"
  strategyKind: "cli"
  controlSurface: "customizable"
  origin: "native-cli"
  mode: "chat" | "plan" | "build" | "agent"
  model: string
  contextMode: "inherit" | "fresh"
  defaultSystemPromptFile: string
  defaultSystemPrompt: string
  allowSystemPromptOverride: boolean
  allowedTools: string[]
  outputKinds: Array<"markdown" | "json" | "directory" | "latex" | "pdf" | "image">
  maxIterations: number
  timeoutMs: number
  allowFileWrites: boolean
  editableFields: string[]
  sourceVersion: string | null
  sourcePath: string | null
}

export async function buildOpencodeDerivedAgentMode(mode: OpencodeDerivedAgentModeSpec["mode"] = "build"): Promise<OpencodeDerivedAgentModeSpec> {
  const opencode = await probeOpenCode()
  const defaultModel = "workflow-selected"
  const editable = opencode.liveSnapshot.editableAgentModeFields ?? [
    "defaultSystemPrompt",
    "defaultUserPromptBias",
    "model",
    "contextMode",
    "maxIterations",
    "timeoutMs",
    "allowFileWrites",
  ]

  return {
    id: `opencode-derived-${mode}`,
    name: `OpenCode ${mode} (derived)`,
    description: `Derived from local OpenCode probe: ${opencode.providerInfo?.path ?? opencode.liveSnapshot.path ?? "opencode"} · v${opencode.providerInfo?.version ?? "unknown"}`,
    provider: "opencode",
    cliTemplateId: "opencode-cli",
    strategyKind: "cli",
    controlSurface: "customizable",
    origin: "native-cli",
    mode,
    model: defaultModel,
    contextMode: mode === "chat" ? "fresh" : "inherit",
    defaultSystemPromptFile: `opencode://derived-${mode}`,
    defaultSystemPrompt: mode === "chat"
      ? "Use OpenCode chat mode to answer the workflow node objective directly."
      : "Use OpenCode build mode to execute the workflow node objective and produce the declared artifact.",
    allowSystemPromptOverride: true,
    allowedTools: ["read_file", "write_file", "edit_file", "shell_metadata", "artifact_link"],
    outputKinds: ["markdown", "json", "directory"],
    maxIterations: typeof opencode.providerInfo?.capabilities?.maxIterations === "number"
      ? opencode.providerInfo.capabilities.maxIterations
      : 25,
    timeoutMs: 900_000,
    allowFileWrites: mode !== "chat",
    editableFields: editable,
    sourceVersion: opencode.providerInfo?.version ?? opencode.liveSnapshot.version ?? null,
    sourcePath: opencode.providerInfo?.path ?? opencode.liveSnapshot.path ?? null,
  }
}
