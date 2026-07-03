import type { CommandBinding, LocalCliInfo } from "./cli"
import type { WorkflowTemplateInfo } from "./workflow-runs"

export interface ProviderInfo {
  id: string
  name: string
  version: string | null
  available: boolean
  path: string | null
  capabilities?: Record<string, unknown>
}

export interface RuntimeSnapshot {
  health: boolean
  providers: ProviderInfo[]
  commands: Record<string, CommandBinding[]>
  cliInfo: LocalCliInfo | null
  cliRefreshing?: string[]
  cliRefreshActive?: boolean
  cacheEntries: unknown[]
  traces: unknown[]
  sessions: unknown[]
  templates: WorkflowTemplateInfo[]
}

export interface CliInfoResponse {
  info: LocalCliInfo
  refreshing: string[]
  refreshActive: boolean
}
