import type { AgentModeTemplate } from "./console-model"

export interface OpencodeDerivedAgentModeSpec {
  id: string
  name: string
  description: string
  provider: "opencode"
  cliTemplateId: "opencode-cli"
  strategyKind: "cli"
  controlSurface: "customizable"
  origin: "native-cli"
  mode: AgentModeTemplate["mode"]
  model: string
  contextMode: AgentModeTemplate["contextMode"]
  defaultSystemPromptFile: string
  defaultSystemPrompt: string
  allowSystemPromptOverride: boolean
  allowedTools: string[]
  outputKinds: AgentModeTemplate["outputKinds"]
  maxIterations: number
  timeoutMs: number
  allowFileWrites: boolean
  editableFields: string[]
  sourceVersion: string | null
  sourcePath: string | null
}

export function agentModeFromOpencodeDerived(spec: OpencodeDerivedAgentModeSpec): AgentModeTemplate {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    provider: spec.provider,
    cliTemplateId: spec.cliTemplateId,
    strategyKind: "cli",
    controlSurface: "customizable",
    mode: spec.mode,
    model: spec.model,
    contextMode: spec.contextMode,
    defaultSystemPromptFile: spec.defaultSystemPromptFile,
    defaultSystemPrompt: spec.defaultSystemPrompt,
    allowSystemPromptOverride: spec.allowSystemPromptOverride,
    allowedTools: [...spec.allowedTools],
    outputKinds: [...spec.outputKinds],
    maxIterations: spec.maxIterations,
    timeoutMs: spec.timeoutMs,
    allowFileWrites: spec.allowFileWrites,
    cacheFiles: [],
    contextFiles: [],
    retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
  }
}
