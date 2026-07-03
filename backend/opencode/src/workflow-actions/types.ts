import type { AgentMode, AgentNodeConfig, CacheMode, ContextMode, ProviderId, SessionPolicy } from "../schema/types.js"

export type WorkflowActionKind =
  | "agent-mode"
  | "llm-api"
  | "cli"
  | "tool"
  | "human-gate"
  | "inquiry"
  | "condition"
  | "merge"
  | "parallel"
  | "loop"
  | "artifact"

export type WorkflowActionSessionPolicy = "fresh" | "inherit" | "shared" | "fork" | "summary" | "artifacts"

export type LegacyAgentNodeConfig = AgentNodeConfig & Partial<{
  id: string
  label: string
  tools: string[]
  forcedSkills: string[]
  allowedSkills: string[]
  forcedMcpServers: string[]
  allowedMcpServers: string[]
  forcedTools: string[]
  allowedTools: string[]
  agentModeId: string
}>

export interface WorkflowActionSelector {
  nodeId?: string
  actionId?: string
  path?: string
  expression?: string
}

export interface WorkflowArtifactSelector {
  artifactId?: string
  name?: string
  path?: string
  mime?: string
}

export interface WorkflowActionInputs {
  prompt?: string
  upstreamSelectors?: WorkflowActionSelector[]
  files?: string[]
  artifacts?: WorkflowArtifactSelector[]
  contextFiles?: string[]
  cacheFiles?: string[]
  tools?: string[]
}

export interface WorkflowActionBinding {
  agentModeId?: string
  llmApiTemplateId?: string
  providerId?: ProviderId | string
  commandId?: string
  toolId?: string
}

export interface WorkflowActionOverrides extends Record<string, unknown> {
  provider?: ProviderId | string
  mode?: AgentMode | string
  model?: string
  cwd?: string
  contextMode?: ContextMode | string
  systemPromptFile?: string
  buildPromptFile?: string
  plannerFile?: string
  subagentFiles?: string[]
  customCommand?: string
  customArgs?: string[]
  maxIterations?: number
  timeoutMs?: number
  allowFileWrites?: boolean
}

export interface WorkflowActionSession {
  policy: WorkflowActionSessionPolicy
  sessionKey?: string
  sessionId?: string
}

export interface WorkflowActionConstraints {
  forcedSkills?: string[]
  allowedSkills?: string[]
  forcedMcpServers?: string[]
  allowedMcpServers?: string[]
  forcedTools?: string[]
  allowedTools?: string[]
}

export interface WorkflowActionRetryPolicy {
  attempts: number
  backoffMs: number
  continueOnPartialFailure?: boolean
}

export interface WorkflowActionCachePolicy {
  mode: CacheMode
  files?: string[]
}

export interface WorkflowActionConcurrencyPolicy {
  group?: string
  maxParallel?: number
}

export interface WorkflowActionExecution {
  timeoutMs?: number
  retry?: WorkflowActionRetryPolicy
  cache?: WorkflowActionCachePolicy
  concurrency?: WorkflowActionConcurrencyPolicy
  allowWrites?: boolean
  maxIterations?: number
}

export interface WorkflowActionArtifactRule {
  operation: "read" | "write" | "append" | "copy" | "move" | "delete" | "link"
  selector?: WorkflowArtifactSelector
  path?: string
  required?: boolean
}

export interface WorkflowActionOutput {
  expectedFormat?: "text" | "json" | "markdown" | "artifact" | "none" | string
  artifactRules?: WorkflowActionArtifactRule[]
  summaryPolicy?: "none" | "brief" | "detailed" | "inherit" | string
}

export interface WorkflowHumanGateSpec {
  approvalText?: string
  gateLabel?: string
}

export interface WorkflowInquirySpec {
  promptText?: string
  inquiryLabel?: string
}

export interface WorkflowConditionSpec {
  expression?: string
  selector?: WorkflowActionSelector
}

export interface WorkflowMergeSpec {
  strategy?: "all" | "first-success" | "latest" | "manual" | string
}

export interface WorkflowParallelSpec {
  childRefs?: string[]
}

export interface WorkflowLoopSpec {
  condition?: string
  maxIterations?: number
}

export interface WorkflowArtifactSpec {
  operation?: WorkflowActionArtifactRule["operation"]
  selector?: WorkflowArtifactSelector
  path?: string
}

export interface WorkflowAction {
  id: string
  kind: WorkflowActionKind
  label: string
  inputs: WorkflowActionInputs
  binding: WorkflowActionBinding
  overrides: WorkflowActionOverrides
  session: WorkflowActionSession
  constraints: WorkflowActionConstraints
  execution: WorkflowActionExecution
  output: WorkflowActionOutput
  humanGate?: WorkflowHumanGateSpec
  inquiry?: WorkflowInquirySpec
  condition?: WorkflowConditionSpec
  merge?: WorkflowMergeSpec
  parallel?: WorkflowParallelSpec
  loop?: WorkflowLoopSpec
  artifact?: WorkflowArtifactSpec
  metadata?: Record<string, unknown>
}

export type WorkflowActionTemplateData<TKind extends WorkflowActionKind = WorkflowActionKind> = Omit<WorkflowAction, "kind"> & {
  kind: TKind
}

export abstract class WorkflowActionTemplateBase<TKind extends WorkflowActionKind> {
  readonly id: string
  readonly kind: TKind
  readonly label: string
  readonly inputs: WorkflowActionInputs
  readonly binding: WorkflowActionBinding
  readonly overrides: WorkflowActionOverrides
  readonly session: WorkflowActionSession
  readonly constraints: WorkflowActionConstraints
  readonly execution: WorkflowActionExecution
  readonly output: WorkflowActionOutput
  readonly humanGate?: WorkflowHumanGateSpec
  readonly inquiry?: WorkflowInquirySpec
  readonly condition?: WorkflowConditionSpec
  readonly merge?: WorkflowMergeSpec
  readonly parallel?: WorkflowParallelSpec
  readonly loop?: WorkflowLoopSpec
  readonly artifact?: WorkflowArtifactSpec
  readonly metadata?: Record<string, unknown>

  protected constructor(data: WorkflowActionTemplateData<TKind>) {
    this.id = data.id
    this.kind = data.kind
    this.label = data.label
    this.inputs = data.inputs
    this.binding = data.binding
    this.overrides = data.overrides
    this.session = data.session
    this.constraints = data.constraints
    this.execution = data.execution
    this.output = data.output
    this.humanGate = data.humanGate
    this.inquiry = data.inquiry
    this.condition = data.condition
    this.merge = data.merge
    this.parallel = data.parallel
    this.loop = data.loop
    this.artifact = data.artifact
    this.metadata = data.metadata
  }

  toAction(overrides: Partial<WorkflowAction> = {}): WorkflowAction & { kind: TKind } {
    return mergeWorkflowAction(this, overrides) as WorkflowAction & { kind: TKind }
  }
}

type TemplateConstructorData<TKind extends WorkflowActionKind> = Omit<WorkflowActionTemplateData<TKind>, "kind">

export class AgentModeWorkflowActionTemplate extends WorkflowActionTemplateBase<"agent-mode"> {
  constructor(data: TemplateConstructorData<"agent-mode">) {
    super({ ...data, kind: "agent-mode" })
  }
}

export class LlmApiWorkflowActionTemplate extends WorkflowActionTemplateBase<"llm-api"> {
  constructor(data: TemplateConstructorData<"llm-api">) {
    super({ ...data, kind: "llm-api" })
  }
}

export class CliWorkflowActionTemplate extends WorkflowActionTemplateBase<"cli"> {
  constructor(data: TemplateConstructorData<"cli">) {
    super({ ...data, kind: "cli" })
  }
}

export class ToolWorkflowActionTemplate extends WorkflowActionTemplateBase<"tool"> {
  constructor(data: TemplateConstructorData<"tool">) {
    super({ ...data, kind: "tool" })
  }
}

export class HumanGateWorkflowActionTemplate extends WorkflowActionTemplateBase<"human-gate"> {
  constructor(data: TemplateConstructorData<"human-gate">) {
    super({ ...data, kind: "human-gate" })
  }
}

export class InquiryWorkflowActionTemplate extends WorkflowActionTemplateBase<"inquiry"> {
  constructor(data: TemplateConstructorData<"inquiry">) {
    super({ ...data, kind: "inquiry" })
  }
}

export class ConditionWorkflowActionTemplate extends WorkflowActionTemplateBase<"condition"> {
  constructor(data: TemplateConstructorData<"condition">) {
    super({ ...data, kind: "condition" })
  }
}

export class MergeWorkflowActionTemplate extends WorkflowActionTemplateBase<"merge"> {
  constructor(data: TemplateConstructorData<"merge">) {
    super({ ...data, kind: "merge" })
  }
}

export class ParallelWorkflowActionTemplate extends WorkflowActionTemplateBase<"parallel"> {
  constructor(data: TemplateConstructorData<"parallel">) {
    super({ ...data, kind: "parallel" })
  }
}

export class LoopWorkflowActionTemplate extends WorkflowActionTemplateBase<"loop"> {
  constructor(data: TemplateConstructorData<"loop">) {
    super({ ...data, kind: "loop" })
  }
}

export class ArtifactWorkflowActionTemplate extends WorkflowActionTemplateBase<"artifact"> {
  constructor(data: TemplateConstructorData<"artifact">) {
    super({ ...data, kind: "artifact" })
  }
}

export function sessionPolicyFromLegacy(policy: SessionPolicy | ContextMode | undefined): WorkflowActionSessionPolicy {
  return policy ?? "fresh"
}

function mergeWorkflowAction(base: WorkflowAction, overrides: Partial<WorkflowAction>): WorkflowAction {
  return {
    ...base,
    ...overrides,
    inputs: { ...base.inputs, ...overrides.inputs },
    binding: { ...base.binding, ...overrides.binding },
    overrides: { ...base.overrides, ...overrides.overrides },
    session: { ...base.session, ...overrides.session },
    constraints: { ...base.constraints, ...overrides.constraints },
    execution: { ...base.execution, ...overrides.execution },
    output: { ...base.output, ...overrides.output },
  }
}
