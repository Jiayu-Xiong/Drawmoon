export interface WorkflowUsageEvent {
  id: string
  runId: string
  runName: string
  templateId: string
  nodeId?: string
  nodeLabel?: string
  providerId?: string
  cliTemplateId?: string
  agentModeId?: string
  llmApiId?: string
  occurredAt: string
  usage: {
    totalTokens: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
    costUsd?: number
    source?: string
  }
}

export interface WorkflowUsageFilters {
  limit?: number
  templateId?: string
  runId?: string
  since?: string
  until?: string
  cli?: string
  api?: string
  agentMode?: string
}

export interface WorkflowUsageQueryResult {
  events: WorkflowUsageEvent[]
  total: number
}
