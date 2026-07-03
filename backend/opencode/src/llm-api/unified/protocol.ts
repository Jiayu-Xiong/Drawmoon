import type { LlmTemplateProtocol, LlmWireProtocol } from "./types.js"

const LEGACY_MAP: Record<LlmTemplateProtocol, LlmWireProtocol> = {
  "openai-compatible": "openai-chat",
  responses: "openai-responses",
  messages: "anthropic-messages",
  "custom-http": "custom-http",
}

export function resolveWireProtocol(protocol: LlmWireProtocol | LlmTemplateProtocol): LlmWireProtocol {
  if (protocol in LEGACY_MAP) return LEGACY_MAP[protocol as LlmTemplateProtocol]
  return protocol as LlmWireProtocol
}

export function inferWireProtocolFromModel(model: string, endpointTypes?: string[]): LlmWireProtocol {
  if (endpointTypes?.some((type) => /responses/i.test(type))) return "openai-responses"

  const id = model.toLowerCase()

  if (/claude|anthropic/.test(id)) return "anthropic-messages"
  if (/gemini|google/.test(id)) return "google-gemini"
  if (/deepseek/.test(id)) return "deepseek-chat"
  if (/gpt-[45o]|o[134]|chatgpt|text-davinci|openai|^gpt-4\.1|^gpt-5/.test(id)) return "openai-chat"

  return "openai-chat"
}

export function inferEndpointForProtocol(
  protocol: LlmWireProtocol,
  kuaipao?: { openaiBaseUrl: string; anthropicBaseUrl: string; chatCompletionsUrl: string },
): string {
  switch (protocol) {
    case "anthropic-messages":
      return kuaipao?.anthropicBaseUrl ?? "https://api.anthropic.com"
    case "openai-chat":
    case "deepseek-chat":
      return kuaipao?.openaiBaseUrl ?? "https://api.openai.com/v1"
    case "openai-responses":
      return (kuaipao?.openaiBaseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")
    case "google-gemini":
      return "https://generativelanguage.googleapis.com/v1beta"
    case "azure-openai-chat":
      return kuaipao?.openaiBaseUrl ?? "https://{resource}.openai.azure.com"
    default:
      return kuaipao?.chatCompletionsUrl ?? "https://api.openai.com/v1/chat/completions"
  }
}
