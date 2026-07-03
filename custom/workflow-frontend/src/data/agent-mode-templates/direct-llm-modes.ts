import { PlainAgentModeTemplate } from "../template-registry"
import { DIRECT_API_CLI_ID } from "../cli-templates/direct-api-cli"

/** Canonical direct-API agent mode (single mode under virtual CLI direct-api-cli). */
export const DIRECT_API_MODE_ID = "direct-api"

/** @deprecated Use DIRECT_API_MODE_ID — kept for template migration. */
export const DIRECT_LLM_CHAT_MODE_ID = "direct-llm-chat"
/** @deprecated Use DIRECT_API_MODE_ID */
export const DIRECT_LLM_IMAGE_MODE_ID = "direct-llm-image"
/** @deprecated Use DIRECT_API_MODE_ID */
export const DIRECT_LLM_AUDIO_MODE_ID = "direct-llm-audio"

export const LEGACY_DIRECT_MODE_IDS = [
  DIRECT_LLM_CHAT_MODE_ID,
  DIRECT_LLM_IMAGE_MODE_ID,
  DIRECT_LLM_AUDIO_MODE_ID,
] as const

export const directApiTemplate = new PlainAgentModeTemplate({
  id: DIRECT_API_MODE_ID,
  name: "Direct API",
  description: "Call an LLM API template directly (virtual CLI). Model and endpoint come from the node's LLM API binding.",
  provider: "direct-api",
  cliTemplateId: DIRECT_API_CLI_ID,
  strategyKind: "custom",
  controlSurface: "customizable",
  origin: "llm-api-derived",
  mode: "chat",
  model: "workflow-selected",
  contextMode: "fresh",
  defaultSystemPromptFile: "",
  defaultSystemPrompt: "",
  allowSystemPromptOverride: true,
  allowedTools: [],
  outputKinds: ["markdown", "json", "image", "other"],
  maxIterations: 1,
  timeoutMs: 300_000,
  allowFileWrites: false,
  cacheFiles: [],
  contextFiles: [],
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
})

/** @deprecated Register directApiTemplate only. */
export const directLlmChatTemplate = directApiTemplate
/** @deprecated */
export const directLlmImageTemplate = directApiTemplate
/** @deprecated */
export const directLlmAudioTemplate = directApiTemplate
