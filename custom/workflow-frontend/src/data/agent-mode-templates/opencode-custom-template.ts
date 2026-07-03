import type { AgentModeTemplate, AgentRuntimeMode } from "../console-model"
import type { AgentModeTemplateData } from "../template-registry/agent-mode-template"
import { PlainAgentModeTemplate, getAgentModeTemplateInstance } from "../template-registry"

export type OpencodeCustomTemplateInput = {
  id: string
  name: string
  description: string
  mode: AgentRuntimeMode
  inheritsFromAgentModeId?: string
} & Partial<Omit<AgentModeTemplateData, "id" | "name" | "description" | "mode" | "provider" | "cliTemplateId" | "strategyKind">>

function defaultInheritsFrom(mode: AgentRuntimeMode): string {
  if (mode === "chat") return "opencode-chat"
  if (mode === "plan") return "opencode-plan"
  return "opencode-build"
}

function mergeConstraints(
  base: AgentModeTemplateData["constraints"],
  overlay: AgentModeTemplateData["constraints"],
): AgentModeTemplateData["constraints"] | undefined {
  if (!base && !overlay) return undefined
  return {
    ...base,
    ...overlay,
    forcedSkills: overlay?.forcedSkills ?? base?.forcedSkills,
    allowedSkills: overlay?.allowedSkills ?? base?.allowedSkills,
    forcedMcpServers: overlay?.forcedMcpServers ?? base?.forcedMcpServers,
    allowedMcpServers: overlay?.allowedMcpServers ?? base?.allowedMcpServers,
    forcedTools: overlay?.forcedTools ?? base?.forcedTools,
    allowedTools: overlay?.allowedTools ?? base?.allowedTools,
  }
}

/** Merge base OpenCode mode with custom overlays; empty custom fields inherit from base. */
export function mergeOpencodeCustomLayer(
  base: AgentModeTemplateData,
  custom: AgentModeTemplateData,
): AgentModeTemplateData {
  const allowedTools = custom.allowedTools?.length ? custom.allowedTools : base.allowedTools
  const outputKinds = custom.outputKinds?.length ? custom.outputKinds : base.outputKinds
  const cacheFiles = custom.cacheFiles?.length ? custom.cacheFiles : base.cacheFiles
  const contextFiles = custom.contextFiles?.length ? custom.contextFiles : base.contextFiles

  return {
    ...base,
    ...custom,
    id: custom.id,
    name: custom.name,
    description: custom.description.trim() ? custom.description : base.description,
    provider: "opencode",
    cliTemplateId: "opencode-cli",
    strategyKind: "custom",
    controlSurface: custom.controlSurface ?? base.controlSurface ?? "customizable",
    origin: custom.origin ?? "custom",
    inheritsFromAgentModeId: custom.inheritsFromAgentModeId ?? base.inheritsFromAgentModeId,
    mode: custom.mode,
    model: custom.model?.trim() ? custom.model : base.model,
    contextMode: custom.contextMode ?? base.contextMode,
    defaultSystemPromptFile: custom.defaultSystemPromptFile?.trim()
      ? custom.defaultSystemPromptFile
      : base.defaultSystemPromptFile,
    defaultSystemPrompt: custom.defaultSystemPrompt?.trim()
      ? custom.defaultSystemPrompt
      : base.defaultSystemPrompt,
    defaultUserPromptBias: custom.defaultUserPromptBias?.trim()
      ? custom.defaultUserPromptBias
      : base.defaultUserPromptBias,
    allowSystemPromptOverride: custom.allowSystemPromptOverride ?? base.allowSystemPromptOverride,
    allowedTools: [...allowedTools],
    outputKinds: [...outputKinds],
    maxIterations: custom.maxIterations ?? base.maxIterations,
    timeoutMs: custom.timeoutMs ?? base.timeoutMs,
    allowFileWrites: custom.allowFileWrites ?? base.allowFileWrites,
    cacheFiles: [...cacheFiles],
    contextFiles: [...contextFiles],
    retryPolicy: custom.retryPolicy ? { ...custom.retryPolicy } : { ...base.retryPolicy },
    constraints: mergeConstraints(base.constraints, custom.constraints),
    defaultRuntimeOverrides: custom.defaultRuntimeOverrides ?? base.defaultRuntimeOverrides,
    fieldPolicy: { ...base.fieldPolicy, ...custom.fieldPolicy },
  }
}

/** Factory: stores custom overrides + inheritsFrom; full merge at read time via resolveMergedAgentModeTemplate. */
export function opencodeCustomTemplate(custom: OpencodeCustomTemplateInput): PlainAgentModeTemplate {
  const inheritsFrom = custom.inheritsFromAgentModeId ?? defaultInheritsFrom(custom.mode)
  return new PlainAgentModeTemplate({
    provider: "opencode",
    cliTemplateId: "opencode-cli",
    strategyKind: "custom",
    controlSurface: custom.controlSurface ?? "customizable",
    origin: custom.origin ?? "custom",
    inheritsFromAgentModeId: inheritsFrom,
    model: custom.model ?? "workflow-selected",
    contextMode: custom.contextMode ?? "inherit",
    defaultSystemPromptFile: custom.defaultSystemPromptFile ?? "",
    defaultSystemPrompt: custom.defaultSystemPrompt ?? "",
    allowSystemPromptOverride: custom.allowSystemPromptOverride ?? true,
    allowedTools: custom.allowedTools ?? [],
    outputKinds: custom.outputKinds ?? [],
    maxIterations: custom.maxIterations ?? 1,
    timeoutMs: custom.timeoutMs ?? 0,
    allowFileWrites: custom.allowFileWrites ?? false,
    cacheFiles: custom.cacheFiles ?? [],
    contextFiles: custom.contextFiles ?? [],
    retryPolicy: custom.retryPolicy ?? { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
    ...custom,
    id: custom.id,
    name: custom.name,
    description: custom.description,
    mode: custom.mode,
    inheritsFromAgentModeId: inheritsFrom,
  })
}

export function resolveMergedAgentModeTemplate(id?: string | null): AgentModeTemplate | undefined {
  if (!id) return undefined
  const chain: AgentModeTemplateData[] = []
  const seen = new Set<string>()
  let current = getAgentModeTemplateInstance(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current.toData())
    current = current.inheritsFromAgentModeId
      ? getAgentModeTemplateInstance(current.inheritsFromAgentModeId)
      : undefined
  }
  if (!chain.length) return undefined
  let merged = chain[0]!
  for (let i = 1; i < chain.length; i++) {
    merged = mergeOpencodeCustomLayer(merged, chain[i]!)
  }
  const { origin: _o, inheritsFromAgentModeId: _i, derivedFromLlmApiTemplateId: _d, fieldPolicy: _f, ...rest } = merged
  return rest
}
