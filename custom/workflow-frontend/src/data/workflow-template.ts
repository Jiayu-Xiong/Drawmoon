import type {
  AgentMode,
  AgentNodeConfig,
  ContextMode,
  ProviderId,
  SessionPolicy,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from "@opencode-ai/backend-opencode/schema/types"

export type StepStatus = "waiting" | "running" | "success" | "cached" | "failed"
export type StepTransport = "belt" | "tube" | "exit"

export interface TemplateStep {
  id: string
  label: string
  meaning: string
  provider: ProviderId
  mode: AgentMode
  contextMode: ContextMode
  transport: StepTransport
  prompt: string
  promptFile?: string
  plannerFile?: string
  subagentFiles: string[]
  contextFiles?: string[]
  cacheFiles: string[]
  x: number
  y: number
  status: StepStatus
  duration: string
  maxIterations?: number
  allowFileWrites?: boolean
  customCommand?: string
  customArgs?: string[]
  sessionPolicy?: SessionPolicy
  sessionKey?: string
  bindsToNodeId?: string
  turnOrder?: number
}

export interface TemplateDefaults {
  provider: ProviderId
  mode: AgentMode
  contextMode: ContextMode
  maxIterations: number
  allowFileWrites: boolean
  systemPromptFile: string
  contextFiles: string[]
}

export interface WorkflowTemplateData {
  id: string
  name: string
  description: string
  cwd: string
  cacheMode: string
  defaultSubagent: TemplateDefaults
  steps: TemplateStep[]
  edges: WorkflowEdge[]
}

export interface WorkflowRunSummary {
  id: string
  templateId: string
  title: string
  status: "running" | "success" | "failed" | "queued"
  startedAt: string
  duration: string
  cacheHits: number
  currentStepId: string
}

export abstract class WorkflowTemplateBase {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly cwd: string
  readonly cacheMode: string
  readonly defaultSubagent: TemplateDefaults
  readonly steps: TemplateStep[]
  readonly edges: WorkflowEdge[]

  protected constructor(data: WorkflowTemplateData) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.cwd = data.cwd
    this.cacheMode = data.cacheMode
    this.defaultSubagent = data.defaultSubagent
    this.steps = data.steps
    this.edges = data.edges
  }

  toNode(step: TemplateStep): WorkflowNode {
    return {
      id: step.id,
      label: step.label,
      position: { x: step.x, y: step.y },
      config: this.toNodeConfig(step),
    }
  }

  toNodeConfig(step: TemplateStep): AgentNodeConfig {
    return {
      provider: step.provider,
      mode: step.mode,
      cwd: this.cwd,
      prompt: step.prompt,
      contextMode: step.contextMode,
      timeoutMs: 120000,
      maxIterations: step.maxIterations ?? this.defaultSubagent.maxIterations,
      allowFileWrites: step.allowFileWrites ?? this.defaultSubagent.allowFileWrites,
      customCommand: step.customCommand,
      customArgs: step.customArgs,
      systemPromptFile: this.defaultSubagent.systemPromptFile,
      buildPromptFile: step.promptFile,
      plannerFile: step.plannerFile,
      subagentFiles: step.subagentFiles,
      contextFiles: step.contextFiles ?? this.defaultSubagent.contextFiles,
      cacheFiles: step.cacheFiles,
    }
  }

  toGraph(): WorkflowGraph {
    return {
      nodes: this.steps.map((step) => this.toNode(step)),
      edges: this.edges.map((edge) => ({ ...edge })),
    }
  }
}
