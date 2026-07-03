import type { AgentNodeConfig, ProviderCapabilities, ProviderId } from "../../../schema/types.js"

export type AttachmentChannel = "none" | "path" | "base64"

export interface InputModalities {
  filesByPath: boolean
  images: boolean
  pdf: boolean
  attachmentChannel: AttachmentChannel
}

export interface DelegateCapability {
  provider: ProviderId
  modalities: InputModalities
}

export const DEFAULT_INPUT_MODALITIES: InputModalities = {
  filesByPath: false,
  images: false,
  pdf: false,
  attachmentChannel: "none",
}

export const CLI_FILE_MODALITIES: InputModalities = {
  filesByPath: true,
  images: true,
  pdf: true,
  attachmentChannel: "path",
}

export const API_VISION_MODALITIES: InputModalities = {
  filesByPath: false,
  images: true,
  pdf: false,
  attachmentChannel: "base64",
}

export const API_TEXT_MODALITIES: InputModalities = {
  filesByPath: false,
  images: false,
  pdf: false,
  attachmentChannel: "none",
}

export function modalitiesFromProviderCapabilities(caps?: ProviderCapabilities): InputModalities {
  if (caps?.inputModalities) return caps.inputModalities
  if (caps?.fileOps) return CLI_FILE_MODALITIES
  return DEFAULT_INPUT_MODALITIES
}

function isVisionModel(model?: string, modality?: AgentNodeConfig["modality"]): boolean {
  if (modality === "image") return true
  if (!model) return false
  const m = model.toLowerCase()
  return /vision|gpt-4o|gpt-4\.1|claude-3|gemini.*pro|gemini.*flash|qwen-vl|llava|multimodal/i.test(m)
}

export function resolveDelegateCapability(config: AgentNodeConfig): DelegateCapability {
  const provider = config.provider ?? "custom"
  const isLlmApiOnly = provider === "custom" && Boolean(config.llmApi?.endpoint)
  const isDirectApi = config.modality === "image" || config.modality === "audio" || isLlmApiOnly

  if (isDirectApi) {
    if (isVisionModel(config.llmApi?.model ?? config.model, config.modality)) {
      return { provider, modalities: API_VISION_MODALITIES }
    }
    return { provider, modalities: API_TEXT_MODALITIES }
  }

  switch (provider) {
    case "opencode":
    case "codex":
    case "kiro":
      return { provider, modalities: CLI_FILE_MODALITIES }
    case "copilot":
      return { provider, modalities: { ...DEFAULT_INPUT_MODALITIES, filesByPath: false } }
    case "openai":
      if (isVisionModel(config.model, config.modality)) {
        return { provider, modalities: API_VISION_MODALITIES }
      }
      return { provider, modalities: API_TEXT_MODALITIES }
    default:
      return { provider, modalities: DEFAULT_INPUT_MODALITIES }
  }
}

export function providerSupportsInputKind(
  caps: DelegateCapability,
  kind: "text" | "markdown" | "image" | "pdf" | "binary",
): boolean {
  switch (kind) {
    case "text":
    case "markdown":
      return caps.modalities.filesByPath || caps.modalities.attachmentChannel === "base64"
    case "image":
      return caps.modalities.images
    case "pdf":
      return caps.modalities.pdf
    case "binary":
      return caps.modalities.filesByPath
    default:
      return false
  }
}
