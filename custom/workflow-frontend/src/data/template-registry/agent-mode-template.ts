import type {
  AgentModeTemplate,
  AgentRuntimeMode,
  ArtifactKind,
  ContextMode,
  NodeToolConstraints,
  RetryPolicy,
} from "../console-model"
import type { AgentModeOrigin, AgentModeFieldPolicies } from "../templates/agent-mode-template"
import { createTemplateRegistry, isRecord, requireString } from "./registry"

export interface AgentModeTemplateData extends AgentModeTemplate {
  origin?: AgentModeOrigin
  inheritsFromAgentModeId?: string
  derivedFromLlmApiTemplateId?: string
  fieldPolicy?: AgentModeFieldPolicies
}

export abstract class AgentModeTemplateClassBase {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly provider: AgentModeTemplate["provider"]
  readonly cliTemplateId?: string
  readonly strategyKind?: AgentModeTemplate["strategyKind"]
  readonly controlSurface?: AgentModeTemplate["controlSurface"]
  readonly importedFromBackend?: boolean
  readonly mode: AgentRuntimeMode
  readonly model: string
  readonly contextMode: ContextMode
  readonly defaultSystemPromptFile: string
  readonly defaultSystemPrompt: string
  readonly allowSystemPromptOverride: boolean
  readonly defaultUserPromptBias?: string
  readonly allowedTools: string[]
  readonly outputKinds: ArtifactKind[]
  readonly maxIterations: number
  readonly timeoutMs: number
  readonly allowFileWrites: boolean
  readonly cacheFiles: string[]
  readonly contextFiles: string[]
  readonly retryPolicy: RetryPolicy
  readonly constraints?: NodeToolConstraints
  readonly defaultRuntimeOverrides?: AgentModeTemplateData["defaultRuntimeOverrides"]
  readonly origin?: AgentModeOrigin
  readonly inheritsFromAgentModeId?: string
  readonly derivedFromLlmApiTemplateId?: string
  readonly fieldPolicy?: AgentModeFieldPolicies

  protected constructor(data: AgentModeTemplateData) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.provider = data.provider
    this.cliTemplateId = data.cliTemplateId
    this.strategyKind = data.strategyKind
    this.controlSurface = data.controlSurface
    this.importedFromBackend = data.importedFromBackend
    this.mode = data.mode
    this.model = data.model
    this.contextMode = data.contextMode
    this.defaultSystemPromptFile = data.defaultSystemPromptFile
    this.defaultSystemPrompt = data.defaultSystemPrompt
    this.allowSystemPromptOverride = data.allowSystemPromptOverride
    this.defaultUserPromptBias = data.defaultUserPromptBias
    this.allowedTools = [...data.allowedTools]
    this.outputKinds = [...data.outputKinds]
    this.maxIterations = data.maxIterations
    this.timeoutMs = data.timeoutMs
    this.allowFileWrites = data.allowFileWrites
    this.cacheFiles = [...data.cacheFiles]
    this.contextFiles = [...data.contextFiles]
    this.retryPolicy = { ...data.retryPolicy }
    this.constraints = data.constraints
      ? {
        ...(data.constraints.forcedSkills ? { forcedSkills: [...data.constraints.forcedSkills] } : {}),
        ...(data.constraints.allowedSkills ? { allowedSkills: [...data.constraints.allowedSkills] } : {}),
        ...(data.constraints.forcedMcpServers ? { forcedMcpServers: [...data.constraints.forcedMcpServers] } : {}),
        ...(data.constraints.allowedMcpServers ? { allowedMcpServers: [...data.constraints.allowedMcpServers] } : {}),
        ...(data.constraints.forcedTools ? { forcedTools: [...data.constraints.forcedTools] } : {}),
        ...(data.constraints.allowedTools ? { allowedTools: [...data.constraints.allowedTools] } : {}),
      }
      : undefined
    this.defaultRuntimeOverrides = data.defaultRuntimeOverrides
      ? { ...data.defaultRuntimeOverrides }
      : undefined
    this.origin = data.origin
    this.inheritsFromAgentModeId = data.inheritsFromAgentModeId
    this.derivedFromLlmApiTemplateId = data.derivedFromLlmApiTemplateId
    this.fieldPolicy = data.fieldPolicy ? { ...data.fieldPolicy } : undefined
  }

  toData(): AgentModeTemplateData {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      provider: this.provider,
      cliTemplateId: this.cliTemplateId,
      strategyKind: this.strategyKind,
      controlSurface: this.controlSurface,
      importedFromBackend: this.importedFromBackend,
      mode: this.mode,
      model: this.model,
      contextMode: this.contextMode,
      defaultSystemPromptFile: this.defaultSystemPromptFile,
      defaultSystemPrompt: this.defaultSystemPrompt,
      allowSystemPromptOverride: this.allowSystemPromptOverride,
      defaultUserPromptBias: this.defaultUserPromptBias,
      allowedTools: [...this.allowedTools],
      outputKinds: [...this.outputKinds],
      maxIterations: this.maxIterations,
      timeoutMs: this.timeoutMs,
      allowFileWrites: this.allowFileWrites,
      cacheFiles: [...this.cacheFiles],
      contextFiles: [...this.contextFiles],
      retryPolicy: { ...this.retryPolicy },
      constraints: this.constraints ? { ...this.constraints } : undefined,
      defaultRuntimeOverrides: this.defaultRuntimeOverrides
        ? { ...this.defaultRuntimeOverrides }
        : undefined,
      origin: this.origin,
      inheritsFromAgentModeId: this.inheritsFromAgentModeId,
      derivedFromLlmApiTemplateId: this.derivedFromLlmApiTemplateId,
      fieldPolicy: this.fieldPolicy ? { ...this.fieldPolicy } : undefined,
    }
  }

  toAgentModeTemplate(): AgentModeTemplate {
    const data = this.toData()
    const { origin: _origin, inheritsFromAgentModeId: _inherits, derivedFromLlmApiTemplateId: _derived, fieldPolicy: _fieldPolicy, ...rest } = data
    return { ...rest, cliTemplateId: this.cliTemplateId }
  }
}

export class PlainAgentModeTemplate extends AgentModeTemplateClassBase {
  constructor(data: AgentModeTemplateData) {
    super(data)
  }
}

export class DerivedAgentModeTemplateClass extends AgentModeTemplateClassBase {
  constructor(data: AgentModeTemplateData) {
    super({ ...data, origin: data.origin ?? "agent-mode-bound" })
  }
}

const registry = createTemplateRegistry<AgentModeTemplateClassBase>()

export function registerAgentModeTemplate(template: AgentModeTemplateClassBase | AgentModeTemplateData): AgentModeTemplateClassBase {
  const instance = template instanceof AgentModeTemplateClassBase ? template : new PlainAgentModeTemplate(template)
  registry.register(instance)
  return instance
}

export function listAgentModeTemplateInstances(): AgentModeTemplateClassBase[] {
  return registry.list()
}

export function getAgentModeTemplateInstance(id?: string | null): AgentModeTemplateClassBase | undefined {
  return id ? registry.get(id) : undefined
}

export function listAgentModeTemplates(): AgentModeTemplate[] {
  return registry.list().map((item) => item.toAgentModeTemplate())
}

export function getAgentModeTemplate(id?: string | null): AgentModeTemplate | undefined {
  return getAgentModeTemplateInstance(id)?.toAgentModeTemplate()
}

export function resolveAgentModeInheritance(id?: string | null): AgentModeTemplateData[] {
  const chain: AgentModeTemplateData[] = []
  const seen = new Set<string>()
  let current = getAgentModeTemplateInstance(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current.toData())
    current = getAgentModeTemplateInstance(current.inheritsFromAgentModeId)
  }
  return chain
}

export function renameAgentModeTemplateId(oldId: string, newId: string, patch?: Partial<AgentModeTemplateData>): boolean {
  const current = registry.get(oldId)
  if (!current || !newId.trim() || oldId === newId || registry.has(newId)) return false
  registry.unregister(oldId)
  registerAgentModeTemplate(new PlainAgentModeTemplate({ ...current.toData(), ...patch, id: newId }))
  return true
}

export function importAgentModeTemplateFromJson(json: unknown): AgentModeTemplateClassBase {
  if (!isRecord(json)) throw new Error("Invalid Agent Mode template JSON")
  const retry = isRecord(json.retryPolicy) ? json.retryPolicy : {}
  const template = new PlainAgentModeTemplate({
    id: requireString(json, "id"),
    name: requireString(json, "name"),
    description: typeof json.description === "string" ? json.description : "",
    provider: requireString(json, "provider") as AgentModeTemplate["provider"],
    strategyKind: typeof json.strategyKind === "string" ? json.strategyKind as AgentModeTemplate["strategyKind"] : undefined,
    controlSurface: typeof json.controlSurface === "string" ? json.controlSurface as AgentModeTemplate["controlSurface"] : undefined,
    importedFromBackend: json.importedFromBackend === true,
    mode: (typeof json.mode === "string" ? json.mode : "build") as AgentRuntimeMode,
    model: requireString(json, "model"),
    contextMode: (typeof json.contextMode === "string" ? json.contextMode : "fresh") as ContextMode,
    defaultSystemPromptFile: typeof json.defaultSystemPromptFile === "string" ? json.defaultSystemPromptFile : "",
    defaultSystemPrompt: typeof json.defaultSystemPrompt === "string" ? json.defaultSystemPrompt : "",
    allowSystemPromptOverride: json.allowSystemPromptOverride !== false,
    defaultUserPromptBias: typeof json.defaultUserPromptBias === "string" ? json.defaultUserPromptBias : undefined,
    allowedTools: Array.isArray(json.allowedTools) ? json.allowedTools.map(String) : [],
    outputKinds: Array.isArray(json.outputKinds) ? json.outputKinds as ArtifactKind[] : ["markdown"],
    maxIterations: typeof json.maxIterations === "number" ? json.maxIterations : 8,
    timeoutMs: typeof json.timeoutMs === "number" ? json.timeoutMs : 240000,
    allowFileWrites: json.allowFileWrites === true,
    cacheFiles: Array.isArray(json.cacheFiles) ? json.cacheFiles.map(String) : [],
    contextFiles: Array.isArray(json.contextFiles) ? json.contextFiles.map(String) : [],
    retryPolicy: {
      attempts: typeof retry.attempts === "number" ? retry.attempts : 1,
      backoffMs: typeof retry.backoffMs === "number" ? retry.backoffMs : 0,
      continueOnPartialFailure: retry.continueOnPartialFailure === true,
    },
    origin: typeof json.origin === "string" ? json.origin as AgentModeOrigin : undefined,
    inheritsFromAgentModeId: typeof json.inheritsFromAgentModeId === "string" ? json.inheritsFromAgentModeId : undefined,
    derivedFromLlmApiTemplateId: typeof json.derivedFromLlmApiTemplateId === "string" ? json.derivedFromLlmApiTemplateId : undefined,
  })
  registerAgentModeTemplate(template)
  return template
}
