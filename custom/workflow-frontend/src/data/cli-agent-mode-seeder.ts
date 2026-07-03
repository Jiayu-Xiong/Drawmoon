import type { CliProviderTemplate } from "./console-model"
import { PlainAgentModeTemplate, registerAgentModeTemplate, getAgentModeTemplate } from "./template-registry"
import type { AgentModeTemplateData } from "./template-registry/agent-mode-template"

export function seedAgentModesForCli(cli: CliProviderTemplate): void {
  const { capabilities, providerId, id: cliTemplateId } = cli
  const defaultModeId = `${cliTemplateId}-default`

  if (getAgentModeTemplate(defaultModeId)) return

  if (capabilities.controlSurface === "cli-owned") {
    return
  }

  const baseMode = capabilities.supportedModes[0] ?? "chat"
  const editableFields = capabilities.editableAgentModeFields ?? []

  const fieldPolicy: AgentModeTemplateData["fieldPolicy"] = {}
  for (const field of [
    "model", "contextMode", "maxIterations", "timeoutMs", "allowFileWrites",
    "defaultSystemPrompt", "defaultUserPromptBias", "allowSystemPromptOverride",
  ] as const) {
    fieldPolicy[field] = editableFields.includes(field) ? "editable" : "readonly"
  }

  registerAgentModeTemplate(new PlainAgentModeTemplate({
    id: defaultModeId,
    name: `${cli.name} Default`,
    description: `Default customizable agent mode for ${cli.name}.`,
    provider: providerId,
    cliTemplateId,
    strategyKind: "cli",
    controlSurface: "customizable",
    origin: "native-cli",
    mode: baseMode === "agent" ? "build" : baseMode as AgentModeTemplateData["mode"],
    model: cli.models[0]?.id ?? `${providerId}/configured`,
    contextMode: "inherit",
    defaultSystemPromptFile: `${providerId}://default`,
    defaultSystemPrompt: "",
    allowSystemPromptOverride: editableFields.includes("defaultSystemPrompt"),
    allowedTools: [],
    outputKinds: ["markdown"],
    maxIterations: 25,
    timeoutMs: 600_000,
    allowFileWrites: editableFields.includes("allowFileWrites"),
    cacheFiles: [],
    contextFiles: [],
    retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
    fieldPolicy,
  }))
}

export function seedAgentModesOnCliImport(cli: CliProviderTemplate): void {
  seedAgentModesForCli(cli)
}
