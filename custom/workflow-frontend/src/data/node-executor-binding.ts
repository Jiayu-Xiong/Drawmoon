import type { LocalCliInfo } from "../api"
import { startCliInfoRefresh } from "../api/runtime-api"
import type {
  AgentModeTemplate,
  AgentRuntimeMode,
  CliLiveModel,
  CliModelBinding,
  CliProviderTemplate,
  LlmApiTemplate,
  NodeModality,
  WorkflowNode,
  WorkflowTemplate,
} from "./console-model"
import { normalizeBindingIdFields } from "./executor-binding-ids"
import { mergeAgentModeRuntimeDefaults } from "./agent-mode-runtime"
import { isOpencodeCustomCardMode } from "./opencode-custom-registry"
import { DIRECT_API_CLI_ID } from "./cli-templates/direct-api-cli"
import { DIRECT_API_MODE_ID, LEGACY_DIRECT_MODE_IDS } from "./agent-mode-templates/direct-llm-modes"
import { getCliTemplate, listCliTemplates } from "./cli-templates"
import { runtimeModesForNode } from "./cli-cascade"
import { getAgentModeTemplate, getLlmApiTemplate, listAgentModeTemplates } from "./template-registry"
import { listLlmApiTemplates } from "./llm-api-templates"
import { listLlmApiOptionsForNode, resolveCliNodeModel } from "./node-llm-binding"

export type ExecutorModelSource = "llm-api" | "cli-native" | "none"

export interface ExecutorBinding {
  agentModeId: string
  cliTemplateId?: string
  modelSource: ExecutorModelSource
  llmApiTemplateId?: string
  cliModelId?: string
  effectiveModel: string
  runtimeMode: AgentRuntimeMode
  isDirectApi: boolean
  executionMode: WorkflowNode["executionMode"]
}

export interface ModelOptionLlmApi {
  kind: "llm-api"
  id: string
  name: string
  model: string
  api: LlmApiTemplate
}

export interface ModelOptionCli {
  kind: "cli-native"
  id: string
  name: string
  statusLabel?: string
}

export type ModelOption = ModelOptionLlmApi | ModelOptionCli

export interface AgentModeGroup {
  label: string
  modes: AgentModeTemplate[]
}

export function isDirectLlmAgentMode(id?: string | null): boolean {
  if (!id) return false
  if (id === DIRECT_API_MODE_ID) return true
  return (LEGACY_DIRECT_MODE_IDS as readonly string[]).includes(id)
}

export function directLlmModeForModality(_modality: NodeModality): string {
  return DIRECT_API_MODE_ID
}

export function cliModelBinding(cli?: CliProviderTemplate): CliModelBinding {
  return cli?.capabilities.modelBinding ?? "cli-native"
}

export function resolveAgentModeForNode(node: WorkflowNode, template?: WorkflowTemplate): AgentModeTemplate | undefined {
  const id = node.agentModeTemplateId ?? template?.defaultAgentModeTemplateId
  if (id) return getAgentModeTemplate(id)
  if ((node.executionMode ?? "agent-mode") === "llm-api") {
    return getAgentModeTemplate(directLlmModeForModality(node.modality ?? "text"))
  }
  return undefined
}

export function resolveModelSource(node: WorkflowNode, template?: WorkflowTemplate, agentMode?: AgentModeTemplate): ExecutorModelSource {
  const executionMode = node.executionMode ?? "agent-mode"
  if (executionMode === "human-gate" || executionMode === "inquiry" || executionMode === "tool") return "none"
  const mode = agentMode ?? resolveAgentModeForNode(node, template)
  if (executionMode === "llm-api" || isDirectLlmAgentMode(mode?.id)) return "llm-api"
  const cliId = node.cliTemplateId ?? mode?.cliTemplateId
  if (!cliId) return "llm-api"
  return cliModelBinding(getCliTemplate(cliId))
}

export function nodeUsesExternalLlmApi(node: WorkflowNode, template?: WorkflowTemplate): boolean {
  return resolveModelSource(node, template) === "llm-api"
}

export function nodeUsesCliModelPicker(node: WorkflowNode, template?: WorkflowTemplate): boolean {
  return resolveModelSource(node, template) === "cli-native"
}

function liveModelsForCli(cli: CliProviderTemplate, cliInfo?: LocalCliInfo | null): CliLiveModel[] {
  const live = cliInfo?.liveSnapshots?.find((s) => s.cliTemplateId === cli.id || s.providerId === cli.providerId)
  if (live?.models?.length) return live.models
  return cli.models.map((m) => ({
    id: m.id,
    name: m.name,
    statusLabel: m.statusLabel,
    fields: m.fields,
    supportedModes: cli.capabilities.modelCapabilities?.find((c) => c.id === m.id)?.supportedModes,
  }))
}

export function agentModeSupportsModality(mode: AgentModeTemplate, _modality: NodeModality): boolean {
  if (isDirectLlmAgentMode(mode.id)) return true
  const modality = _modality
  if (modality !== "text") {
    const cli = mode.cliTemplateId ? getCliTemplate(mode.cliTemplateId) : undefined
    if (cliModelBinding(cli) === "cli-native") return false
  }
  return true
}

export function listAgentModesForNode(node: WorkflowNode, template?: WorkflowTemplate): AgentModeTemplate[] {
  const modality = node.modality ?? "text"
  const templateModeIds = new Set(template?.agentModeTemplateIds ?? [])
  const directId = DIRECT_API_MODE_ID
  const modes = listAgentModeTemplates().filter((mode) => {
    if (!agentModeSupportsModality(mode, modality)) return false
    if (isDirectLlmAgentMode(mode.id)) return mode.id === directId
    if (templateModeIds.size && !templateModeIds.has(mode.id)) return false
    return true
  })
  if (!modes.some((m) => m.id === directId)) {
    const direct = getAgentModeTemplate(directId)
    if (direct) modes.unshift(direct)
  }
  return modes.sort((a, b) => {
    const aDirect = a.id === DIRECT_API_MODE_ID ? 0 : 1
    const bDirect = b.id === DIRECT_API_MODE_ID ? 0 : 1
    if (aDirect !== bDirect) return aDirect - bDirect
    return a.name.localeCompare(b.name)
  })
}

export function groupAgentModesForNode(node: WorkflowNode, template?: WorkflowTemplate): AgentModeGroup[] {
  const modes = listAgentModesForNode(node, template)
  const groups = new Map<string, AgentModeTemplate[]>()
  for (const mode of modes) {
    const label = isOpencodeCustomCardMode(mode)
      ? "OpenCode · Custom"
      : mode.cliTemplateId
        ? (getCliTemplate(mode.cliTemplateId)?.name ?? mode.provider)
        : mode.provider
    const bucket = groups.get(label) ?? []
    bucket.push(mode)
    groups.set(label, bucket)
  }
  return [...groups.entries()].map(([label, items]) => ({ label, modes: items }))
}

export function listCliModelOptions(cli: CliProviderTemplate, cliInfo?: LocalCliInfo | null): ModelOptionCli[] {
  return liveModelsForCli(cli, cliInfo).map((m) => ({
    kind: "cli-native",
    id: m.id,
    name: m.name,
    statusLabel: m.statusLabel,
  }))
}

export function listTemplateGenModelOptions(
  node: WorkflowNode,
  template?: WorkflowTemplate,
  cliInfo?: LocalCliInfo | null,
): ModelOption[] {
  const options = listModelOptions(node, template, cliInfo)
  return options.filter((option) => {
    if (option.kind === "cli-native") return true
    return (option.api.modalities ?? ["text"]).includes("text")
  })
}

export function listModelOptions(
  node: WorkflowNode,
  template: WorkflowTemplate | undefined,
  cliInfo?: LocalCliInfo | null,
): ModelOption[] {
  const modelSource = resolveModelSource(node, template)
  if (modelSource === "llm-api") {
    return listLlmApiOptionsForNode(node, template, listLlmApiTemplates()).map((api) => ({
      kind: "llm-api" as const,
      id: api.id,
      name: api.name,
      model: api.model,
      api,
    }))
  }
  const agentMode = resolveAgentModeForNode(node, template)
  const cliId = node.cliTemplateId ?? agentMode?.cliTemplateId
  if (modelSource === "cli-native" && cliId) {
    const cli = getCliTemplate(cliId)
    if (cli) return listCliModelOptions(cli, cliInfo)
  }
  return []
}

export function resolveExecutorBinding(
  node: WorkflowNode,
  template?: WorkflowTemplate,
  cliInfo?: LocalCliInfo | null,
): ExecutorBinding {
  const agentMode = resolveAgentModeForNode(node, template)
  const agentModeId = agentMode?.id ?? directLlmModeForModality(node.modality ?? "text")
  const modelSource = resolveModelSource(node, template, agentMode)
  const cliTemplateId = node.cliTemplateId ?? agentMode?.cliTemplateId
  const isDirectApi = isDirectLlmAgentMode(agentModeId)
  const runtimeMode = node.runtimeMode ?? agentMode?.mode ?? "chat"

  if (modelSource === "llm-api") {
    const apiOptions = listLlmApiOptionsForNode(node, template, listLlmApiTemplates())
    const llmApiTemplateId = node.llmApiTemplateId ?? template?.defaultLlmApiTemplateId ?? apiOptions[0]?.id
    const api = apiOptions.find((a) => a.id === llmApiTemplateId) ?? apiOptions[0]
    const effectiveModel = api?.model ?? node.runtimeOverrides?.model?.trim() ?? ""
    return {
      agentModeId,
      cliTemplateId,
      modelSource,
      llmApiTemplateId: api?.id,
      effectiveModel,
      runtimeMode,
      isDirectApi,
      executionMode: isDirectApi || node.executionMode === "llm-api" ? "llm-api" : (node.executionMode ?? "agent-mode"),
    }
  }

  if (modelSource === "cli-native") {
    const cli = cliTemplateId ? getCliTemplate(cliTemplateId) : undefined
    const options = cli ? listCliModelOptions(cli, cliInfo) : []
    const override = node.runtimeOverrides?.model?.trim()
    const cliModelId = override && options.some((o) => o.id === override)
      ? override
      : (options[0]?.id ?? resolveCliNodeModel(node))
    return {
      agentModeId,
      cliTemplateId,
      modelSource,
      cliModelId,
      effectiveModel: cliModelId,
      runtimeMode,
      isDirectApi: false,
      executionMode: node.executionMode === "cli" ? "cli" : "agent-mode",
    }
  }

  return {
    agentModeId,
    cliTemplateId,
    modelSource: "none",
    effectiveModel: "",
    runtimeMode,
    isDirectApi: false,
    executionMode: node.executionMode ?? "agent-mode",
  }
}

export function runtimeModesForBinding(
  node: WorkflowNode,
  template?: WorkflowTemplate,
): AgentRuntimeMode[] {
  const agentMode = resolveAgentModeForNode(node, template)
  const cliId = node.cliTemplateId ?? agentMode?.cliTemplateId
  const cli = cliId ? getCliTemplate(cliId) : undefined
  if (!cli) return ["chat"]
  return runtimeModesForNode(cli, agentMode?.id)
}

export function applyAgentModeChange(
  node: WorkflowNode,
  nextAgentModeId: string,
  template?: WorkflowTemplate,
  cliInfo?: LocalCliInfo | null,
): Partial<WorkflowNode> {
  const mode = getAgentModeTemplate(nextAgentModeId)
  if (!mode) return { agentModeTemplateId: nextAgentModeId }

  const modelSource = isDirectLlmAgentMode(mode.id)
    ? "llm-api"
    : mode.cliTemplateId
      ? cliModelBinding(getCliTemplate(mode.cliTemplateId))
      : "llm-api"

  const patch: Partial<WorkflowNode> = {
    agentModeTemplateId: nextAgentModeId,
    runtimeMode: mode.mode,
    cliTemplateId: mode.cliTemplateId,
    executionMode: isDirectLlmAgentMode(mode.id) ? "llm-api" : "agent-mode",
  }

  const draft: WorkflowNode = { ...node, ...patch }
  const overrides = {
    ...(mergeAgentModeRuntimeDefaults(node, mode) ?? {}),
  }

  if (modelSource === "llm-api") {
    const apis = listLlmApiOptionsForNode(draft, template, listLlmApiTemplates())
    const api = apis.find((a) => a.id === node.llmApiTemplateId) ?? apis[0]
    patch.llmApiTemplateId = api?.id
    if (api?.model) overrides.model = api.model
    else delete overrides.model
  } else {
    patch.llmApiTemplateId = undefined
    const cli = mode.cliTemplateId ? getCliTemplate(mode.cliTemplateId) : undefined
    const options = cli ? listCliModelOptions(cli, cliInfo) : []
    overrides.model = options[0]?.id ?? resolveCliNodeModel(draft)
  }

  patch.runtimeOverrides = Object.keys(overrides).length ? overrides : undefined
  return patch
}

export function applyModelOptionChange(
  node: WorkflowNode,
  option: ModelOption,
): Partial<WorkflowNode> {
  if (option.kind === "llm-api") {
    return {
      llmApiTemplateId: option.id,
      runtimeOverrides: {
        ...(node.runtimeOverrides ?? {}),
        model: option.model,
      },
    }
  }
  return {
    llmApiTemplateId: undefined,
    runtimeOverrides: {
      ...(node.runtimeOverrides ?? {}),
      model: option.id,
    },
  }
}

export function normalizeNodeExecutor(node: WorkflowNode, template?: WorkflowTemplate): WorkflowNode {
  const executionMode = node.executionMode ?? "agent-mode"
  if (executionMode === "human-gate" || executionMode === "inquiry" || executionMode === "tool") return normalizeBindingIdFields(node)

  let next = normalizeBindingIdFields({ ...node })
  if (isDirectLlmAgentMode(next.agentModeTemplateId) && next.agentModeTemplateId !== DIRECT_API_MODE_ID) {
    next = { ...next, agentModeTemplateId: DIRECT_API_MODE_ID, executorId: DIRECT_API_MODE_ID, cliTemplateId: getAgentModeTemplate(DIRECT_API_MODE_ID)?.cliTemplateId }
  }
  if (executionMode === "llm-api" && !isDirectLlmAgentMode(next.agentModeTemplateId)) {
    next = {
      ...next,
      agentModeTemplateId: DIRECT_API_MODE_ID,
      executorId: DIRECT_API_MODE_ID,
      cliTemplateId: DIRECT_API_CLI_ID,
    }
  }
  if (executionMode === "cli" && next.agentModeTemplateId) {
    const mode = getAgentModeTemplate(next.agentModeTemplateId)
    if (mode?.cliTemplateId) next = { ...next, cliTemplateId: mode.cliTemplateId, executionMode: "agent-mode" }
  }
  if (!next.agentModeTemplateId && next.cliTemplateId) {
    const modes = listAgentModeTemplates().filter((m) => m.cliTemplateId === next.cliTemplateId)
    if (modes[0]) next = { ...next, agentModeTemplateId: modes[0].id, executorId: modes[0].id, runtimeMode: modes[0].mode, strategyId: modes[0].mode }
  }
  if (!next.cliTemplateId && next.agentModeTemplateId) {
    const mode = getAgentModeTemplate(next.agentModeTemplateId)
    if (mode?.cliTemplateId) next = { ...next, cliTemplateId: mode.cliTemplateId }
  }

  const binding = resolveExecutorBinding(next, template)
  if (binding.modelSource === "llm-api" && binding.llmApiTemplateId) {
    const api = getLlmApiTemplate(binding.llmApiTemplateId)
    if (api?.model && next.runtimeOverrides?.model !== api.model) {
      next = {
        ...next,
        llmApiTemplateId: binding.llmApiTemplateId,
        runtimeOverrides: { ...next.runtimeOverrides, model: api.model },
      }
    }
  }
  if (binding.modelSource === "cli-native" && binding.cliModelId) {
    const override = next.runtimeOverrides?.model?.trim()
    if (!override || !listModelOptions(next, template).some((o) => o.id === override)) {
      next = {
        ...next,
        llmApiTemplateId: undefined,
        runtimeOverrides: { ...next.runtimeOverrides, model: binding.cliModelId },
      }
    }
  }
  return normalizeBindingIdFields(next)
}

export function normalizeTemplateExecutor(template: WorkflowTemplate): WorkflowTemplate {
  return {
    ...template,
    nodes: template.nodes.map((node) => normalizeNodeExecutor(node, template)),
  }
}

export function cliProviderForAgentMode(agentModeId: string): string | undefined {
  const mode = getAgentModeTemplate(agentModeId)
  if (!mode?.cliTemplateId) return undefined
  return getCliTemplate(mode.cliTemplateId)?.providerId
}

export async function refreshCliForAgentMode(agentModeId: string): Promise<void> {
  const provider = cliProviderForAgentMode(agentModeId)
  if (!provider) return
  const allowed = ["opencode", "kiro", "codex", "copilot"] as const
  if (!allowed.includes(provider as typeof allowed[number])) return
  await startCliInfoRefresh(provider as typeof allowed[number])
}

export function listAllCliTemplates(): CliProviderTemplate[] {
  return listCliTemplates()
}
