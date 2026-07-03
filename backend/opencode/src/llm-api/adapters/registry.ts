import type { LlmWireAdapter } from "./base.js"
import { anthropicMessagesAdapter } from "./anthropic-messages.js"
import { azureOpenaiChatAdapter } from "./azure-openai-chat.js"
import { customHttpAdapter } from "./custom-http.js"
import { deepseekChatAdapter } from "./deepseek-chat.js"
import { googleGeminiAdapter } from "./google-gemini.js"
import { openaiChatAdapter } from "./openai-chat.js"
import { openaiResponsesAdapter } from "./openai-responses.js"
import type { LlmProtocolDescriptor, LlmWireProtocol } from "../unified/types.js"
import { resolveWireProtocol } from "../unified/protocol.js"

const ADAPTERS: LlmWireAdapter[] = [
  openaiChatAdapter,
  openaiResponsesAdapter,
  anthropicMessagesAdapter,
  googleGeminiAdapter,
  deepseekChatAdapter,
  azureOpenaiChatAdapter,
  customHttpAdapter,
]

const byProtocol = new Map<LlmWireProtocol, LlmWireAdapter>(
  ADAPTERS.map((adapter) => [adapter.protocol, adapter]),
)

export const LLM_PROTOCOL_CATALOG: LlmProtocolDescriptor[] = [
  {
    id: "openai-chat",
    name: "OpenAI Chat Completions",
    vendor: "OpenAI / 兼容代理",
    description: "POST /v1/chat/completions — ChatGPT、gpt-4o、多数 OpenAI 兼容网关（含 kuaipao /v1）",
    defaultEndpoint: "https://api.openai.com/v1",
    authStyle: "bearer",
    supportsStreaming: true,
    supportsTools: true,
    supportsCacheTokens: true,
    templateAliases: ["openai-compatible"],
    modelHints: ["gpt-4", "gpt-4o", "gpt-3.5", "o1", "o3", "chatgpt"],
  },
  {
    id: "openai-responses",
    name: "OpenAI Responses API",
    vendor: "OpenAI",
    description: "POST /v1/responses — 新一代 Responses 接口（instructions + input）",
    defaultEndpoint: "https://api.openai.com/v1",
    authStyle: "bearer",
    supportsStreaming: true,
    supportsTools: true,
    supportsCacheTokens: true,
    templateAliases: ["responses"],
    modelHints: ["gpt-4.1", "gpt-5", "responses"],
  },
  {
    id: "anthropic-messages",
    name: "Anthropic Messages API",
    vendor: "Anthropic / Claude",
    description: "POST /v1/messages — Claude 系列（含 kuaipao Anthropic 端点）",
    defaultEndpoint: "https://api.anthropic.com",
    authStyle: "api-key",
    supportsStreaming: true,
    supportsTools: true,
    supportsCacheTokens: true,
    templateAliases: ["messages"],
    modelHints: ["claude", "anthropic"],
  },
  {
    id: "google-gemini",
    name: "Google Gemini GenerateContent",
    vendor: "Google",
    description: "POST /v1beta/models/{model}:generateContent",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    authStyle: "query-key",
    supportsStreaming: false,
    supportsTools: true,
    supportsCacheTokens: true,
    templateAliases: [],
    modelHints: ["gemini", "google"],
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat Completions",
    vendor: "DeepSeek",
    description: "OpenAI 兼容格式，默认 api.deepseek.com/v1/chat/completions",
    defaultEndpoint: "https://api.deepseek.com/v1",
    authStyle: "bearer",
    supportsStreaming: true,
    supportsTools: false,
    supportsCacheTokens: false,
    templateAliases: [],
    modelHints: ["deepseek"],
  },
  {
    id: "azure-openai-chat",
    name: "Azure OpenAI Chat",
    vendor: "Microsoft Azure",
    description: "deployment 路径 + api-key 头，兼容 OpenAI chat schema",
    defaultEndpoint: "https://{resource}.openai.azure.com",
    authStyle: "api-key",
    supportsStreaming: true,
    supportsTools: true,
    supportsCacheTokens: true,
    templateAliases: [],
    modelHints: ["azure", "deployment"],
  },
  {
    id: "custom-http",
    name: "Custom HTTP (OpenAI fallback)",
    vendor: "Custom",
    description: "未知端点时回退为 OpenAI chat completions 解析",
    defaultEndpoint: "",
    authStyle: "custom",
    supportsStreaming: true,
    supportsTools: false,
    supportsCacheTokens: false,
    templateAliases: ["custom-http"],
    modelHints: [],
  },
]

export function getLlmWireAdapter(protocol: string): LlmWireAdapter {
  const wire = resolveWireProtocol(protocol as LlmWireProtocol)
  return byProtocol.get(wire) ?? customHttpAdapter
}

export function listLlmWireAdapters(): LlmWireAdapter[] {
  return [...ADAPTERS]
}

export function templateProtocolForWire(protocol: LlmWireProtocol): string {
  const entry = LLM_PROTOCOL_CATALOG.find((item) => item.id === protocol)
  return entry?.templateAliases[0] ?? protocol
}
