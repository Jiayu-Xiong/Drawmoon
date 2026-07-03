import type { LlmWireAdapter } from "./base.js"
import { emptyUsage, textFromMessages } from "./base.js"
import type { LlmClientConfig, UnifiedChatRequest, UnifiedChatResponse, UnifiedStreamEvent } from "../unified/types.js"

function joinMessagesUrl(base: string) {
  const trimmed = base.replace(/\/$/, "")
  if (trimmed.endsWith("/messages")) return trimmed
  if (trimmed.endsWith("/v1")) return `${trimmed}/messages`
  return `${trimmed}/v1/messages`
}

export const anthropicMessagesAdapter: LlmWireAdapter = {
  protocol: "anthropic-messages",

  resolveUrl(config) {
    return joinMessagesUrl(config.endpoint)
  },

  buildHeaders(config) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": config.apiVersion ?? "2023-06-01",
      ...config.extraHeaders,
    }
    if (config.apiKey) {
      headers["x-api-key"] = config.apiKey
    }
    return headers
  },

  toWireBody(request: UnifiedChatRequest, config: LlmClientConfig) {
    const messages = textFromMessages(request.messages.filter((m) => m.role !== "system"))

    return {
      model: config.model,
      max_tokens: request.maxOutputTokens ?? 8192,
      system: request.system ?? request.messages.find((m) => m.role === "system")?.content,
      messages,
      temperature: request.temperature,
      top_p: request.topP,
      stop_sequences: request.stopSequences,
      stream: request.stream ?? false,
    }
  },

  fromWireResponse(body: unknown): UnifiedChatResponse {
    const json = body as Record<string, unknown>
    const content = json.content as Array<Record<string, unknown>> | undefined
    const text = (content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => String(block.text ?? ""))
      .join("")

    const usageRaw = json.usage as Record<string, number> | undefined
    const input = usageRaw?.input_tokens ?? 0
    const output = usageRaw?.output_tokens ?? 0
    const cacheRead = (usageRaw as Record<string, number> | undefined)?.cache_read_input_tokens ?? 0
    const cacheWrite = (usageRaw as Record<string, number> | undefined)?.cache_creation_input_tokens ?? 0

    return {
      id: String(json.id ?? ""),
      model: String(json.model ?? ""),
      text,
      finishReason: String(json.stop_reason ?? ""),
      usage: usageRaw
        ? {
          inputTokens: input,
          outputTokens: output,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
          totalTokens: input + output + cacheRead + cacheWrite,
        }
        : emptyUsage(),
      raw: body,
    }
  },

  parseStreamLine(line: string): UnifiedStreamEvent | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data: ")) return null
    const data = trimmed.slice(6)
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>
      if (parsed.type === "content_block_delta") {
        const delta = (parsed.delta as Record<string, unknown> | undefined)?.text
        if (typeof delta === "string" && delta) return { type: "delta", delta }
      }
      if (parsed.type === "message_stop") return { type: "done" }
      if (parsed.type === "message_delta") {
        const usage = (parsed.usage as Record<string, number> | undefined)
        if (usage) {
          return {
            type: "usage",
            usage: {
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
              cacheReadTokens: usage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
              totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
            },
          }
        }
      }
    } catch {
      return null
    }
    return null
  },
}
