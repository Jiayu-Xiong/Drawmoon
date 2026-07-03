import { openaiChatAdapter } from "./openai-chat.js"
import type { LlmWireAdapter } from "./base.js"

/** Fallback: treat unknown endpoints as OpenAI chat completions. */
export const customHttpAdapter: LlmWireAdapter = {
  ...openaiChatAdapter,
  protocol: "custom-http",
}
