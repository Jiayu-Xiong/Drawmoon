import { randomUUID } from "node:crypto"

import { getLlmWireAdapter } from "./adapters/registry.js"
import { resolveWireProtocol } from "./unified/protocol.js"
import type {
  LlmClientConfig,
  UnifiedChatRequest,
  UnifiedChatResponse,
  UnifiedStreamEvent,
  UnifiedTokenUsage,
} from "./unified/types.js"

function resolveApiKey(config: LlmClientConfig): string {
  if (config.apiKey) return config.apiKey
  if (config.apiKeyEnv) return process.env[config.apiKeyEnv] ?? ""
  return ""
}

function appendQueryKey(url: string, key: string) {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}key=${encodeURIComponent(key)}`
}

export async function unifiedChatCompletion(
  config: LlmClientConfig,
  request: UnifiedChatRequest,
  signal?: AbortSignal,
): Promise<UnifiedChatResponse> {
  const wire = resolveWireProtocol(config.protocol)
  const adapter = getLlmWireAdapter(wire)
  const apiKey = resolveApiKey(config)
  let url = adapter.resolveUrl({ ...config, protocol: wire })
  const headers = adapter.buildHeaders({ ...config, protocol: wire, apiKey })

  if (wire === "google-gemini" && apiKey) {
    url = appendQueryKey(url, apiKey)
  }

  const body = adapter.toWireBody({ ...request, stream: false }, { ...config, protocol: wire })
  const timeoutMs = config.timeoutMs ?? 300_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const mergedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: mergedSignal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(`LLM API ${wire} error ${response.status}: ${errorText}`)
    }

    const json = await response.json()
    const parsed = adapter.fromWireResponse(json, { ...config, protocol: wire })
    return {
      ...parsed,
      id: parsed.id || randomUUID(),
      model: parsed.model || config.model,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function* unifiedChatCompletionStream(
  config: LlmClientConfig,
  request: UnifiedChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<UnifiedStreamEvent> {
  const wire = resolveWireProtocol(config.protocol)
  const adapter = getLlmWireAdapter(wire)
  const apiKey = resolveApiKey(config)
  let url = adapter.resolveUrl({ ...config, protocol: wire })
  const headers = adapter.buildHeaders({ ...config, protocol: wire, apiKey })

  if (wire === "google-gemini" && apiKey) {
    url = appendQueryKey(url, apiKey)
  }

  const body = adapter.toWireBody({ ...request, stream: true }, { ...config, protocol: wire })
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error")
    yield { type: "error", error: `LLM API ${wire} error ${response.status}: ${errorText}` }
    return
  }

  if (!response.body) {
    yield { type: "error", error: "No response body" }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let usage: UnifiedTokenUsage | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const event = adapter.parseStreamLine(line, { ...config, protocol: wire })
      if (!event) continue
      if (event.type === "delta" && event.delta) {
        text += event.delta
        yield event
      } else if (event.type === "usage" && event.usage) {
        usage = event.usage
        yield event
      } else if (event.type === "done") {
        yield {
          type: "done",
          response: {
            id: randomUUID(),
            model: config.model,
            text,
            usage,
          },
        }
        return
      } else if (event.type === "error") {
        yield event
        return
      }
    }
  }

  yield {
    type: "done",
    response: {
      id: randomUUID(),
      model: config.model,
      text,
      usage,
    },
  }
}
