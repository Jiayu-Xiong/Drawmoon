import type { AgentRuntimeMode, CliProviderTemplate, WorkflowNode } from "./console-model"
import { getAgentModeTemplate, getAgentModeTemplateInstance, listAgentModeTemplates } from "./template-registry"
import { cliTemplateByProvider, getCliTemplate } from "./cli-templates"
import { agentModeFieldPolicy, type AgentModeStrategyField } from "./templates/agent-mode-template"

export const RUNTIME_AGENT_MODE_IDS: Record<string, string> = {
  "opencode-default-agent": "opencode-default-agent",
  "opencode-chat": "opencode-chat",
  "opencode-plan": "opencode-plan",
  "opencode-build": "opencode-build",
  "opencode-chat-kuaipao": "opencode-chat-kuaipao",
  "custom-io-planner": "custom-io-planner",
  "codex-cli-build": "codex-default-build",
  "copilot-cli-chat": "copilot-default-agent",
  "claude-code-build": "claude-code-default",
  "kiro-cli-metadata": "kiro-cli-metadata",
  "kiro-cli-plan": "kiro-cli-plan",
  "kiro-cli-agent": "kiro-cli-agent",
  "kiro-cli-chat": "kiro-cli-chat",
  "kiro-cli-review": "kiro-cli-review",
}

export function runtimeAgentModeId(templateId?: string | null): string | undefined {
  if (!templateId) return undefined
  return RUNTIME_AGENT_MODE_IDS[templateId] ?? templateId
}

export function resolveNodeCliTemplate(node: WorkflowNode): CliProviderTemplate | undefined {
  if (node.cliTemplateId) return getCliTemplate(node.cliTemplateId)
  const mode = node.agentModeTemplateId ? getAgentModeTemplate(node.agentModeTemplateId) : undefined
  if (mode?.cliTemplateId) return getCliTemplate(mode.cliTemplateId)
  const cmd = node.runtimeOverrides?.customCommand
  if (cmd === "kiro-cli" || cmd === "kiro") return cliTemplateByProvider("kiro")
  if (cmd === "codex") return cliTemplateByProvider("codex")
  if (cmd === "opencode") return cliTemplateByProvider("opencode")
  if (cmd === "claude" || cmd === "claude-code") return getCliTemplate("claude-code-cli")
  if (cmd?.includes("copilot")) return cliTemplateByProvider("copilot")
  if (mode?.provider) return cliTemplateByProvider(mode.provider)
  return undefined
}

export function agentModesForCli(cliTemplateId: string) {
  return listAgentModeTemplates().filter((mode) => mode.cliTemplateId === cliTemplateId)
}

export function modelsForCli(cli: CliProviderTemplate) {
  return cli.models
}

export function runtimeModesForNode(cli: CliProviderTemplate, agentModeTemplateId?: string): AgentRuntimeMode[] {
  const mode = getAgentModeTemplate(agentModeTemplateId)
  const modelCap = cli.capabilities.modelCapabilities?.find((entry) => entry.id === mode?.model)
  if (modelCap?.supportedModes?.length) return modelCap.supportedModes
  return cli.capabilities.supportedModes
}

export function isFieldEditable(agentModeTemplateId?: string, field?: AgentModeStrategyField): boolean {
  if (!field) return true
  const instance = getAgentModeTemplateInstance(agentModeTemplateId)
  if (!instance) return true
  const policy = agentModeFieldPolicy(instance.toData(), field)
  return policy === "editable" || policy === "inherited"
}
