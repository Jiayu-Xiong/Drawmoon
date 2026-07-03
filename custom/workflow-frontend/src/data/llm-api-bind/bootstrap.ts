import { fetchCopilotLlmBind, type CopilotLlmBindResult } from "../../api"
import type { LlmApiTemplate } from "../console-model"
import { sanitizeDisplayLabel } from "../../utils/display-label"
import { PlainAgentModeTemplate, registerAgentModeTemplate, getAgentModeTemplate } from "../template-registry"
import { PlainLlmApiTemplate, registerLlmApiTemplate, getLlmApiTemplate, listLlmApiTemplates, unregisterLlmApiTemplate } from "../template-registry"

let bindPromise: Promise<CopilotLlmBindResult | null> | null = null
let lastBindResult: CopilotLlmBindResult | null = null
let lastBindError: string | null = null
const bindListeners = new Set<() => void>()
const CACHE_KEY = "xy.llmApiBind.cache.v1"

function readCachedBind() {
  // Registry cache is stored under ~/.drawmoon/ via the backend runtime API.
  return null
}

function writeCachedBind(_bind: CopilotLlmBindResult) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}

export function onLlmApiBindReady(listener: () => void) {
  bindListeners.add(listener)
  return () => bindListeners.delete(listener)
}

export function getLastLlmBindResult() {
  if (!lastBindResult) lastBindResult = readCachedBind()
  return lastBindResult
}

export function getLastLlmBindError() {
  return lastBindError
}

function notifyBindReady() {
  for (const listener of bindListeners) listener()
}

function modalitiesForModel(model: string): LlmApiTemplate["modalities"] {
  const normalized = model.toLowerCase()
  if (/(image|gpt-image|dall-e|flux|sdxl|stable-diffusion|midjourney)/.test(normalized)) return ["image"]
  if (/(audio|tts|speech|voice|whisper)/.test(normalized)) return ["audio"]
  return ["text"]
}

function specToTemplate(spec: CopilotLlmBindResult["templates"][number], existing?: LlmApiTemplate): LlmApiTemplate {
  return {
    id: spec.id,
    name: sanitizeDisplayLabel(spec.name),
    description: spec.description,
    provider: (spec.provider === "copilot" ? "copilot" : spec.provider === "anthropic" ? "anthropic" : "custom") as LlmApiTemplate["provider"],
    endpoint: spec.endpoint,
    protocol: spec.protocol,
    wireProtocol: spec.wireProtocol,
    model: spec.model,
    contextWindow: spec.contextWindow,
    temperature: spec.temperature ?? existing?.temperature,
    maxOutputTokens: spec.maxOutputTokens ?? existing?.maxOutputTokens,
    responseFormat: spec.responseFormat,
    modalities: existing?.modalities ?? modalitiesForModel(spec.model),
    defaultSystemPrompt: "",
    defaultUserPromptBias: existing?.defaultUserPromptBias,
    allowSystemPromptOverride: spec.allowSystemPromptOverride,
    allowUserPromptBias: false,
    apiKeyEnv: spec.apiKeyEnv,
    timeoutMs: spec.timeoutMs,
    retryPolicy: existing?.retryPolicy ?? { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
  }
}

function isUsableBind(bind: CopilotLlmBindResult) {
  return bind.templates.some((template) => Boolean(template.model)) || bind.models.length > 0 || Boolean(bind.discovery?.models.length)
}

function applyBind(bind: CopilotLlmBindResult) {
  if (!isUsableBind(bind)) return
  if (bind.templates.length) {
    const keepIds = new Set(bind.templates.map((spec) => spec.id))
    for (const existing of listLlmApiTemplates()) {
      const isBuiltinFallback =
        existing.id === "kuaipao-openai-chat" ||
        existing.id === "kuaipao-gpt-5-5" ||
        existing.id === "kuaipao-deepseek-v4-flash" ||
        existing.id === "deepseek-deepseek-v4-flash" ||
        existing.id === "deepseek-deepseek-v4-pro" ||
        existing.id === "kuaipao-gpt-image-2" ||
        existing.id === "kuaipao-gpt-image-2-pro" ||
        existing.id === "kuaipao-gpt-image-2-vip"
      if (existing.id.startsWith("kuaipao-") && !keepIds.has(existing.id) && !isBuiltinFallback) {
        unregisterLlmApiTemplate(existing.id)
      }
    }
    for (const spec of bind.templates) {
      const existing = getLlmApiTemplate(spec.id)
      registerLlmApiTemplate(new PlainLlmApiTemplate(specToTemplate(spec, existing)))
    }
  }

  if (bind.agentModeSpec) {
    const existingMode = getAgentModeTemplate(bind.agentModeSpec.id)
    const nextMode = {
      ...(existingMode ?? {
        provider: "opencode" as const,
        cliTemplateId: "opencode-cli",
        strategyKind: "custom" as const,
        controlSurface: "customizable" as const,
        origin: "llm-api-derived" as const,
        contextMode: "inherit" as const,
        defaultSystemPromptFile: "opencode://chat-kuaipao",
        allowSystemPromptOverride: true,
        allowedTools: ["read_file", "write_file", "http_llm_call"],
        outputKinds: ["markdown" as const],
        maxIterations: 12,
        timeoutMs: 900_000,
        allowFileWrites: true,
        cacheFiles: [] as string[],
        contextFiles: [] as string[],
        retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
      }),
      id: bind.agentModeSpec.id,
      name: sanitizeDisplayLabel(bind.agentModeSpec.name),
      description: bind.agentModeSpec.description,
      mode: bind.agentModeSpec.mode,
      model: bind.agentModeSpec.model,
      derivedFromLlmApiTemplateId: bind.agentModeSpec.derivedFromLlmApiTemplateId,
      defaultSystemPrompt: bind.agentModeSpec.defaultSystemPrompt,
    }
    registerAgentModeTemplate(new PlainAgentModeTemplate(nextMode))
  }

  for (const fallbackId of [
    "kuaipao-openai-chat",
    "kuaipao-gpt-5-5",
    "kuaipao-deepseek-v4-flash",
    "deepseek-deepseek-v4-flash",
    "deepseek-deepseek-v4-pro",
    "kuaipao-gpt-image-2",
    "kuaipao-gpt-image-2-pro",
    "kuaipao-gpt-image-2-vip",
  ]) {
    const template = getLlmApiTemplate(fallbackId)
    if (template) registerLlmApiTemplate(new PlainLlmApiTemplate(template))
  }
}

export async function refreshCopilotLlmBind() {
  bindPromise = null
  return ensureCopilotLlmBind({ refresh: true })
}

export async function ensureCopilotLlmBind(options?: { refresh?: boolean }) {
  if (!lastBindResult && !options?.refresh) {
    lastBindResult = readCachedBind()
    if (lastBindResult) {
      applyBind(lastBindResult)
      notifyBindReady()
    }
  }
  if (bindPromise && !options?.refresh) return bindPromise
  bindPromise = (async () => {
    try {
      const bind = await fetchCopilotLlmBind({ refresh: options?.refresh })
      lastBindError = bind.modelsError
        ?? (!bind.available ? bind.providerSummary : null)
        ?? (bind.templates.every((template) => !template.model) ? "No models returned from kuaipao /v1/models" : null)
      if (isUsableBind(bind)) {
        lastBindResult = bind
        applyBind(bind)
        writeCachedBind(bind)
      } else if (!lastBindResult) {
        lastBindResult = readCachedBind()
        if (lastBindResult) applyBind(lastBindResult)
      }
      notifyBindReady()
      return isUsableBind(bind) ? bind : lastBindResult
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastBindError = /404/.test(message)
        ? `Runtime returned 404 for /llm/copilot-bind — restart backend-opencode (old build still on :3456). ${message}`
        : message
      lastBindResult = null
      notifyBindReady()
      bindPromise = null
      return null
    }
  })()
  return bindPromise
}
