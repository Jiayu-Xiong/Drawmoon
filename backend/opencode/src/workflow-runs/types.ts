import type { AgentNodeOutput, RunEvent, SessionState, TokenUsage, WorkflowGraph } from "../schema/types.js"

export type WorkflowRunStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled"

export type WorkflowRunNodeStatus = "waiting" | "running" | "completed" | "failed" | "cancelled" | "paused"

export interface WorkflowRunNodeState {
  id: string
  status: WorkflowRunNodeStatus
  startedAt: string | null
  finishedAt: string | null
  error?: string
  sessionId?: string
}

export interface WorkflowRunArtifactRef {
  nodeId: string
  label: string
  kind: "markdown" | "pdf" | "image" | "other"
  path: string
  href: string
}

export interface WorkflowRunHistory {
  prompt?: string
  workflowTemplateId?: string
  workflowTemplateVersion?: string
  selectedAgentModes: Record<string, string>
  nodeOutputs?: Record<string, string>
  finalOutput?: string
  /** Folder name under ~/.drawmoon/workflow/ */
  workingDirectoryKey?: string
  /** Absolute path or drawmoon-relative `workflow/{key}` (entity output) */
  workingDirectory?: string
  /** Template-configured read root for this run. */
  readDirectory?: string
  /** Full UI workflow template JSON copied at run creation (survives registry deletion). */
  workflowTemplateSnapshot?: Record<string, unknown>
  artifacts?: WorkflowRunArtifactRef[]
  usage?: WorkflowRunUsageSummary
}

export interface WorkflowRunUsageSummary extends TokenUsage {
  byNode: Record<string, TokenUsage>
}

export interface WorkflowRunProgress {
  totalNodes: number
  completedNodes: number
  failedNodes: number
  runningNodes: number
  waitingNodes: number
  percent: number
}

export interface WorkflowRunRecord {
  id: string
  templateId: string
  defaultLabel: string
  labels: string[]
  name: string
  graph: WorkflowGraph
  status: WorkflowRunStatus
  createdAt: string
  startedAt: string | null
  updatedAt: string
  finishedAt: string | null
  /** Wall-clock excluded: accumulated ms while status is running/queued execution. */
  activeDurationMs?: number
  /** ISO timestamp when the current active segment started; cleared while paused. */
  activeSegmentStartedAt?: string | null
  currentNodeIds: string[]
  completedNodeIds: string[]
  failedNodeIds: string[]
  nodeStates: Record<string, WorkflowRunNodeState>
  nodeResults: Record<string, AgentNodeOutput>
  nodeSessions: Record<string, string>
  sessionGroups: Record<string, string>
  history: WorkflowRunHistory
  latestEvent: WorkflowRunStoredEvent | null
  progress: WorkflowRunProgress
  error: string | null
}

export type WorkflowRunLifecycleEventType =
  | "workflow_queued"
  | "workflow_started"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_cancelled"
  | "node_started"
  | "node_completed"
  | "node_failed"
  | "node_cancelled"
  | "workflow_paused"
  | "node_paused"

export interface WorkflowRunLifecycleEvent {
  type: WorkflowRunLifecycleEventType
  runId: string
  nodeId?: string
  status?: WorkflowRunStatus | WorkflowRunNodeStatus
  error?: string
  timestamp: string
}

export type WorkflowRunStoredEvent = RunEvent | WorkflowRunLifecycleEvent

export interface WorkflowRunStartOptions {
  templateId?: string
  templateVersion?: string
  name?: string
  prompt?: string
  defaultLabel?: string
  labels?: string[]
  selectedAgentModes?: Record<string, string>
  bypassCache?: boolean
  budgetOverride?: boolean
  budgetBlocked?: boolean
  budgetBlockReason?: string
  workingDirectory?: string
  /** Read root; overrides graph when set at start. */
  readDirectory?: string
  /** Additional absolute read roots for the whole run. */
  readRoots?: string[]
  /** Full UI workflow template JSON snapshot at run start. */
  workflowTemplateSnapshot?: Record<string, unknown>
}

export interface WorkflowRunContinueOptions {
  /** Required when the run is paused with error `inquiry-pending`. */
  inquiryReply?: string
}

export interface WorkflowRunTokenSummary {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

export interface WorkflowRunNodeStateSummary {
  status: string
}

export interface WorkflowRunListItem {
  id: string
  templateId: string
  defaultLabel: string
  labels: string[]
  name: string
  status: WorkflowRunStatus
  createdAt: string
  startedAt: string | null
  updatedAt: string
  finishedAt: string | null
  activeDurationMs?: number
  activeSegmentStartedAt?: string | null
  progress: WorkflowRunProgress
  currentNodeIds?: string[]
  nodeStates?: Record<string, WorkflowRunNodeStateSummary>
  tokenUsage?: WorkflowRunTokenSummary
  error: string | null
}

export interface WorkflowRunRuntimeEvent {
  event: RunEvent
  session?: SessionState
}
