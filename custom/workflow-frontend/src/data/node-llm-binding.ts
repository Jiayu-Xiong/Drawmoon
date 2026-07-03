import type { LlmApiTemplate, WorkflowNode, WorkflowTemplate } from "./console-model"
import { DIRECT_API_MODE_ID, LEGACY_DIRECT_MODE_IDS } from "./agent-mode-templates/direct-llm-modes"
import { getCliTemplate } from "./cli-templates"
import { getAgentModeTemplate, getLlmApiTemplate, listLlmApiTemplates } from "./template-registry"
import {
  nodeUsesCliModelPicker as executorUsesCliModelPicker,
  nodeUsesExternalLlmApi as executorUsesExternalLlmApi,
  normalizeTemplateExecutor,
} from "./node-executor-binding"

export interface NodeLlmBinding {
  api?: LlmApiTemplate
  llmApiTemplateId?: string
  modelOverride?: string
  effectiveModel: string
  mismatch: boolean
  usesExternalLlm: boolean
}

type TemplateLlmScope = Pick<WorkflowTemplate, "llmApiTemplateIds" | "defaultLlmApiTemplateId">

function scopedApis(apis: LlmApiTemplate[], template?: TemplateLlmScope) {
  const ids = template?.llmApiTemplateIds
  if (!ids?.length) return apis
  const scoped = apis.filter((api) => ids.includes(api.id))
  return scoped.length ? scoped : apis
}

export function nodeUsesExternalLlmApi(node: WorkflowNode, template?: Pick<WorkflowTemplate, "llmApiTemplateIds" | "defaultLlmApiTemplateId">): boolean {
  return executorUsesExternalLlmApi(node, template)
}

export function nodeUsesCliModelPicker(node: WorkflowNode, template?: Pick<WorkflowTemplate, "llmApiTemplateIds" | "defaultLlmApiTemplateId">): boolean {
  return executorUsesCliModelPicker(node, template)
}

export function findLlmApiTemplateForModel(
  model: string,
  apis: LlmApiTemplate[],
  options?: { preferredIds?: string[]; defaultApiId?: string; currentApiId?: string },
): LlmApiTemplate | undefined {
  const normalized = model.trim().toLowerCase()
  if (!normalized) return undefined

  const scope = options?.preferredIds?.length
    ? apis.filter((api) => options.preferredIds!.includes(api.id))
    : apis
  const matches = scope.filter((api) => api.model?.toLowerCase() === normalized)
  if (!matches.length) return undefined

  if (options?.currentApiId) {
    const current = matches.find((api) => api.id === options.currentApiId)
    if (current) return current
  }
  if (options?.defaultApiId) {
    const preferred = matches.find((api) => api.id === options.defaultApiId)
    if (preferred) return preferred
  }
  if (/deepseek/i.test(normalized)) {
    const deepseek = matches.find((api) => api.id.startsWith("deepseek-"))
    if (deepseek) return deepseek
  }
  return matches[0]
}

function stripExternalLlmFields(node: WorkflowNode): WorkflowNode {
  if (!node.llmApiTemplateId) return node
  return { ...node, llmApiTemplateId: undefined }
}

export function resolveCliNodeModel(node: WorkflowNode): string {
  const agentMode = node.agentModeTemplateId ? getAgentModeTemplate(node.agentModeTemplateId) : undefined
  const cli = node.cliTemplateId
    ? getCliTemplate(node.cliTemplateId)
    : agentMode?.cliTemplateId
      ? getCliTemplate(agentMode.cliTemplateId)
      : undefined
  const override = node.runtimeOverrides?.model?.trim()
  if (override && !override.startsWith("kiro/")) return override
  const fromAgent = agentMode?.model?.trim()
  if (fromAgent && !fromAgent.startsWith("kiro/")) return fromAgent
  return cli?.models?.find((entry) => entry.statusLabel === "active")?.id
    ?? cli?.models?.[0]?.id
    ?? fromAgent
    ?? "cli-native"
}

export function resolveNodeLlmBinding(node: WorkflowNode, template?: TemplateLlmScope): NodeLlmBinding {
  if (!nodeUsesExternalLlmApi(node, template)) {
    return {
      api: undefined,
      llmApiTemplateId: undefined,
      modelOverride: node.runtimeOverrides?.model?.trim(),
      effectiveModel: resolveCliNodeModel(node),
      mismatch: false,
      usesExternalLlm: false,
    }
  }

  const api = node.llmApiTemplateId ? getLlmApiTemplate(node.llmApiTemplateId) : undefined
  const modelOverride = node.runtimeOverrides?.model?.trim()
  const effectiveModel = api?.model ?? modelOverride ?? ""
  const mismatch = Boolean(modelOverride && api?.model && modelOverride !== api.model)
  return {
    api,
    llmApiTemplateId: node.llmApiTemplateId,
    modelOverride,
    effectiveModel,
    mismatch,
    usesExternalLlm: true,
  }
}

export function normalizeNodeLlmBinding(node: WorkflowNode, template?: TemplateLlmScope): WorkflowNode {
  if (!nodeUsesExternalLlmApi(node, template)) return stripExternalLlmFields(node)

  const apis = scopedApis(listLlmApiTemplates(), template)
  const options = {
    preferredIds: template?.llmApiTemplateIds,
    defaultApiId: template?.defaultLlmApiTemplateId,
    currentApiId: node.llmApiTemplateId,
  }
  const currentApi = node.llmApiTemplateId ? getLlmApiTemplate(node.llmApiTemplateId) : undefined
  const modelOverride = node.runtimeOverrides?.model?.trim()

  // Bound API template wins over stale model overrides (dropdown is authoritative).
  if (currentApi?.model) {
    if (modelOverride !== currentApi.model) {
      return {
        ...node,
        llmApiTemplateId: currentApi.id,
        runtimeOverrides: { ...node.runtimeOverrides, model: currentApi.model },
      }
    }
    return node
  }

  // Legacy nodes: model override without a resolvable API binding.
  if (modelOverride) {
    const match = findLlmApiTemplateForModel(modelOverride, apis, options)
    if (match) {
      return {
        ...node,
        llmApiTemplateId: match.id,
        runtimeOverrides: { ...node.runtimeOverrides, model: modelOverride },
      }
    }
  }

  if (template?.defaultLlmApiTemplateId) {
    const fallback = getLlmApiTemplate(template.defaultLlmApiTemplateId)
    if (fallback?.model) {
      return {
        ...node,
        llmApiTemplateId: fallback.id,
        runtimeOverrides: { ...node.runtimeOverrides, model: fallback.model },
      }
    }
  }

  return node
}

export function normalizeTemplateLlmBindings(template: WorkflowTemplate): WorkflowTemplate {
  return normalizeTemplateExecutor({
    ...template,
    nodes: template.nodes.map((node) => normalizeNodeLlmBinding(node, template)),
  })
}

export function resolvedLlmApiTemplateId(node: WorkflowNode, template?: TemplateLlmScope): string | undefined {
  if (!nodeUsesExternalLlmApi(node)) return undefined
  if (node.llmApiTemplateId && getLlmApiTemplate(node.llmApiTemplateId)) return node.llmApiTemplateId
  return template?.defaultLlmApiTemplateId
}

export function listLlmApiOptionsForNode(
  node: WorkflowNode | undefined,
  template: WorkflowTemplate | undefined,
  apis: LlmApiTemplate[],
): LlmApiTemplate[] {
  if (!node || !nodeUsesExternalLlmApi(node, template)) return []

  const modality = node.modality ?? "text"
  const byModality = apis.filter((api) => (api.modalities ?? ["text"]).includes(modality))
  const directApi = node.agentModeTemplateId === DIRECT_API_MODE_ID
    || (LEGACY_DIRECT_MODE_IDS as readonly string[]).includes(node.agentModeTemplateId ?? "")
  const ids = new Set(directApi ? [] : (template?.llmApiTemplateIds ?? []))
  if (node.llmApiTemplateId) ids.add(node.llmApiTemplateId)
  if (template?.defaultLlmApiTemplateId) ids.add(template.defaultLlmApiTemplateId)

  const agentMode = node.agentModeTemplateId ? getAgentModeTemplate(node.agentModeTemplateId) : undefined
  const cliId = node.cliTemplateId ?? agentMode?.cliTemplateId
  const cli = cliId ? getCliTemplate(cliId) : undefined
  const cliAllow = cli?.llmApiTemplateIds?.length ? new Set(cli.llmApiTemplateIds) : null

  const picked = new Map<string, LlmApiTemplate>()
  for (const api of byModality) {
    if (cliAllow && !cliAllow.has(api.id)) continue
    if (!directApi && ids.size && !ids.has(api.id)) continue
    picked.set(api.id, api)
  }
  for (const id of ids) {
    const api = getLlmApiTemplate(id)
    if (api && (api.modalities ?? ["text"]).includes(modality) && !picked.has(api.id)) {
      picked.set(api.id, api)
    }
  }
  const list = [...picked.values()]
  return list.length ? list.sort((a, b) => a.name.localeCompare(b.name)) : byModality
}

export function syncNodeModelOverride(
  node: WorkflowNode,
  model: string,
  template?: TemplateLlmScope,
): Pick<WorkflowNode, "llmApiTemplateId" | "runtimeOverrides"> {
  if (!nodeUsesExternalLlmApi(node)) {
    const overrides = { ...(node.runtimeOverrides ?? {}) }
    delete overrides.model
    return { llmApiTemplateId: undefined, runtimeOverrides: overrides }
  }
  const apis = scopedApis(listLlmApiTemplates(), template)
  const match = findLlmApiTemplateForModel(model, apis, {
    preferredIds: template?.llmApiTemplateIds,
    defaultApiId: template?.defaultLlmApiTemplateId,
    currentApiId: node.llmApiTemplateId,
  })
  return {
    llmApiTemplateId: match?.id ?? node.llmApiTemplateId,
    runtimeOverrides: {
      ...(node.runtimeOverrides ?? {}),
      model,
    },
  }
}
