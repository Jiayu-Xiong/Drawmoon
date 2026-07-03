/**
 * Unified superset LLM API — one request/response shape for all wire protocols.
 */

export type UnifiedRole = "system" | "user" | "assistant" | "tool"

export interface UnifiedTextPart {
  type: "text"
  text: string
}

export interface UnifiedImagePart {
  type: "image"
  url?: string
  base64?: string
  mimeType?: string
}

export type UnifiedContentPart = UnifiedTextPart | UnifiedImagePart

export interface UnifiedMessage {
  role: UnifiedRole
  content: string | UnifiedContentPart[]
  name?: string
  toolCallId?: string
}

export interface UnifiedToolDefinition {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

export type UnifiedResponseFormat = "text" | "markdown" | "json"

export interface UnifiedChatRequest {
  model: string
  messages: UnifiedMessage[]
  system?: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  responseFormat?: UnifiedResponseFormat
  stream?: boolean
  tools?: UnifiedToolDefinition[]
  stopSequences?: string[]
  metadata?: Record<string, unknown>
}

export interface UnifiedTokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens?: number
  totalTokens: number
}

export interface UnifiedChatResponse {
  id: string
  model: string
  text: string
  finishReason?: string
  usage?: UnifiedTokenUsage
  raw?: unknown
}

export interface UnifiedStreamEvent {
  type: "delta" | "usage" | "done" | "error"
  delta?: string
  usage?: UnifiedTokenUsage
  error?: string
  response?: UnifiedChatResponse
}

/** Canonical wire protocol ids (each has a dedicated adapter). */
export type LlmWireProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages"
  | "google-gemini"
  | "deepseek-chat"
  | "azure-openai-chat"
  | "custom-http"

/** Legacy template protocol names mapped to wire protocol. */
export type LlmTemplateProtocol =
  | "openai-compatible"
  | "responses"
  | "messages"
  | "custom-http"

export interface LlmClientConfig {
  protocol: LlmWireProtocol | LlmTemplateProtocol
  endpoint: string
  model: string
  apiKey?: string
  apiKeyEnv?: string
  apiKeyHeader?: string
  apiVersion?: string
  timeoutMs?: number
  extraHeaders?: Record<string, string>
}

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
  templateAliases: LlmTemplateProtocol[]
  modelHints: string[]
}
