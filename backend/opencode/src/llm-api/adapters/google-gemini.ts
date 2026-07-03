import type { LlmWireAdapter } from "./base.js"
import { emptyUsage, textFromMessages } from "./base.js"
import type { LlmClientConfig, UnifiedChatRequest, UnifiedChatResponse, UnifiedStreamEvent } from "../unified/types.js"

export const googleGeminiAdapter: LlmWireAdapter = {
  protocol: "google-gemini",

  resolveUrl(config) {
    const base = config.endpoint.replace(/\/$/, "")
    const model = encodeURIComponent(config.model)
    if (base.includes(":generateContent")) return base
    if (base.endsWith("/v1beta")) return `${base}/models/${model}:generateContent`
    return `${base}/v1beta/models/${model}:generateContent`
  },

  buildHeaders(config) {
    return {
      "Content-Type": "application/json",
      ...config.extraHeaders,
    }
  },

  toWireBody(request: UnifiedChatRequest, _config: LlmClientConfig) {
    const turns = textFromMessages(request.messages)
    const contents = turns.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    }))

    return {
      contents,
      systemInstruction: request.system ? { parts: [{ text: request.system }] } : undefined,
      generationConfig: {
        temperature: request.temperature,
        topP: request.topP,
        maxOutputTokens: request.maxOutputTokens,
        stopSequences: request.stopSequences,
        responseMimeType: request.responseFormat === "json" ? "application/json" : undefined,
      },
    }
  },

  fromWireResponse(body: unknown): UnifiedChatResponse {
    const json = body as Record<string, unknown>
    const candidates = json.candidates as Array<Record<string, unknown>> | undefined
    const parts = ((candidates?.[0]?.content as Record<string, unknown> | undefined)?.parts as Array<Record<string, unknown>> | undefined) ?? []
    const text = parts.map((part) => String(part.text ?? "")).join("")

    const usageRaw = json.usageMetadata as Record<string, number> | undefined
    const input = usageRaw?.promptTokenCount ?? 0
    const output = usageRaw?.candidatesTokenCount ?? 0

    return {
      id: String(json.responseId ?? ""),
      model: String(json.modelVersion ?? ""),
      text,
      finishReason: String((candidates?.[0]?.finishReason as string | undefined) ?? ""),
      usage: usageRaw
        ? {
          inputTokens: input,
          outputTokens: output,
          cacheReadTokens: usageRaw.cachedContentTokenCount ?? 0,
          cacheWriteTokens: 0,
          totalTokens: usageRaw.totalTokenCount ?? input + output,
        }
        : emptyUsage(),
      raw: body,
    }
  },

  parseStreamLine(): UnifiedStreamEvent | null {
    return null
  },
}
