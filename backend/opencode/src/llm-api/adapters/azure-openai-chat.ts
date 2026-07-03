import { openaiChatAdapter } from "./openai-chat.js"
import type { LlmWireAdapter } from "./base.js"
import type { LlmClientConfig, UnifiedChatRequest } from "../unified/types.js"

/** Azure OpenAI: deployment in path, api-key header instead of Bearer. */
export const azureOpenaiChatAdapter: LlmWireAdapter = {
  ...openaiChatAdapter,
  protocol: "azure-openai-chat",

  resolveUrl(config: LlmClientConfig) {
    const base = config.endpoint.replace(/\/$/, "")
    if (base.includes("/chat/completions")) return base
    if (base.includes("/deployments/")) return `${base}/chat/completions`
    return `${base}/openai/deployments/${encodeURIComponent(config.model)}/chat/completions?api-version=${config.apiVersion ?? "2024-08-01-preview"}`
  },

  buildHeaders(config: LlmClientConfig) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...config.extraHeaders,
    }
    if (config.apiKey) headers["api-key"] = config.apiKey
    return headers
  },

  toWireBody(request: UnifiedChatRequest, config: LlmClientConfig) {
    const body = openaiChatAdapter.toWireBody(request, config) as Record<string, unknown>
    delete body.model
    return body
  },
}
