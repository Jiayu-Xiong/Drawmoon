export type WorkflowStatus = "running" | "queued" | "looping" | "paused" | "failed" | "completed"
export type ProviderStatus = "online" | "offline" | "degraded"
export type NodeKind =
  | "input"
  | "plan"
  | "route"
  | "run-cli"
  | "parallel-tools"
  | "merge"
  | "verify"
  | "summarize"
  | "output"
  | "agent-mode"
  | "condition"
  | "loop"
  | "tool-step"
  | "llm-step"
export type EdgeKind = "normal" | "branch" | "merge" | "loop"
export type NodeState = "done" | "running" | "waiting" | "failed" | "paused" | "queued" | "looping"
export type ArtifactKind = "pdf" | "image" | "latex" | "markdown" | "json" | "directory" | "other"
export type ExecutionMode = "agent-mode" | "llm-api" | "cli" | "tool" | "human-gate" | "inquiry"
export type AgentRuntimeMode = "chat" | "plan" | "build" | "review" | "agent"
export type NodeModality = "text" | "image" | "audio"
export type CliQuotaKind = "token" | "hourly" | "monthly_usd" | "weekly_percent" | "unlimited" | "unknown"
export type CliControlSurface = "cli-owned" | "customizable"

export interface CliQuotaProfile {
  kind: CliQuotaKind
  probeCommandId?: string
  refreshIntervalMs?: number
  unitLabel?: string
}

export interface CliModelCapability {
  id: string
  contextWindow?: number
  costMultiplier?: number
  supportedModes: AgentRuntimeMode[]
}

export type CliModelBinding = "llm-api" | "cli-native"

/** Official vendor CLIs (codex, kiro, copilot) vs custom/virtual (direct-api, opencode, …). */
export type CliKind = "official" | "custom"

export interface CliCapabilities {
  controlSurface: CliControlSurface
  supportedModes: AgentRuntimeMode[]
  quota: CliQuotaProfile
  editableAgentModeFields?: string[]
  allowDerivedAgentModes: boolean
  modelCapabilities?: CliModelCapability[]
  /** Where node-level model selection comes from for this CLI. */
  modelBinding: CliModelBinding
}

/** Normalized limit window (token-monitor style). */
export interface CliLimitWindow {
  kind: "session" | "weekly" | "billing"
  label?: string
  used?: number | null
  limit?: number | null
  remaining?: number | null
  usedPercent?: number | null
  remainingPercent?: number | null
  resetsAt?: string | null
}

export interface CliQuotaSnapshot {
  kind: CliQuotaKind
  summary: string
  available: boolean
  windows?: CliLimitWindow[]
  balanceUsd?: number | null
  raw?: string | null
}

export interface CliLiveModel {
  id: string
  name: string
  statusLabel: string
  contextWindow?: number
  costMultiplier?: number
  fields: CliTemplateKv[]
  supportedModes?: AgentRuntimeMode[]
}

export interface CliModeOption {
  id: AgentRuntimeMode
  label: string
  editable: boolean
  source: "native" | "derived" | "custom"
  description?: string
}

export interface CliUsagePeriod {
  totalTokens: number
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  costUsd?: number
  messageCount?: number
  sessionCount?: number
  models?: Record<string, number>
}

export interface CliTelemetrySnapshot {
  source: "local-db" | "cli-probe" | "api" | "unavailable"
  available: boolean
  summary: string
  periods: {
    today?: CliUsagePeriod
    month?: CliUsagePeriod
    allTime?: CliUsagePeriod
  }
  activeSessionCount?: number
  lastActivityAt?: string | null
  rawPath?: string | null
}

export interface CliLiveSnapshot {
  providerId: string
  cliTemplateId: string
  status: ProviderStatus
  version?: string
  path?: string
  inUseNodeCount: number
  fields: CliTemplateKv[]
  quota: CliQuotaSnapshot
  models: CliLiveModel[]
  supportedModes: AgentRuntimeMode[]
  modeOptions?: CliModeOption[]
  controlSurface: CliControlSurface
  allowDerivedAgentModes: boolean
  editableAgentModeFields?: string[]
  activeModesInWorkflow: AgentRuntimeMode[]
  telemetry?: CliTelemetrySnapshot
}

export interface CliBudgetPolicy {
  cliTemplateId: string
  maxTokensPerRun?: number
  maxUsdPerRun?: number
  maxHoursPerRun?: number
  reservePercent?: number
  minContextComfortRatio?: number
}

export interface BudgetEstimate {
  cliTemplateId: string
  estimatedTokens?: number
  estimatedUsd?: number
  estimatedHours?: number
  contextUsageRatio?: number
  warnings: string[]
  blocked: boolean
  blockReason?: string
}
export type ContextMode = "fresh" | "inherit" | "summary" | "fork" | "artifacts"
export type SessionPolicy = ContextMode | "shared"

/** How a workflow node joins a shared CLI/API conversation thread. */
export interface NodeSessionBinding {
  policy: SessionPolicy
  /** Workflow-local bucket id; nodes with the same key share one runtime session. */
  sessionKey?: string
  /** Bind to another node's session (e.g. stage5 continues stage1's thread). */
  bindsToNodeId?: string
  /** Sequential turn order within the shared thread (1 = first user prompt). */
  turnOrder?: number
}

export interface WorkflowSharedSession {
  key: string
  label: string
  anchorNodeId: string
  nodeIds: string[]
}
export type PromptSource = "template" | "override" | "template-with-bias"
export type ResponseFormat = "text" | "markdown" | "latex" | "json"

export interface BackendProvider {
  id: string
  name: string
  status: ProviderStatus
  endpoint?: string
  version?: string
  path?: string
  protocol?: string
  binding?: "bound" | "missing" | "disabled"
}

export interface WorkflowNode {
  id: string
  name: string
  kind: NodeKind
  stageId: string
  columnId: string
  laneId: string
  agentId: string
  executionMode?: ExecutionMode
  modality?: NodeModality
  cliTemplateId?: string
  agentModeTemplateId?: string
  /** Alias for agentModeTemplateId (executor / agent mode registry ID). */
  executorId?: string
  runtimeMode?: AgentRuntimeMode
  /** Alias for runtimeMode (chat / plan / build / …). */
  strategyId?: AgentRuntimeMode
  llmApiTemplateId?: string
  /** Alias for llmApiTemplateId (LLM API template registry ID). */
  llmId?: string
  promptTitle: string
  promptPreview: string
  biasPrompt?: string
  promptOverrides?: PromptOverrides
  runtimeOverrides?: RuntimeOverrides
  outputContract: string
  artifacts?: WorkflowArtifact[]
  x: number
  y: number
  state?: NodeState
  session?: NodeSessionBinding
  /** Per-node skill/MCP overrides merged with agent mode defaults at runtime. */
  toolConstraints?: NodeToolConstraints
}

export interface NodeToolConstraints {
  forcedSkills?: string[]
  allowedSkills?: string[]
  forcedMcpServers?: string[]
  allowedMcpServers?: string[]
  forcedTools?: string[]
  allowedTools?: string[]
}

export interface WorkflowLane {
  id: string
  name: string
  nodeIds: string[]
}

export interface WorkflowColumn {
  id: string
  name: string
  stageId: string
  lanes: WorkflowLane[]
}

export interface WorkflowEdge {
  id: string
  from: string
  to: string
  kind: EdgeKind
  color: string
  annotation?: string
  contextMode?: ContextMode
}

export interface WorkflowStage {
  id: string
  name: string
  color: string
  columnIds: string[]
}

export interface WorkflowArtifact {
  id: string
  label: string
  kind: ArtifactKind
  path: string
  href: string
}

export interface WorkflowInputMountSpec {
  name: string
  /** Path relative to readDirectory, or absolute. */
  path: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  workingDirectory: string
  /** Read root for this template; entity output dir is allocated per run. */
  readDirectory?: string
  /** Read-only trees linked into the entity output dir before nodes run. */
  inputMounts?: WorkflowInputMountSpec[]
  defaultAgentId: string
  defaultAgentModeTemplateId?: string
  defaultLlmApiTemplateId?: string
  agentModeTemplateIds?: string[]
  llmApiTemplateIds?: string[]
  stages: WorkflowStage[]
  columns: WorkflowColumn[]
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  loopEdges: WorkflowEdge[]
  branchGroups: Array<{ id: string; from: string; to: string[] }>
  mergeGroups: Array<{ id: string; from: string[]; to: string }>
  /** Shared conversation threads declared by this template. */
  sharedSessions?: WorkflowSharedSession[]
  /** Initial runtime session ids keyed by workflow-local session key. */
  sessionGroups?: Record<string, string>
  budgetPolicies?: CliBudgetPolicy[]
}

export interface AgentDefinition {
  id: string
  name: string
  role: string
  model: string
  tools: string[]
  outputKinds: ArtifactKind[]
}

export interface RetryPolicy {
  attempts: number
  backoffMs: number
  continueOnPartialFailure: boolean
}

export interface PromptOverrides {
  systemPromptSource?: PromptSource
  systemPrompt?: string
  userPromptBias?: string
}

export type InteractionIntent = "continue" | "handoff" | "review"

export type NodeArchetype =
  | "planner"
  | "worker"
  | "reviser"
  | "merger"
  | "reviewer"
  | "media"
  | "gate"
  | "finalizer"

export type NodeContractInputMode = "reference" | "summary" | "inline"
export type NodeContractOutputCriticality = "critical" | "isolated" | "optional"
export type NodeContractTransport = "intra" | "inter" | "auto"

export interface NodeContractInput {
  key: string
  from: string
  mode?: NodeContractInputMode
  slice?: string
  required?: boolean
}

export interface NodeContractOutput {
  key: string
  path: string
  criticality?: NodeContractOutputCriticality
}

export interface NodeContract {
  inputs?: NodeContractInput[]
  outputs?: NodeContractOutput[]
  transport?: NodeContractTransport
}

export interface RuntimeOverrides {
  model?: string
  contextMode?: ContextMode
  maxIterations?: number
  timeoutMs?: number
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  responseFormat?: ResponseFormat
  tools?: string[]
  workingDirectory?: string
  retryPolicy?: Partial<RetryPolicy>
  customCommand?: string
  customArgs?: string[]
  readRunFiles?: string[]
  contextFiles?: string[]
  cacheFiles?: string[]
  archetype?: NodeArchetype
  intent?: InteractionIntent
  contract?: NodeContract
  /** IO planner: phase-1 writes inquiryQuestionsFile then pauses for author reply before IO JSON. */
  plannerInquiry?: boolean
  inquiryQuestionsFile?: string
  inquiryReplyFile?: string
  /** Human gate: required artifact paths before pause for review. */
  gateRequiredArtifacts?: string[]
}

export interface CliTemplateCommand {
  id: string
  label: string
  command: string
  args: string[]
  outputStyle: "text" | "json" | "table" | "key-value" | "code"
  consumesTokens: boolean
}

export interface CliTemplateKv {
  key: string
  value: string
}

export interface CliTemplateModel {
  id: string
  name: string
  statusLabel: string
  fields: CliTemplateKv[]
}

export interface CliProviderTemplate {
  id: string
  name: string
  description: string
  startupCommand: string
  providerId: BackendProvider["id"]
  /** Official vendor CLI vs custom/virtual executor. */
  cliKind?: CliKind
  /** LLM API template IDs this CLI may bind (lookup by registry ID). */
  llmApiTemplateIds?: string[]
  promptCommand: CliTemplateCommand
  fields: CliTemplateKv[]
  commands: CliTemplateCommand[]
  models: CliTemplateModel[]
  capabilities: CliCapabilities
}

export interface AgentModeTemplate {
  id: string
  name: string
  description: string
  provider: BackendProvider["id"]
  cliTemplateId?: string
  strategyKind?: "cli" | "custom" | "backend"
  controlSurface?: "cli-owned" | "customizable"
  importedFromBackend?: boolean
  mode: AgentRuntimeMode
  model: string
  contextMode: ContextMode
  defaultSystemPromptFile: string
  defaultSystemPrompt: string
  allowSystemPromptOverride: boolean
  defaultUserPromptBias?: string
  allowedTools: string[]
  outputKinds: ArtifactKind[]
  maxIterations: number
  timeoutMs: number
  allowFileWrites: boolean
  cacheFiles: string[]
  contextFiles: string[]
  retryPolicy: RetryPolicy
  constraints?: NodeToolConstraints
  /** Layered prompt sections (identity/behavior/task) merged into system prompt for OpenCode/custom modes. */
  strategySections?: AgentModeStrategySections
  /** Applied when a workflow node selects this mode unless the node overrides. */
  defaultRuntimeOverrides?: Pick<RuntimeOverrides, "archetype" | "contract">
}

export interface AgentModeStrategySections {
  identity?: string
  behavior?: string
  task?: string
  security?: string
  context?: string
  custom?: Record<string, string>
}

export interface LlmApiTemplate {
  id: string
  name: string
  description: string
  provider: BackendProvider["id"]
  endpoint: string
  protocol: "openai-compatible" | "responses" | "messages" | "custom-http"
  wireProtocol?: "openai-chat" | "openai-responses" | "anthropic-messages" | "google-gemini" | "deepseek-chat" | "azure-openai-chat" | "custom-http"
  model: string
  contextWindow: number
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  responseFormat: ResponseFormat
  modalities?: NodeModality[]
  defaultSystemPrompt: string
  defaultUserPromptBias?: string
  allowSystemPromptOverride: boolean
  allowUserPromptBias: boolean
  apiKeyEnv?: string
  timeoutMs: number
  retryPolicy: RetryPolicy
}

export interface TokenUsageSnapshot {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens?: number
  costUsd?: number
  quotaPercentUsed?: number
  source: "run-results" | "opencode-telemetry" | "estimated"
  updatedAt?: string
}

export interface AgentItem {
  id: string
  agentId: string
  name: string
  role: string
  status: NodeState
  currentNodeId: string
  promptPreview: string
  promptTitle: string
  lastOutput: string
  tokens: number
  tokenUsage?: Pick<TokenUsageSnapshot, "totalTokens" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "reasoningTokens">
  tools: string[]
}

export interface WorkflowEntity {
  id: string
  templateId: string
  name: string
  status: WorkflowStatus
  workingDirectory: string
  currentColumn: number
  currentStageId: string
  runtime: string
  model: string
  queuePosition: number
  progress: number
  columnStates: Array<{
    columnId: string
    state: NodeState
    parallel: number
    done: number
  }>
  activeAgents: AgentItem[]
  logs: Array<{ time: string; level: "info" | "warn" | "error"; message: string }>
  filesTouched: string[]
  artifacts: WorkflowArtifact[]
  toolsUsed: string[]
  latestOutput: string
  tokenUsage?: TokenUsageSnapshot
}

export interface WorkflowPromptHistoryEntry {
  id: string
  at: string
  prompt: string
}

export interface WorkflowRunRecord {
  id: string
  templateId: WorkflowTemplate["id"]
  name: string
  executionStatus: WorkflowStatus
  promptHistory: WorkflowPromptHistoryEntry[]
  currentColumn?: number
  progress?: number
}

export interface SystemSnapshot {
  status: "online" | "offline" | "partial"
  lastUpdated: string
  cli: {
    version: string
    uptime: string
    path: string
    available: boolean
  }
  apiBinding: {
    endpoint: string
    protocol: string
    status: ProviderStatus
  }
  runtime: {
    name: string
    pid: number
    startedAt: string
  }
  resources: Array<{ name: string; value: string; samples: number[] }>
  quota: {
    summary: string
    probes: Array<{ name: string; status: ProviderStatus; detail: string }>
  }
  modelContext: Array<{ provider: string; model: string; context: string; source: string }>
  taskQueue: Array<{ id: string; workflow: string; state: WorkflowStatus }>
  events: Array<{ time: string; source: string; level: "info" | "warn" | "error"; message: string }>
}
