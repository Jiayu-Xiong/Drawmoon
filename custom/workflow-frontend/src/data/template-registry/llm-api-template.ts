import type { LlmApiTemplate, NodeModality, ResponseFormat, RetryPolicy } from "../console-model"
import { createTemplateRegistry, isRecord, requireString } from "./registry"

export abstract class LlmApiTemplateBase {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly provider: LlmApiTemplate["provider"]
  readonly endpoint: string
  readonly protocol: LlmApiTemplate["protocol"]
  readonly wireProtocol?: LlmApiTemplate["wireProtocol"]
  readonly model: string
  readonly contextWindow: number
  readonly temperature?: number
  readonly topP?: number
  readonly maxOutputTokens?: number
  readonly responseFormat: ResponseFormat
  readonly modalities: NodeModality[]
  readonly defaultSystemPrompt: string
  readonly defaultUserPromptBias?: string
  readonly allowSystemPromptOverride: boolean
  readonly allowUserPromptBias: boolean
  readonly apiKeyEnv?: string
  readonly timeoutMs: number
  readonly retryPolicy: RetryPolicy

  protected constructor(data: LlmApiTemplate) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.provider = data.provider
    this.endpoint = data.endpoint
    this.protocol = data.protocol
    this.wireProtocol = data.wireProtocol
    this.model = data.model
    this.contextWindow = data.contextWindow
    this.temperature = data.temperature
    this.topP = data.topP
    this.maxOutputTokens = data.maxOutputTokens
    this.responseFormat = data.responseFormat
    this.modalities = data.modalities?.length ? [...data.modalities] : ["text"]
    this.defaultSystemPrompt = data.defaultSystemPrompt
    this.defaultUserPromptBias = data.defaultUserPromptBias
    this.allowSystemPromptOverride = data.allowSystemPromptOverride
    this.allowUserPromptBias = data.allowUserPromptBias
    this.apiKeyEnv = data.apiKeyEnv
    this.timeoutMs = data.timeoutMs
    this.retryPolicy = { ...data.retryPolicy }
  }

  toData(): LlmApiTemplate {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      provider: this.provider,
      endpoint: this.endpoint,
      protocol: this.protocol,
      wireProtocol: this.wireProtocol,
      model: this.model,
      contextWindow: this.contextWindow,
      temperature: this.temperature,
      topP: this.topP,
      maxOutputTokens: this.maxOutputTokens,
      responseFormat: this.responseFormat,
      modalities: [...this.modalities],
      defaultSystemPrompt: this.defaultSystemPrompt,
      defaultUserPromptBias: this.defaultUserPromptBias,
      allowSystemPromptOverride: this.allowSystemPromptOverride,
      allowUserPromptBias: this.allowUserPromptBias,
      apiKeyEnv: this.apiKeyEnv,
      timeoutMs: this.timeoutMs,
      retryPolicy: { ...this.retryPolicy },
    }
  }
}

export class PlainLlmApiTemplate extends LlmApiTemplateBase {
  constructor(data: LlmApiTemplate) {
    super(data)
  }
}

const registry = createTemplateRegistry<LlmApiTemplateBase>()

export function registerLlmApiTemplate(template: LlmApiTemplateBase | LlmApiTemplate): LlmApiTemplateBase {
  const instance = template instanceof LlmApiTemplateBase ? template : new PlainLlmApiTemplate(template)
  registry.register(instance)
  return instance
}

export function listLlmApiTemplateInstances(): LlmApiTemplateBase[] {
  return registry.list()
}

export function getLlmApiTemplateInstance(id?: string | null): LlmApiTemplateBase | undefined {
  return id ? registry.get(id) : undefined
}

export function listLlmApiTemplates(): LlmApiTemplate[] {
  return registry.list().map((item) => item.toData())
}

export function getLlmApiTemplate(id?: string | null): LlmApiTemplate | undefined {
  return getLlmApiTemplateInstance(id)?.toData()
}

export function unregisterLlmApiTemplate(id: string): boolean {
  return registry.unregister(id)
}

export function renameLlmApiTemplateId(oldId: string, newId: string, patch?: Partial<LlmApiTemplate>): boolean {
  const current = registry.get(oldId)
  if (!current || !newId.trim() || oldId === newId || registry.has(newId)) return false
  registry.unregister(oldId)
  registerLlmApiTemplate(new PlainLlmApiTemplate({ ...current.toData(), ...patch, id: newId }))
  return true
}

export function importLlmApiTemplateFromJson(json: unknown): LlmApiTemplateBase {
  if (!isRecord(json)) throw new Error("Invalid LLM API template JSON")
  const retry = isRecord(json.retryPolicy) ? json.retryPolicy : {}
  const template = new PlainLlmApiTemplate({
    id: requireString(json, "id"),
    name: requireString(json, "name"),
    description: typeof json.description === "string" ? json.description : "",
    provider: requireString(json, "provider") as LlmApiTemplate["provider"],
    endpoint: requireString(json, "endpoint"),
    protocol: requireString(json, "protocol") as LlmApiTemplate["protocol"],
    wireProtocol: typeof json.wireProtocol === "string" ? json.wireProtocol as LlmApiTemplate["wireProtocol"] : undefined,
    model: requireString(json, "model"),
    contextWindow: typeof json.contextWindow === "number" ? json.contextWindow : 128000,
    temperature: typeof json.temperature === "number" ? json.temperature : undefined,
    topP: typeof json.topP === "number" ? json.topP : undefined,
    maxOutputTokens: typeof json.maxOutputTokens === "number" ? json.maxOutputTokens : undefined,
    responseFormat: (typeof json.responseFormat === "string" ? json.responseFormat : "markdown") as ResponseFormat,
    modalities: Array.isArray(json.modalities)
      ? json.modalities.filter((value): value is NodeModality => value === "text" || value === "image" || value === "audio")
      : ["text"],
    defaultSystemPrompt: typeof json.defaultSystemPrompt === "string" ? json.defaultSystemPrompt : "",
    defaultUserPromptBias: typeof json.defaultUserPromptBias === "string" ? json.defaultUserPromptBias : undefined,
    allowSystemPromptOverride: json.allowSystemPromptOverride !== false,
    allowUserPromptBias: json.allowUserPromptBias !== false,
    apiKeyEnv: typeof json.apiKeyEnv === "string" ? json.apiKeyEnv : undefined,
    timeoutMs: typeof json.timeoutMs === "number" ? json.timeoutMs : 240000,
    retryPolicy: {
      attempts: typeof retry.attempts === "number" ? retry.attempts : 1,
      backoffMs: typeof retry.backoffMs === "number" ? retry.backoffMs : 0,
      continueOnPartialFailure: retry.continueOnPartialFailure === true,
    },
  })
  registerLlmApiTemplate(template)
  return template
}
