/** Shared CLI/budget types for runtime budget estimation. */

export type AgentRuntimeMode = "chat" | "plan" | "build" | "review" | "agent"

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
  kind: "token" | "hourly" | "monthly_usd" | "weekly_percent" | "unlimited" | "unknown"
  summary: string
  available: boolean
  windows: CliLimitWindow[]
  balanceUsd?: number | null
  raw?: string | null
}

export interface CliLiveModel {
  id: string
  name: string
  statusLabel: string
  contextWindow?: number
  costMultiplier?: number
  fields: Array<{ key: string; value: string }>
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
  status: "online" | "offline" | "degraded"
  version?: string
  path?: string
  inUseNodeCount: number
  fields: Array<{ key: string; value: string }>
  quota: CliQuotaSnapshot
  models: CliLiveModel[]
  supportedModes: AgentRuntimeMode[]
  modeOptions?: CliModeOption[]
  controlSurface: "cli-owned" | "customizable"
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

export interface WorkflowNodeBudgetInput {
  cliTemplateId?: string
  promptPreview?: string
  runtimeOverrides?: { model?: string; timeoutMs?: number }
}

export interface WorkflowTemplate {
  nodes: WorkflowNodeBudgetInput[]
  budgetPolicies?: CliBudgetPolicy[]
}
