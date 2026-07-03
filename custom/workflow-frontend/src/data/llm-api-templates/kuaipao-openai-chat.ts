import type { LlmApiTemplate } from "../console-model"

/** Placeholder until runtime reads models from the api file. */
export const kuaipaoOpenaiChatTemplate: LlmApiTemplate = {
  id: "kuaipao-openai-chat",
  name: "Kuaipao OpenAI",
  description: "Filled from api file via local runtime (model lines after URLs).",
  provider: "custom",
  endpoint: "https://kuaipao.pro/v1",
  protocol: "openai-compatible",
  model: "gpt-5.5",
  contextWindow: 0,
  temperature: 0.7,
  topP: 0.95,
  maxOutputTokens: 8192,
  responseFormat: "markdown",
  modalities: ["text"],
  defaultSystemPrompt: "",
  allowSystemPromptOverride: true,
  allowUserPromptBias: false,
  apiKeyEnv: "KUAIPAO_API_KEY",
  timeoutMs: 300_000,
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
}
