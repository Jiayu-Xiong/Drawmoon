import { probeCopilot } from "../cli-probes/copilot-probe.js"
import { templateProtocolForWire } from "./adapters/registry.js"
import { fetchKuaipaoModels, type KuaipaoModelsResult } from "./kuaipao-models.js"
import { loadApiFileProviderBlocks, loadKuaipaoConfig, type ApiFileProviderBlock, type KuaipaoModelEntry } from "./kuaipao-config.js"
import { formatProviderModelLabel, sanitizeDisplayLabel } from "./display-label.js"
import { inferEndpointForProtocol, inferWireProtocolFromModel } from "./unified/protocol.js"
import { parseOpenAiModelsResponse } from "./openai-models.js"
import type { LlmWireProtocol } from "./unified/types.js"

export interface LlmApiTemplateSpec {
  id: string
  name: string
  description: string
  provider: string
  endpoint: string
  protocol: "openai-compatible" | "messages" | "responses" | "custom-http"
  wireProtocol: LlmWireProtocol
  model: string
  contextWindow: number
  temperature?: number
  maxOutputTokens?: number
  responseFormat: "markdown" | "json" | "text"
  allowSystemPromptOverride: boolean
  allowUserPromptBias: boolean
  apiKeyEnv: string
  timeoutMs: number
  source: "kuaipao-api" | "api-file-fallback" | "kuaipao-default"
  copilotModelName?: string
  copilotProvider?: string
}

export interface CopilotApiGroup {
  id: string
  provider: "kuaipao" | "deepseek" | "custom"
  apiKeyEnv: string
  modelsEndpoint: string
  openaiBaseUrl: string
  chatCompletionsUrl?: string
  available: boolean
  keyConfigured?: boolean
  liveModelCount?: number
  error?: string
  models: KuaipaoModelEntry[]
}

export interface CopilotBindResult {
  available: boolean
  copilotCommand: string
  providerSummary: string
  modelsEndpoint?: string
  modelsError?: string
  apiGroups?: CopilotApiGroup[]
  kuaipao: ReturnType<typeof loadKuaipaoConfig>
  models: Array<{
    id: string
    name: string
    status: string
    contextWindow?: number
    wireProtocol?: string
    ownedBy?: string
    endpointTypes?: string[]
    fields: Record<string, string>
  }>
  discovery?: KuaipaoModelsResult
  templates: LlmApiTemplateSpec[]
  agentModeSpec?: {
    id: string
    name: string
    description: string
    mode: "chat"
    model: string
    derivedFromLlmApiTemplateId?: string
    defaultSystemPrompt: string
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "model"
}

function templateFromModel(
  model: KuaipaoModelEntry,
  block: Pick<ApiFileProviderBlock, "openaiBaseUrl" | "anthropicBaseUrl" | "chatCompletionsUrl" | "apiKeyEnv">,
  source: LlmApiTemplateSpec["source"],
  isPrimary: boolean,
  groupId?: string,
): LlmApiTemplateSpec {
  const wireProtocol = model.wireProtocol ?? inferWireProtocolFromModel(model.id)
  const endpoint = inferEndpointForProtocol(wireProtocol, {
    openaiBaseUrl: block.openaiBaseUrl,
    anthropicBaseUrl: block.anthropicBaseUrl ?? block.openaiBaseUrl.replace(/\/v1\/?$/, ""),
    chatCompletionsUrl: block.chatCompletionsUrl ?? `${block.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`,
  })
  const protocol = templateProtocolForWire(wireProtocol) as LlmApiTemplateSpec["protocol"]
  return {
    id: isPrimary && groupId === "kuaipao-1" ? "kuaipao-openai-chat" : `${groupId ?? "kuaipao"}-${slugify(model.id)}`,
    name: formatProviderModelLabel("Kuaipao", model.name),
    description: `Discovered from ${block.openaiBaseUrl}/models (${wireProtocol}).`,
    provider: wireProtocol === "anthropic-messages" ? "anthropic" : "custom",
    endpoint,
    protocol,
    wireProtocol,
    model: model.id,
    contextWindow: model.contextWindow ?? 0,
    temperature: 0.7,
    maxOutputTokens: 8192,
    responseFormat: "markdown",
    allowSystemPromptOverride: true,
    allowUserPromptBias: false,
    apiKeyEnv: block.apiKeyEnv,
    timeoutMs: 300_000,
    source,
  }
}

function modelFields(model: KuaipaoModelEntry): Record<string, string> {
  return Object.fromEntries(
    Object.entries(model.raw ?? {}).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
  )
}

function mergeModels(...groups: Array<KuaipaoModelEntry[] | undefined>) {
  const merged = new Map<string, KuaipaoModelEntry>()
  for (const group of groups) {
    for (const model of group ?? []) {
      const existing = merged.get(model.id)
      merged.set(model.id, {
        ...existing,
        ...model,
        contextWindow: model.contextWindow ?? existing?.contextWindow,
        wireProtocol: model.wireProtocol ?? existing?.wireProtocol,
        raw: existing?.raw ?? model.raw,
      })
    }
  }
  return [...merged.values()]
}

async function fetchOpenAiModels(block: ApiFileProviderBlock): Promise<{
  models: KuaipaoModelEntry[]
  liveModelCount: number
  fetchError?: string
}> {
  const endpoint = `${block.openaiBaseUrl.replace(/\/$/, "")}/models`
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${block.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      return {
        models: block.models,
        liveModelCount: 0,
        fetchError: `HTTP ${response.status}`,
      }
    }
    const body = await response.json().catch(() => null) as { data?: Array<Record<string, unknown>> } | null
    const fromApi = parseOpenAiModelsResponse(body, { provider: block.provider })
    return {
      models: mergeModels(fromApi, block.models),
      liveModelCount: fromApi.length,
    }
  } catch (error) {
    return {
      models: block.models,
      liveModelCount: 0,
      fetchError: error instanceof Error ? error.message : String(error),
    }
  }
}

async function buildApiGroups(providerBlocks: ApiFileProviderBlock[], kuaipao: ReturnType<typeof loadKuaipaoConfig>): Promise<CopilotApiGroup[]> {
  if (providerBlocks.length) {
    return Promise.all(providerBlocks.map(async (block) => {
      const fetched = await fetchOpenAiModels(block)
      const modelsEndpoint = `${block.openaiBaseUrl.replace(/\/$/, "")}/models`
      return {
        id: block.id,
        provider: block.provider,
        apiKeyEnv: block.apiKeyEnv,
        modelsEndpoint,
        openaiBaseUrl: block.openaiBaseUrl,
        chatCompletionsUrl: block.chatCompletionsUrl,
        available: fetched.models.length > 0,
        keyConfigured: Boolean(block.apiKey?.trim()),
        liveModelCount: fetched.liveModelCount,
        error: fetched.fetchError ?? (fetched.models.length ? undefined : `No models from ${modelsEndpoint}`),
        models: fetched.models,
      }
    }))
  }

  const remote = await fetchKuaipaoModels()
  const models = remote.models.length ? remote.models : kuaipao.models
  return [{
    id: "kuaipao-1",
    provider: "kuaipao",
    apiKeyEnv: kuaipao.apiKeyEnv,
    modelsEndpoint: remote.endpoint,
    openaiBaseUrl: kuaipao.openaiBaseUrl,
    chatCompletionsUrl: kuaipao.chatCompletionsUrl,
    available: remote.available || models.length > 0,
    keyConfigured: remote.keyConfigured,
    liveModelCount: remote.rawCount,
    error: remote.error,
    models,
  }]
}

export async function buildCopilotKuaipaoBind(): Promise<CopilotBindResult> {
  const copilot = probeCopilot()
  const kuaipao = loadKuaipaoConfig()
  const providerBlocks = loadApiFileProviderBlocks()
  const apiGroups = await buildApiGroups(providerBlocks, kuaipao)
  const remote = await fetchKuaipaoModels()

  const templates: LlmApiTemplateSpec[] = []
  let globalPrimaryAssigned = false
  for (const group of apiGroups) {
    for (const model of group.models) {
      const isPrimary = group.provider === "kuaipao" && !globalPrimaryAssigned
      if (isPrimary) globalPrimaryAssigned = true
      if (group.provider === "deepseek") {
        templates.push({
          id: `${group.id}-${slugify(model.id)}`,
          name: `DeepSeek ${model.name}`,
          description: `Discovered from ${group.openaiBaseUrl}/models.`,
          provider: "custom",
          endpoint: group.openaiBaseUrl,
          protocol: "openai-compatible",
          wireProtocol: model.wireProtocol ?? "deepseek-chat",
          model: model.id,
          contextWindow: model.contextWindow ?? 0,
          temperature: 0.7,
          maxOutputTokens: 8192,
          responseFormat: "markdown",
          allowSystemPromptOverride: true,
          allowUserPromptBias: false,
          apiKeyEnv: group.apiKeyEnv,
          timeoutMs: 300_000,
          source: "kuaipao-api",
        })
      } else {
        templates.push(templateFromModel(model, {
          openaiBaseUrl: group.openaiBaseUrl,
          anthropicBaseUrl: kuaipao.anthropicBaseUrl,
          chatCompletionsUrl: group.chatCompletionsUrl,
          apiKeyEnv: group.apiKeyEnv,
        }, (group.liveModelCount ?? 0) > 0 ? "kuaipao-api" : "api-file-fallback", isPrimary, group.id))
      }
    }
  }

  if (!templates.length) {
    templates.push({
      id: "kuaipao-openai-chat",
      name: "Kuaipao OpenAI",
      description: remote.error
        ? `Could not load models from ${remote.endpoint}: ${remote.error}`
        : `No models returned from ${remote.endpoint}. Check api file key and base URL.`,
      provider: "custom",
      endpoint: kuaipao.openaiBaseUrl,
      protocol: "openai-compatible",
      wireProtocol: "openai-chat",
      model: "",
      contextWindow: 0,
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseFormat: "markdown",
      allowSystemPromptOverride: true,
      allowUserPromptBias: false,
      apiKeyEnv: kuaipao.apiKeyEnv,
      timeoutMs: 300_000,
      source: "kuaipao-default",
    })
  }

  const models = apiGroups.flatMap((group) => group.models.map((model) => ({
    id: `${group.id}::${model.id}`,
    name: model.name,
    status: group.available ? "available" : "unavailable",
    contextWindow: model.contextWindow,
    wireProtocol: model.wireProtocol,
    ownedBy: model.ownedBy,
    endpointTypes: model.endpointTypes,
    fields: {
      ...modelFields(model),
      modelId: model.id,
      endpoint: group.openaiBaseUrl,
      apiKeyEnv: group.apiKeyEnv,
      apiGroupId: group.id,
      modelsEndpoint: group.modelsEndpoint,
      provider: group.provider,
    },
  })))

  const primary = templates[0]!
  return sanitizeCopilotBindResult({
    available: apiGroups.some((group) => group.available) || kuaipao.hasKeyFile,
    copilotCommand: copilot.command,
    providerSummary: `${apiGroups.length} API group(s) · ${models.length} model(s)`,
    modelsEndpoint: apiGroups[0]?.modelsEndpoint ?? remote.endpoint,
    modelsError: apiGroups.every((group) => !group.available) ? apiGroups[0]?.error ?? remote.error : undefined,
    apiGroups,
    kuaipao,
    models,
    discovery: remote,
    templates,
    agentModeSpec: primary.model
      ? {
          id: "opencode-chat-kuaipao",
          name: "OpenCode Chat",
          description: "OpenCode chat strategy; workflow nodes bind the LLM API and model at runtime.",
          mode: "chat",
          model: "workflow-selected",
          defaultSystemPrompt: "Follow the workflow node objective and output the declared artifact.",
        }
      : undefined,
  })
}

export function sanitizeCopilotBindResult(bind: CopilotBindResult): CopilotBindResult {
  return {
    ...bind,
    apiGroups: bind.apiGroups?.map((group) => ({
      ...group,
      models: group.models.map((model) => ({
        ...model,
        name: sanitizeDisplayLabel(model.name),
      })),
    })),
    models: bind.models.map((model) => ({
      ...model,
      name: sanitizeDisplayLabel(model.name),
    })),
    templates: bind.templates.map((template) => ({
      ...template,
      name: sanitizeDisplayLabel(template.name),
    })),
    agentModeSpec: bind.agentModeSpec
      ? { ...bind.agentModeSpec, name: sanitizeDisplayLabel(bind.agentModeSpec.name) }
      : undefined,
  }
}

/** @deprecated Use buildCopilotKuaipaoBind - kept for sync callers during migration */
export function buildCopilotKuaipaoBindSync(): CopilotBindResult {
  const kuaipao = loadKuaipaoConfig()
  const catalog = kuaipao.models
  const templates = catalog.map((model, index) => templateFromModel(model, {
    openaiBaseUrl: kuaipao.openaiBaseUrl,
    anthropicBaseUrl: kuaipao.anthropicBaseUrl,
    chatCompletionsUrl: kuaipao.chatCompletionsUrl,
    apiKeyEnv: kuaipao.apiKeyEnv,
  }, "api-file-fallback", index === 0, "kuaipao-1"))
  if (!templates.length) {
    templates.push({
      id: "kuaipao-openai-chat",
      name: "Kuaipao OpenAI",
      description: "Start runtime to fetch models from kuaipao /v1/models.",
      provider: "custom",
      endpoint: kuaipao.openaiBaseUrl,
      protocol: "openai-compatible",
      wireProtocol: "openai-chat",
      model: "",
      contextWindow: 0,
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseFormat: "markdown",
      allowSystemPromptOverride: true,
      allowUserPromptBias: false,
      apiKeyEnv: kuaipao.apiKeyEnv,
      timeoutMs: 300_000,
      source: "kuaipao-default",
    })
  }
  const primary = templates[0]!
  return sanitizeCopilotBindResult({
    available: kuaipao.hasKeyFile,
    copilotCommand: "",
    providerSummary: "sync fallback - use async bind for live models",
    kuaipao,
    models: catalog.map((m) => ({ id: m.id, name: m.name, status: "configured", contextWindow: m.contextWindow, fields: {} })),
    templates,
    agentModeSpec: primary.model
      ? {
          id: "opencode-chat-kuaipao",
          name: "OpenCode Chat",
          description: "OpenCode chat strategy; workflow nodes bind the LLM API and model at runtime.",
          mode: "chat",
          model: "workflow-selected",
          defaultSystemPrompt: "Follow the workflow node objective and output the declared artifact.",
        }
      : undefined,
  })
}
