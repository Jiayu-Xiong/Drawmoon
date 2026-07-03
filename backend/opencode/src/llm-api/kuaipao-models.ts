import { loadKuaipaoConfig, resolveKuaipaoApiKey, resolveSecondApiKey, type KuaipaoModelEntry } from "./kuaipao-config.js"
import { parseOpenAiModelEntry, parseOpenAiModelsResponse } from "./openai-models.js"

export interface KuaipaoRemoteModel {
  id: string
  object?: string
  created?: number
  owned_by?: string
  context_window?: number
  max_context_tokens?: number
  supported_endpoint_types?: string[]
  [key: string]: unknown
}

export interface KuaipaoModelsResult {
  available: boolean
  endpoint: string
  error?: string
  models: KuaipaoModelEntry[]
  rawModels: KuaipaoRemoteModel[]
  rawCount: number
  keyConfigured: boolean
  configPath: string | null
  openaiBaseUrl: string
}

function normalizeRemoteModel(model: KuaipaoRemoteModel): KuaipaoModelEntry | null {
  return parseOpenAiModelEntry(model as Record<string, unknown>)
}

export async function fetchKuaipaoModels(): Promise<KuaipaoModelsResult> {
  const config = loadKuaipaoConfig()
  const base = config.openaiBaseUrl.replace(/\/$/, "")
  const endpoint = `${base}/models`
  const apiKey = resolveKuaipaoApiKey(config)

  if (!apiKey) {
    return {
      available: false,
      endpoint,
      error: `API key missing. Add sk-... to ${config.configPath ?? "api file"} or set ${config.apiKeyEnv}.`,
      models: config.models,
      rawModels: [],
      rawCount: 0,
      keyConfigured: false,
      configPath: config.configPath,
      openaiBaseUrl: config.openaiBaseUrl,
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    })

    const body = await response.json().catch(() => null) as { data?: KuaipaoRemoteModel[]; error?: { message?: string } } | null
    if (!response.ok) {
      return {
        available: false,
        endpoint,
        error: body?.error?.message ?? `HTTP ${response.status}`,
        models: config.models.length ? config.models : [],
        rawModels: [],
        rawCount: 0,
        keyConfigured: true,
        configPath: config.configPath,
        openaiBaseUrl: config.openaiBaseUrl,
      }
    }

    const remote = Array.isArray(body?.data) ? body.data : []
    const fromApi = remote.map(normalizeRemoteModel).filter((model): model is KuaipaoModelEntry => Boolean(model))

    const merged = new Map<string, KuaipaoModelEntry>()
    for (const model of fromApi) merged.set(model.id, model)
    for (const model of config.models) {
      const existing = merged.get(model.id)
      merged.set(model.id, {
        ...existing,
        ...model,
        contextWindow: model.contextWindow ?? existing?.contextWindow,
        wireProtocol: model.wireProtocol ?? existing?.wireProtocol,
        raw: existing?.raw ?? model.raw,
      })
    }

    return {
      available: merged.size > 0,
      endpoint,
      models: [...merged.values()],
      rawModels: remote,
      rawCount: remote.length,
      keyConfigured: true,
      configPath: config.configPath,
      openaiBaseUrl: config.openaiBaseUrl,
    }
  } catch (error) {
    return {
      available: false,
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      models: config.models.length ? config.models : [],
      rawModels: [],
      rawCount: 0,
      keyConfigured: true,
      configPath: config.configPath,
      openaiBaseUrl: config.openaiBaseUrl,
    }
  }
}

/** Fetch models using the second api key (CDK) */
export async function fetchCdkModels(): Promise<KuaipaoModelsResult> {
  const config = loadKuaipaoConfig()
  const base = config.openaiBaseUrl.replace(/\/$/, "")
  const endpoint = `${base}/models`
  const apiKey = resolveSecondApiKey()

  if (!apiKey) {
    return {
      available: false,
      endpoint,
      error: "No second api key (CDK) found in api file.",
      models: [],
      rawModels: [],
      rawCount: 0,
      keyConfigured: false,
      configPath: config.configPath,
      openaiBaseUrl: config.openaiBaseUrl,
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })

    const body = await response.json().catch(() => null) as { data?: KuaipaoRemoteModel[]; error?: { message?: string } } | null
    if (!response.ok) {
      return {
        available: false,
        endpoint,
        error: body?.error?.message ?? `HTTP ${response.status}`,
        models: [],
        rawModels: [],
        rawCount: 0,
        keyConfigured: true,
        configPath: config.configPath,
        openaiBaseUrl: config.openaiBaseUrl,
      }
    }

    const remote = Array.isArray(body?.data) ? body.data : []
    const models = remote.map(normalizeRemoteModel).filter((model): model is KuaipaoModelEntry => Boolean(model))

    return {
      available: models.length > 0,
      endpoint,
      models,
      rawModels: remote as KuaipaoRemoteModel[],
      rawCount: remote.length,
      keyConfigured: true,
      configPath: config.configPath,
      openaiBaseUrl: config.openaiBaseUrl,
    }
  } catch (error) {
    return {
      available: false,
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      models: [],
      rawModels: [],
      rawCount: 0,
      keyConfigured: true,
      configPath: config.configPath,
      openaiBaseUrl: config.openaiBaseUrl,
    }
  }
}
