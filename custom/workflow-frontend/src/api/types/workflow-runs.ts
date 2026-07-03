export interface StartWorkflowRunOptions {
  templateId?: string
  graph?: unknown
  name?: string
  prompt?: string
  defaultLabel?: string
  labels?: string[]
  bypassCache?: boolean
  workflowTemplateSnapshot?: Record<string, unknown>
}

export interface WorkflowTemplateInfo {
  id: string
  version: string
  name: string
  defaultLabel: string
  labels: string[]
  description?: string
  nodeCount: number
  edgeCount: number
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
  status: string
  createdAt: string
  startedAt: string | null
  updatedAt: string
  finishedAt: string | null
  activeDurationMs?: number
  activeSegmentStartedAt?: string | null
  progress: { totalNodes: number; completedNodes: number; failedNodes: number; runningNodes: number; waitingNodes: number; percent: number }
  currentNodeIds?: string[]
  nodeStates?: Record<string, WorkflowRunNodeStateSummary>
  tokenUsage?: WorkflowRunTokenSummary
  error?: string | null
}

export interface WorkflowRunRecord extends WorkflowRunListItem {
  currentNodeIds?: string[]
  completedNodeIds?: string[]
  failedNodeIds?: string[]
  graph: {
    nodes: Array<{
      id: string
      label?: string
      config: { prompt?: string; sessionPolicy?: string; sessionKey?: string; [key: string]: unknown }
      action?: unknown
    }>
    edges?: Array<{ from: string; to: string; contextMode?: string }>
  }
  nodeSessions?: Record<string, string>
  history: {
    prompt?: string
    workflowTemplateId?: string
    workflowTemplateVersion?: string
    workflowTemplateSnapshot?: Record<string, unknown>
    selectedAgentModes: Record<string, string>
    nodeOutputs?: Record<string, string>
    finalOutput?: string
    workingDirectory?: string
    workingDirectoryKey?: string
    artifacts?: Array<{ nodeId: string; label: string; kind: string; path: string; href: string }>
    usage?: {
      totalTokens: number
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number
      cacheWriteTokens: number
      reasoningTokens?: number
      costUsd?: number
      quotaPercentUsed?: number
      source?: string
      byNode?: Record<string, {
        totalTokens: number
        inputTokens: number
        outputTokens: number
        cacheReadTokens: number
        cacheWriteTokens: number
        reasoningTokens?: number
        costUsd?: number
        quotaPercentUsed?: number
        source?: string
      }>
    }
  }
  nodeResults: Record<string, {
    text?: string
    summary?: string
    artifacts?: Array<{ name?: string; mime?: string; content?: string; isReference?: boolean }>
    metadata?: { outputFile?: string; readRunFiles?: string[]; [key: string]: unknown }
    usage?: {
      totalTokens: number
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number
      cacheWriteTokens: number
      reasoningTokens?: number
      costUsd?: number
      quotaPercentUsed?: number
      source?: string
    }
  }>
  nodeStates: Record<string, { id: string; status: string; startedAt: string | null; finishedAt: string | null; error?: string; sessionId?: string }>
}
