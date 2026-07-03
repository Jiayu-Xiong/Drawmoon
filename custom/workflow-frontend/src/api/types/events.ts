export interface RunEvent {
  type: string
  runId: string
  timestamp: string
  nodeId?: string
  data?: string
  error?: string
  message?: string
  info?: Record<string, unknown>
  result?: Record<string, unknown>
  artifact?: Record<string, unknown>
  diff?: string
  sessionId?: string
  policy?: string
  sessionKey?: string
}

export type WorkflowRunLifecycleEventType =
  | "workflow_queued"
  | "workflow_started"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_cancelled"
  | "workflow_paused"
  | "node_started"
  | "node_completed"
  | "node_failed"
  | "node_cancelled"
  | "node_paused"

export interface WorkflowRunLifecycleEvent {
  type: WorkflowRunLifecycleEventType
  runId: string
  nodeId?: string
  status?: string
  error?: string
  timestamp: string
}

export type WorkflowRunStoredEvent = RunEvent | WorkflowRunLifecycleEvent
