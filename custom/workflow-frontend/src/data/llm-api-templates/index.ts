import { PlainLlmApiTemplate, registerLlmApiTemplate, listLlmApiTemplates } from "../template-registry"
import type { LlmApiTemplate } from "../console-model"
import { kuaipaoGptImageTemplate } from "./kuaipao-gpt-image"
import { kuaipaoOpenaiChatTemplate } from "./kuaipao-openai-chat"

function kuaipaoModelTemplate(model: string, options?: Partial<LlmApiTemplate>): LlmApiTemplate {
  return {
    id: `kuaipao-${model.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`,
    name: `Kuaipao / ${model}`,
    description: "Local fallback model option. Runtime discovery may enrich this from /v1/models.",
    provider: "custom",
    endpoint: "https://kuaipao.pro/v1",
    protocol: "openai-compatible",
    wireProtocol: /deepseek/i.test(model) ? "deepseek-chat" : "openai-chat",
    model,
    contextWindow: 0,
    responseFormat: "markdown",
    modalities: /image/i.test(model) ? ["image"] : ["text"],
    defaultSystemPrompt: "",
    allowSystemPromptOverride: true,
    allowUserPromptBias: false,
    apiKeyEnv: "KUAIPAO_API_KEY",
    timeoutMs: 300_000,
    retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
    ...options,
  }
}

function deepseekModelTemplate(model: string, options?: Partial<LlmApiTemplate>): LlmApiTemplate {
  return {
    id: `deepseek-${model.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`,
    name: `DeepSeek / ${model}`,
    description: "Local fallback DeepSeek API option. Runtime discovery may enrich this from /v1/models.",
    provider: "custom",
    endpoint: "https://api.deepseek.com/v1",
    protocol: "openai-compatible",
    wireProtocol: "deepseek-chat",
    model,
    contextWindow: 0,
    responseFormat: "markdown",
    modalities: ["text"],
    defaultSystemPrompt: "",
    allowSystemPromptOverride: true,
    allowUserPromptBias: false,
    apiKeyEnv: "DEEPSEEK_API_KEY",
    timeoutMs: 300_000,
    retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
    ...options,
  }
}

/** Runtime bootstrap overwrites transport fields from api file + /llm/copilot-bind. */
const builtinLlmApiTemplates = [
  kuaipaoOpenaiChatTemplate,
  kuaipaoModelTemplate("gpt-5.5"),
  kuaipaoModelTemplate("deepseek-v4-flash"),
  deepseekModelTemplate("deepseek-v4-flash"),
  deepseekModelTemplate("deepseek-v4-pro"),
  kuaipaoGptImageTemplate,
  kuaipaoModelTemplate("gpt-image-2-pro", { responseFormat: "text", allowSystemPromptOverride: false }),
  kuaipaoModelTemplate("gpt-image-2-vip", { responseFormat: "text", allowSystemPromptOverride: false }),
]

let initialized = false

export function ensureLlmApiTemplatesRegistered() {
  if (initialized) return
  for (const template of builtinLlmApiTemplates) {
    registerLlmApiTemplate(template instanceof PlainLlmApiTemplate ? template : new PlainLlmApiTemplate(template))
  }
  initialized = true
}

ensureLlmApiTemplatesRegistered()

export { getLlmApiTemplate, listLlmApiTemplates, registerLlmApiTemplate, unregisterLlmApiTemplate, importLlmApiTemplateFromJson, renameLlmApiTemplateId } from "../template-registry"

/** Live proxy — always reflects the current registry state after async bind completes */
export const llmApiTemplates = new Proxy([] as ReturnType<typeof listLlmApiTemplates>, {
  get(_target, prop, receiver) {
    const list = listLlmApiTemplates()
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list)
    if (prop === "length") return list.length
    const idx = typeof prop === "string" ? Number(prop) : undefined
    if (idx !== undefined && Number.isFinite(idx)) return list[idx]
    const value = Reflect.get(list, prop, receiver)
    return typeof value === "function" ? value.bind(list) : value
  },
})
