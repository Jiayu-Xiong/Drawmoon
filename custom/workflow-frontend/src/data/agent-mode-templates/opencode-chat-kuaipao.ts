import { opencodeCustomTemplate } from "./opencode-custom-template"

export const opencodeChatKuaipaoTemplate = opencodeCustomTemplate({
  id: "opencode-chat-kuaipao",
  name: "OpenCode Chat (compat)",
  description: "Compatibility alias for OpenCode chat. New workflows should use opencode-chat.",
  mode: "chat",
  inheritsFromAgentModeId: "opencode-chat",
  origin: "llm-api-derived",
  defaultSystemPromptFile: "opencode://chat-kuaipao",
  defaultSystemPrompt: "Follow the workflow node objective and output the declared artifact.",
  allowedTools: ["read_file", "write_file", "artifact_link"],
  outputKinds: ["markdown"],
  maxIterations: 12,
})
