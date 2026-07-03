import type { LlmWireAdapter } from "./base.js"
import { emptyUsage, textFromMessages } from "./base.js"
import type { LlmClientConfig, UnifiedChatRequest, UnifiedChatResponse, UnifiedStreamEvent } from "../unified/types.js"

export const openaiResponsesAdapter: LlmWireAdapter = {
  protocol: "openai-responses",

  resolveUrl(config) {
    const base = config.endpoint.replace(/\/$/, "")
    if (base.endsWith("/responses")) return base
    if (base.endsWith("/v1")) return `${base}/responses`
    return `${base}/v1/responses`
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
    const userText = textFromMessages(request.messages.filter((m) => m.role === "user"))
      .map((m) => m.content)
      .join("\n\n")

    return {
      model: config.model,
      input: userText,
      instructions: request.system ?? request.messages.find((m) => m.role === "system")?.content ?? undefined,
      temperature: request.temperature,
      top_p: request.topP,
      max_output_tokens: request.maxOutputTokens,
      stream: request.stream ?? false,
      text: request.responseFormat === "json" ? { format: { type: "json_object" } } : undefined,
    }
  },

  fromWireResponse(body: unknown): UnifiedChatResponse {
    const json = body as Record<string, unknown>
    const outputBlocks = json.output as Array<Record<string, unknown>> | undefined
    const textParts = (outputBlocks ?? [])
      .flatMap((item) => (item.content as Array<Record<string, unknown>> | undefined) ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => String(part.text ?? ""))

    const usageRaw = json.usage as Record<string, unknown> | undefined
    const inputDetails = usageRaw?.input_tokens_details as Record<string, number> | undefined
    const inputTokens = Number(usageRaw?.input_tokens ?? 0)
    const outputTokens = Number(usageRaw?.output_tokens ?? 0)
    return {
      id: String(json.id ?? ""),
      model: String(json.model ?? ""),
      text: textParts.join(""),
      finishReason: String(json.status ?? ""),
      usage: usageRaw
        ? {
          inputTokens,
          outputTokens,
          cacheReadTokens: Number(inputDetails?.cached_tokens ?? 0),
          cacheWriteTokens: 0,
          totalTokens: inputTokens + outputTokens,
        }
        : emptyUsage(),
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
      if (parsed.type === "response.output_text.delta") {
        const delta = (parsed as Record<string, string>).delta
        if (delta) return { type: "delta", delta }
      }
    } catch {
      return null
    }
    return null
  },
}
