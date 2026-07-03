import type {
  LlmClientConfig,
  LlmWireProtocol,
  UnifiedChatRequest,
  UnifiedChatResponse,
  UnifiedStreamEvent,
} from "../unified/types.js"

export interface LlmWireAdapter {
  readonly protocol: LlmWireProtocol
  resolveUrl(config: LlmClientConfig): string
  buildHeaders(config: LlmClientConfig): Record<string, string>
  toWireBody(request: UnifiedChatRequest, config: LlmClientConfig): unknown
  fromWireResponse(body: unknown, config: LlmClientConfig): UnifiedChatResponse
  parseStreamLine(line: string, config: LlmClientConfig): UnifiedStreamEvent | null
}

export function textFromMessages(messages: UnifiedChatRequest["messages"]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role === "tool" ? "user" : message.role,
    content: typeof message.content === "string"
      ? message.content
      : message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"),
  }))
}

export function emptyUsage(): UnifiedChatResponse["usage"] {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  }
}
