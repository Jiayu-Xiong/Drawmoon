import { openaiChatAdapter } from "./openai-chat.js"
import type { LlmWireAdapter } from "./base.js"
import type { LlmClientConfig } from "../unified/types.js"

/** DeepSeek uses OpenAI-compatible chat completions with a different default host. */
export const deepseekChatAdapter: LlmWireAdapter = {
  ...openaiChatAdapter,
  protocol: "deepseek-chat",

  resolveUrl(config: LlmClientConfig) {
    const endpoint = config.endpoint.includes("deepseek")
      ? config.endpoint
      : "https://api.deepseek.com/v1"
    return openaiChatAdapter.resolveUrl({ ...config, endpoint })
  },
}
