import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../api"
import type {
  AgentModeTemplate,
  CliProviderTemplate,
  ExecutionMode,
  LlmApiTemplate,
  NodeState,
  WorkflowEntity,
  WorkflowNode,
  WorkflowRunRecord,
  WorkflowStatus,
  WorkflowTemplate,
} from "../console-model"
import { getCliTemplate } from "../cli-templates"
import { resolveExecutorBinding } from "../node-executor-binding"
import {
  getAgentModeTemplate,
  getLlmApiTemplate,
  getWorkflowUiTemplate,
  listWorkflowUiTemplates,
  resolveAgentModeInheritance,
  type AgentModeTemplateData,
} from "../template-registry"
import { resolveWorkflowTemplate, parseWorkflowTemplateSnapshot } from "../workflow-template-snapshot"
import type { WorkflowRunListItem } from "../../api"
import { resolveEntityTokenUsage } from "./token-usage"

export interface ResolvedNodeExecutor {
  executionMode: ExecutionMode
  provider: string
  label: string
  agentMode?: AgentModeTemplate
  llmApi?: LlmApiTemplate
  cli?: CliProviderTemplate
}

export interface WorkflowEntityContext {
  template: WorkflowTemplate
  resolvedNodes: Array<{ node: WorkflowNode; executor: ResolvedNodeExecutor }>
}

export class WorkflowEntityInstance {
  readonly id: string
  readonly templateId: string
  readonly name: string
  readonly status: WorkflowStatus
  readonly workingDirectory: string
  readonly currentColumn: number
  readonly currentStageId: string
  readonly runtime: string
  readonly model: string
  readonly queuePosition: number
  readonly progress: number
  readonly columnStates: WorkflowEntity["columnStates"]
  readonly activeAgents: WorkflowEntity["activeAgents"]
  readonly logs: WorkflowEntity["logs"]
  readonly filesTouched: WorkflowEntity["filesTouched"]
  readonly artifacts: WorkflowEntity["artifacts"]
  readonly toolsUsed: WorkflowEntity["toolsUsed"]
  readonly latestOutput: string
  readonly sourceRecordId?: string
  private readonly _templateSnapshot?: WorkflowTemplate
  private _cachedEntity: WorkflowEntity | null = null
  private _cachedEntityAt = 0

  constructor(entity: WorkflowEntity, options?: { sourceRecordId?: string; templateSnapshot?: WorkflowTemplate }) {
    this.id = entity.id
    this.templateId = entity.templateId
    this.name = entity.name
    this.status = entity.status
    this.workingDirectory = entity.workingDirectory
    this.currentColumn = entity.currentColumn
    this.currentStageId = entity.currentStageId
    this.runtime = entity.runtime
    this.model = entity.model
    this.queuePosition = entity.queuePosition
    this.progress = entity.progress
    this.columnStates = entity.columnStates.map((item) => ({ ...item }))
    this.activeAgents = entity.activeAgents.map((item) => ({ ...item, tools: [...item.tools] }))
    this.logs = entity.logs.map((item) => ({ ...item }))
    this.filesTouched = [...entity.filesTouched]
    this.artifacts = entity.artifacts.map((item) => ({ ...item }))
    this.toolsUsed = [...entity.toolsUsed]
    this.latestOutput = entity.latestOutput
    this.sourceRecordId = options?.sourceRecordId
    this._templateSnapshot = options?.templateSnapshot
  }

  get templateSnapshot(): WorkflowTemplate | undefined {
    return this._templateSnapshot
  }

  get templateMissingFromRegistry(): boolean {
    return !getWorkflowUiTemplate(this.templateId) && Boolean(this._templateSnapshot)
  }

  get template(): WorkflowTemplate {
    const resolved = resolveWorkflowTemplate(this.templateId, this._templateSnapshot)
      ?? getWorkflowUiTemplate("journal-paper-default")
      ?? listWorkflowUiTemplates()[0]!
    return resolved
  }

  get context(): WorkflowEntityContext {
    const template = this.template
    return {
      template,
      resolvedNodes: template.nodes.map((node) => ({
        node,
        executor: resolveNodeExecutor(node, template),
      })),
    }
  }

  toEntity(): WorkflowEntity {
    const now = Date.now()
    if (this._cachedEntity && now - this._cachedEntityAt < 500) return this._cachedEntity
    this._cachedEntity = {
      id: this.id,
      templateId: this.templateId,
      name: this.name,
      status: this.status,
      workingDirectory: this.workingDirectory,
      currentColumn: this.currentColumn,
      currentStageId: this.currentStageId,
      runtime: this.runtime,
      model: this.model,
      queuePosition: this.queuePosition,
      progress: this.progress,
      columnStates: this.columnStates.map((item) => ({ ...item })),
      activeAgents: this.activeAgents.map((item) => ({ ...item, tools: [...item.tools] })),
      logs: this.logs.map((item) => ({ ...item })),
      filesTouched: [...this.filesTouched],
      artifacts: this.artifacts.map((item) => ({ ...item })),
      toolsUsed: [...this.toolsUsed],
      latestOutput: this.latestOutput,
    }
    this._cachedEntityAt = now
    return this._cachedEntity!
  }
}

const entityRegistry = new Map<string, WorkflowEntityInstance>()
const entityUiSignatures = new Map<string, string>()
const listeners = new Set<() => void>()

function entityUiSignature(entity: WorkflowEntity): string {
  return JSON.stringify({
    status: entity.status,
    progress: entity.progress,
    currentColumn: entity.currentColumn,
    currentStageId: entity.currentStageId,
    columnStates: entity.columnStates.map((item) => [item.columnId, item.state, item.done]),
    active: entity.activeAgents.map((item) => [item.currentNodeId, item.status]),
    latest: entity.latestOutput.slice(0, 160),
  })
}

function emitEntityChange() {
  listeners.forEach((listener) => listener())
}

function registerWorkflowEntityIfChanged(instance: WorkflowEntityInstance) {
  const signature = entityUiSignature(instance.toEntity())
  const prev = entityUiSignatures.get(instance.id)
  if (prev === signature) return getWorkflowEntityInstance(instance.id) ?? instance

  entityUiSignatures.set(instance.id, signature)
  entityRegistry.set(instance.id, instance)
  emitEntityChange()
  return instance
}

export function subscribeWorkflowEntities(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function registerWorkflowEntity(entity: WorkflowEntity | WorkflowEntityInstance, options?: { sourceRecordId?: string; templateSnapshot?: WorkflowTemplate }) {
  const instance = entity instanceof WorkflowEntityInstance
    ? entity
    : new WorkflowEntityInstance(entity, options)
  return registerWorkflowEntityIfChanged(instance)
}

export function updateWorkflowEntity(id: string, patch: Partial<Omit<WorkflowEntity, "id">>) {
  const current = entityRegistry.get(id)
  if (!current) return undefined
  const next = new WorkflowEntityInstance({ ...current.toEntity(), ...patch }, { sourceRecordId: current.sourceRecordId })
  entityRegistry.set(id, next)
  emitEntityChange()
  return next
}

export function unregisterWorkflowEntity(id: string) {
  const deleted = entityRegistry.delete(id)
  entityUiSignatures.delete(id)
  if (deleted) emitEntityChange()
  return deleted
}

export function getWorkflowEntityInstance(id: string) {
  return entityRegistry.get(id)
}

export function listWorkflowEntityInstances() {
  return Array.from(entityRegistry.values())
}

export function listWorkflowEntities(): WorkflowEntity[] {
  // Return references to avoid deep-copying heavy arrays on every call.
  // Callers that need mutable copies should clone explicitly.
  return listWorkflowEntityInstances().map((item) => item.toEntity())
}

/** Re-resolve template graphs after ~/.drawmoon templates finish loading. */
export function rebindWorkflowEntityTemplates() {
  for (const instance of listWorkflowEntityInstances()) {
    const template = getWorkflowUiTemplate(instance.templateId)
    if (!template) continue
    const entity = instance.toEntity()
    const rebound = new WorkflowEntityInstance({
      ...entity,
      workingDirectory: template.workingDirectory || entity.workingDirectory,
      columnStates: template.columns.map((column) => {
        const prev = entity.columnStates.find((item) => item.columnId === column.id)
        return prev ?? { columnId: column.id, state: "waiting" as const, parallel: 1, done: 0 }
      }),
    }, { sourceRecordId: instance.sourceRecordId })
    entityRegistry.set(rebound.id, rebound)
  }
  emitEntityChange()
}

export function workflowEntityTemplate(entity: WorkflowEntity | WorkflowEntityInstance): WorkflowTemplate {
  const instance = entity instanceof WorkflowEntityInstance ? entity : getWorkflowEntityInstance(entity.id)
  return instance?.template ?? getWorkflowUiTemplate(entity.templateId) ?? listWorkflowUiTemplates()[0]!
}

function mapRuntimeStatus(status: string): WorkflowStatus {
  if (status === "running") return "running"
  if (status === "queued" || status === "pending") return "queued"
  if (status === "failed") return "failed"
  if (status === "completed" || status === "success") return "completed"
  if (status === "paused") return "paused"
  if (status === "looping") return "looping"
  return "queued"
}

function mapNodeState(status?: string): NodeState {
  if (status === "running") return "running"
  if (status === "completed" || status === "success") return "done"
  if (status === "failed") return "failed"
  if (status === "queued" || status === "pending") return "queued"
  if (status === "waiting") return "waiting"
  return "waiting"
}

export function resolveNodeExecutor(node: WorkflowNode, template: WorkflowTemplate): ResolvedNodeExecutor {
  const binding = resolveExecutorBinding(node, template)
  const executionMode = node.executionMode ?? "agent-mode"

  if (executionMode === "tool" || executionMode === "human-gate" || executionMode === "inquiry") {
    return {
      executionMode,
      provider: "custom",
      label: executionMode,
    }
  }

  if (binding.isDirectApi || executionMode === "llm-api") {
    const llmApi = getLlmApiTemplate(binding.llmApiTemplateId ?? node.llmApiTemplateId ?? template.defaultLlmApiTemplateId)
    const agentMode = getAgentModeTemplate(binding.agentModeId)
    return {
      executionMode: "llm-api",
      provider: llmApi?.provider ?? "custom",
      label: binding.isDirectApi
        ? (agentMode?.name ?? "Direct API")
        : (llmApi?.name ?? agentMode?.name ?? "LLM API"),
      llmApi,
      agentMode,
    }
  }

  const cliId = binding.cliTemplateId ?? node.cliTemplateId
  const cli = cliId ? getCliTemplate(cliId) : undefined
  if (cli) {
    const chain = resolveAgentModeInheritance(binding.agentModeId)
    const agentMode = chain.at(-1)
    return {
      executionMode: executionMode === "cli" ? "cli" : "agent-mode",
      provider: cli.providerId,
      label: agentMode?.name ?? cli.name,
      cli,
      agentMode: agentMode ? toAgentModeTemplate(agentMode) : getAgentModeTemplate(binding.agentModeId),
    }
  }

  const chain = resolveAgentModeInheritance(binding.agentModeId)
  const agentMode = chain.at(-1)
  return {
    executionMode,
    provider: agentMode?.provider ?? "custom",
    label: chain.map((item) => item.name).join(" → ") || "Agent Mode",
    agentMode: agentMode ? toAgentModeTemplate(agentMode) : getAgentModeTemplate(binding.agentModeId),
  }
}

function toAgentModeTemplate(mode: AgentModeTemplateData): AgentModeTemplate {
  const { origin: _origin, inheritsFromAgentModeId: _inherits, derivedFromLlmApiTemplateId: _derived, fieldPolicy: _fieldPolicy, ...rest } = mode
  return rest
}


function buildColumnStates(template: WorkflowTemplate, record: WorkflowRunRecord | RuntimeWorkflowRunRecord, status: WorkflowStatus) {
  const currentColumn = "currentColumn" in record && typeof record.currentColumn === "number"
    ? record.currentColumn
    : Math.max(1, Math.min(template.columns.length, Math.floor(((record as RuntimeWorkflowRunRecord).progress?.percent ?? ("progress" in record ? record.progress ?? 0 : 0)) / Math.max(1, 100 / template.columns.length)) + 1))

  return template.columns.map((column, index) => {
    const columnIndex = index + 1
    let state: NodeState = "waiting"
    if (columnIndex < currentColumn) state = "done"
    else if (columnIndex === currentColumn) {
      state = status === "running" || status === "looping" ? "running" : status === "queued" ? "queued" : status === "failed" ? "failed" : "waiting"
    }
    const parallel = column.lanes.reduce((sum, lane) => sum + lane.nodeIds.length, 0)
    const done = state === "done" ? parallel : 0
    return { columnId: column.id, state, parallel: Math.max(1, parallel), done }
  })
}

function buildActiveAgents(template: WorkflowTemplate, run: RuntimeWorkflowRunRecord, status: WorkflowStatus) {
  if (!run.nodeStates) return [] as WorkflowEntity["activeAgents"]
  const runningNodeIds = Object.entries(run.nodeStates)
    .filter(([, state]) => state.status === "running")
    .map(([nodeId]) => nodeId)
  return runningNodeIds.flatMap((nodeId) => {
    const node = template.nodes.find((item) => item.id === nodeId)
    if (!node) return []
    const executor = resolveNodeExecutor(node, template)
    const nodeResult = run.nodeResults?.[nodeId]
    const outText = nodeResult?.text ?? nodeResult?.summary ?? ""
    const outTokens = Math.ceil(outText.length / 4)
    const inTokens = Math.ceil((node.promptPreview ?? "").length / 4)
    return [{
      id: `runtime-${run.id}-${nodeId}`,
      agentId: node.agentId,
      name: executor.label,
      role: executor.executionMode,
      status: mapNodeState(run.nodeStates?.[nodeId]?.status),
      currentNodeId: nodeId,
      promptTitle: node.promptTitle,
      promptPreview: node.promptPreview,
      lastOutput: nodeResult?.summary ?? nodeResult?.text ?? node.promptPreview,
      tokens: inTokens + outTokens,
      tokenUsage: {
        totalTokens: inTokens + outTokens,
        inputTokens: inTokens,
        outputTokens: outTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      tools: executor.agentMode?.allowedTools ?? (executor.llmApi ? ["http_llm_call"] : executor.cli ? [executor.cli.promptCommand.id] : []),
    }]
  }).slice(0, 4)
}

export function entityFromRunRecord(record: WorkflowRunRecord, queuePosition: number): WorkflowEntityInstance {
  const template = getWorkflowUiTemplate(record.templateId) ?? listWorkflowUiTemplates()[0]!
  const status = record.executionStatus
  const currentColumn = record.currentColumn ?? 1
  const currentStageId = template.columns[currentColumn - 1]?.stageId ?? template.stages[0]?.id ?? ""
  const latestPrompt = record.promptHistory[record.promptHistory.length - 1]?.prompt ?? "No prompt history loaded."
  const primaryNode = template.nodes.find((n) => n.id === "architect-plan") ?? template.nodes[0]
  const primaryExecutor = primaryNode ? resolveNodeExecutor(primaryNode, template) : undefined
  const displayModel = primaryNode?.runtimeOverrides?.model?.trim()
    || primaryExecutor?.llmApi?.model
    || (primaryExecutor?.agentMode?.model && !/workflow-selected/i.test(primaryExecutor.agentMode.model) ? primaryExecutor.agentMode.model : undefined)
    || primaryExecutor?.cli?.models[0]?.id
    || "workflow template default"

  const entity = new WorkflowEntityInstance({
    id: record.id,
    templateId: record.templateId,
    name: record.name,
    status,
    workingDirectory: template.workingDirectory,
    currentColumn,
    currentStageId,
    runtime: "backend-opencode",
    model: displayModel,
    queuePosition,
    progress: record.progress ?? 0,
    columnStates: buildColumnStates(template, record, status),
    activeAgents: record.templateId === "journal-paper-default" && status === "running" ? [
      { id: "ai-research", agentId: "agent-research", name: "Research Mapper", role: "related work researcher", status: "running", currentNodeId: "n7", promptTitle: "Research map", promptPreview: "Research related work.", lastOutput: "Collected first related-work clusters.", tokens: 4820, tools: ["search_index", "bibtex_write"] },
      { id: "ai-writer", agentId: "agent-paper", name: "Paper Writer", role: "latex section writer", status: "running", currentNodeId: "n9", promptTitle: "Method", promptPreview: "Write method section.", lastOutput: "Drafting method assumptions.", tokens: 6120, tools: ["read_file", "latex_patch"] },
    ] : [],
    logs: record.promptHistory.map((entry) => ({ time: entry.at.slice(-5), level: "info" as const, message: entry.prompt })),
    filesTouched: record.templateId === "journal-paper-default" ? ["paper/main.tex", "paper/sections/method.tex", "paper/references.bib"] : [],
    artifacts: record.templateId === "journal-paper-default" ? [
      { id: "draft-pdf", label: "draft.pdf", kind: "pdf", path: "build/draft.pdf", href: "/workflow-output/journal-paper/build/draft.pdf" },
    ] : [],
    toolsUsed: record.templateId === "journal-paper-default" ? ["read_file", "latex_patch", "search_index", "bibtex_write"] : [],
    latestOutput: record.templateId === "journal-paper-default" ? "Parallel writing is producing research notes and methodology text." : latestPrompt,
  }, { sourceRecordId: record.id })

  registerWorkflowEntityIfChanged(entity)
  return entity
}

export function entityFromRuntimeRun(run: RuntimeWorkflowRunRecord, queuePosition: number): WorkflowEntityInstance {
  const snapshot = parseWorkflowTemplateSnapshot(run.history?.workflowTemplateSnapshot)
  const template = resolveWorkflowTemplate(run.templateId, snapshot) ?? listWorkflowUiTemplates()[0]!
  const status = mapRuntimeStatus(run.status)
  const history = run.history ?? { selectedAgentModes: {} }
  const currentColumn = Math.max(1, Math.min(template.columns.length, run.progress.completedNodes + (run.progress.runningNodes > 0 ? 1 : 0) || 1))
  const currentStageId = template.columns[currentColumn - 1]?.stageId ?? template.stages[0]?.id ?? ""
  const runningAgents = buildActiveAgents(template, run, status)
  const primaryNode = template.nodes.find((n) => n.id === "architect-plan") ?? template.nodes[0]
  const primaryExecutor = primaryNode ? resolveNodeExecutor(primaryNode, template) : undefined
  const displayModel = primaryNode?.runtimeOverrides?.model?.trim()
    || primaryExecutor?.llmApi?.model
    || (primaryExecutor?.agentMode?.model && !/workflow-selected/i.test(primaryExecutor.agentMode.model) ? primaryExecutor.agentMode.model : undefined)
    || run.defaultLabel

  const entity = new WorkflowEntityInstance({
    id: run.id,
    templateId: run.templateId,
    name: run.name,
    status,
    workingDirectory: history.workingDirectory ?? template.workingDirectory,
    currentColumn,
    currentStageId,
    runtime: "backend-opencode",
    model: displayModel,
    queuePosition,
    progress: run.progress.percent,
    columnStates: buildColumnStates(template, run, status),
    activeAgents: runningAgents,
    logs: history.prompt ? [{ time: new Date(run.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), level: "info", message: history.prompt }] : [],
    filesTouched: (history.artifacts ?? []).map((item) => item.path),
    artifacts: (history.artifacts ?? []).map((item) => ({
      id: item.nodeId,
      label: item.label,
      kind: item.kind === "pdf" ? "pdf" as const : item.kind === "markdown" ? "markdown" as const : "other" as const,
      path: item.path,
      href: item.href,
    })),
    toolsUsed: runningAgents.flatMap((agent) => agent.tools),
    latestOutput: history.finalOutput ?? run.error ?? history.prompt ?? "Runtime workflow loaded.",
    tokenUsage: resolveEntityTokenUsage(run, template),
  }, { sourceRecordId: run.id, templateSnapshot: snapshot ?? undefined })

  registerWorkflowEntityIfChanged(entity)
  return entity
}

export function entityFromRunListItem(run: WorkflowRunListItem): WorkflowEntityInstance {
  const template = getWorkflowUiTemplate(run.templateId) ?? listWorkflowUiTemplates()[0]!
  const status = mapRuntimeStatus(run.status)
  const completed = run.progress.completedNodes
  const running = run.progress.runningNodes > 0
  const currentNodeIds = run.currentNodeIds ?? []
  const currentColumn = Math.max(1, Math.min(template.columns.length, completed + (running ? 1 : 0) || 1))
  const currentStageId = template.columns[currentColumn - 1]?.stageId ?? template.stages[0]?.id ?? ""
  const primaryExecutor = template.nodes[0] ? resolveNodeExecutor(template.nodes[0], template) : undefined

  const activeAgents = currentNodeIds.flatMap((nodeId) => {
    const node = template.nodes.find((item) => item.id === nodeId)
    if (!node) return []
    const executor = resolveNodeExecutor(node, template)
    return [{
      id: `runtime-list-${run.id}-${nodeId}`,
      agentId: node.agentId,
      name: executor.label,
      role: executor.executionMode,
      status: "running" as const,
      currentNodeId: nodeId,
      promptTitle: node.promptTitle,
      promptPreview: node.promptPreview,
      lastOutput: node.promptPreview,
      tokens: 0,
      tools: executor.agentMode?.allowedTools ?? (executor.llmApi ? ["http_llm_call"] : []),
    }]
  })

  const entity = new WorkflowEntityInstance({
    id: run.id,
    templateId: run.templateId,
    name: run.name,
    status,
    workingDirectory: template.workingDirectory,
    currentColumn,
    currentStageId,
    runtime: "backend-opencode",
    model: primaryExecutor?.agentMode?.model ?? primaryExecutor?.llmApi?.model ?? run.defaultLabel,
    queuePosition: 0,
    progress: run.progress.percent,
    columnStates: template.columns.map((column, index) => {
      const columnIndex = index + 1
      let state: NodeState = "waiting"
      if (columnIndex < currentColumn) state = "done"
      else if (columnIndex === currentColumn) {
        state = status === "running" ? "running" : status === "queued" ? "queued" : status === "failed" ? "failed" : "waiting"
      }
      const parallel = column.lanes.reduce((sum, lane) => sum + lane.nodeIds.length, 0)
      return { columnId: column.id, state, parallel: Math.max(1, parallel), done: state === "done" ? parallel : 0 }
    }),
    activeAgents,
    logs: [],
    filesTouched: [],
    artifacts: [],
    toolsUsed: activeAgents.flatMap((agent) => agent.tools),
    latestOutput: run.error ?? (activeAgents.length ? `${activeAgents.map((a) => a.name).join(", ")} running…` : "Loading run details…"),
  }, { sourceRecordId: run.id })

  registerWorkflowEntityIfChanged(entity)
  return entity
}

export function importRuntimeWorkflowRuns(runs: RuntimeWorkflowRunRecord[]) {
  runs.forEach((run, index) => entityFromRuntimeRun(run, index + 1))
}

export function bootstrapWorkflowEntities(initial: WorkflowEntity[]) {
  entityRegistry.clear()
  initial.forEach((entity) => registerWorkflowEntity(entity))
}
