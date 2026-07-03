import type { LlmWireAdapter } from "./base.js"
import { emptyUsage, textFromMessages } from "./base.js"
import type { LlmClientConfig, UnifiedChatRequest, UnifiedChatResponse, UnifiedStreamEvent } from "../unified/types.js"

function joinUrl(base: string, path: string) {
  const trimmed = base.replace(/\/$/, "")
  if (trimmed.endsWith("/chat/completions")) return trimmed
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`
  return `${trimmed}${path}`
}

export const openaiChatAdapter: LlmWireAdapter = {
  protocol: "openai-chat",

  resolveUrl(config) {
    return joinUrl(config.endpoint, "/chat/completions")
  },

  buildHeaders(config) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...config.extraHeaders,
    }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    return headers
  },

  toWireBody(request: UnifiedChatRequest, config: LlmClientConfig) {
    const messages = textFromMessages(request.messages)
    if (request.system) messages.unshift({ role: "system", content: request.system })

    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      stream: request.stream ?? false,
      temperature: request.temperature,
      top_p: request.topP,
      max_tokens: request.maxOutputTokens,
      stop: request.stopSequences,
    }

    if (request.responseFormat === "json") {
      body.response_format = { type: "json_object" }
    }

    return body
  },

  fromWireResponse(body: unknown): UnifiedChatResponse {
    const json = body as Record<string, unknown>
    const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0]
    const message = choice?.message as Record<string, unknown> | undefined
    const usageRaw = json.usage as Record<string, unknown> | undefined
    const promptDetails = usageRaw?.prompt_tokens_details as Record<string, number> | undefined
    const usage = usageRaw
      ? {
        inputTokens: Number(usageRaw.prompt_tokens ?? 0),
        outputTokens: Number(usageRaw.completion_tokens ?? 0),
        cacheReadTokens: Number(promptDetails?.cached_tokens ?? 0),
        cacheWriteTokens: 0,
        totalTokens: Number(usageRaw.total_tokens ?? 0),
      }
      : emptyUsage()

    return {
      id: String(json.id ?? ""),
      model: String(json.model ?? ""),
      text: String(message?.content ?? ""),
      finishReason: String(choice?.finish_reason ?? ""),
      usage,
      raw: body,
    }
  },

  parseStreamLine(line: string): UnifiedStreamEvent | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data: ")) return null
    const data = trimmed.slice(6)
    if (data === "[DONE]") return { type: "done" }
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>
      const delta = ((parsed.choices as Array<Record<string, unknown>>)?.[0]?.delta as Record<string, unknown>)?.content
      if (typeof delta === "string" && delta) return { type: "delta", delta }
      const usage = parsed.usage as Record<string, number> | undefined
      if (usage?.total_tokens) {
        return {
          type: "usage",
          usage: {
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: usage.total_tokens ?? 0,
          },
        }
      }
    } catch {
      return null
    }
    return null
  },
}
