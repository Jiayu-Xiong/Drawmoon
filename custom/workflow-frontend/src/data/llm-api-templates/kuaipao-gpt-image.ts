import type { LlmApiTemplate } from "../console-model"

export const kuaipaoGptImageTemplate: LlmApiTemplate = {
  id: "kuaipao-gpt-image-2",
  name: "Kuaipao GPT Image",
  description: "OpenAI-compatible image generation endpoint. Used by non-text workflow nodes.",
  provider: "custom",
  endpoint: "https://kuaipao.pro/v1",
  protocol: "openai-compatible",
  wireProtocol: "openai-chat",
  model: "gpt-image-2",
  contextWindow: 0,
  temperature: 1,
  maxOutputTokens: 0,
  responseFormat: "text",
  modalities: ["image"],
  defaultSystemPrompt: "",
  allowSystemPromptOverride: false,
  allowUserPromptBias: false,
  apiKeyEnv: "KUAIPAO_CDK_1_API_KEY",
  timeoutMs: 600_000,
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
}
