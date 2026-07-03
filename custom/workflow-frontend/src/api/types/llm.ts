export type LlmWireProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages"
  | "google-gemini"
  | "deepseek-chat"
  | "azure-openai-chat"
  | "custom-http"

export interface LlmProtocolDescriptor {
  id: LlmWireProtocol
  name: string
  vendor: string
  description: string
  defaultEndpoint: string
  authStyle: "bearer" | "api-key" | "query-key" | "custom"
  supportsStreaming: boolean
  supportsTools: boolean
  supportsCacheTokens: boolean
  templateAliases: string[]
  modelHints: string[]
}

export interface LlmApiTemplateSpec {
  id: string
  name: string
  description: string
  provider: string
  endpoint: string
  protocol: "openai-compatible" | "messages" | "responses" | "custom-http"
  wireProtocol?: LlmWireProtocol
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

export interface ApiConcurrencyConfig {
  limits: Record<string, number>
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
  error?: string
  models: Array<{
    id: string
    name: string
    contextWindow?: number
    wireProtocol?: string
    ownedBy?: string
    endpointTypes?: string[]
  }>
}

export interface CopilotLlmBindResult {
  available: boolean
  copilotCommand: string
  providerSummary: string
  modelsEndpoint?: string
  modelsError?: string
  apiGroups?: CopilotApiGroup[]
  kuaipao: {
    configPath: string | null
    apiKeyEnv: string
    openaiBaseUrl: string
    anthropicBaseUrl: string
    chatCompletionsUrl: string
    hasKeyFile: boolean
    keyConfigured?: boolean
    models: Array<{ id: string; name: string; contextWindow?: number; wireProtocol?: string }>
  }
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

export interface KuaipaoModelsResult {
  available: boolean
  endpoint: string
  error?: string
  models: Array<{
    id: string
    name: string
    contextWindow?: number
    wireProtocol?: string
    ownedBy?: string
    endpointTypes?: string[]
    raw?: Record<string, unknown>
  }>
  rawModels: Array<Record<string, unknown>>
  rawCount: number
  keyConfigured: boolean
  configPath: string | null
  openaiBaseUrl: string
}

export interface KuaipaoConfigSnapshot {
  configPath: string | null
  apiKeyEnv: string
  openaiBaseUrl: string
  anthropicBaseUrl: string
  chatCompletionsUrl: string
  modelsEndpoint: string
  hasKeyFile: boolean
  keyConfigured: boolean
}
