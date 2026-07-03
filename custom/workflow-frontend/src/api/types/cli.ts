export interface CommandBinding {
  id: string
  label: string
  description: string
  command: string
  args: string[]
  outputStyle: string
  consumesTokens: boolean
  category?: string
}

export interface CliProbe {
  id: string
  label: string
  command: string
  available: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  note?: string
}

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
  windows?: CliLimitWindow[]
  balanceUsd?: number | null
  raw?: string | null
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
  models: Array<{
    id: string
    name: string
    statusLabel: string
    contextWindow?: number
    costMultiplier?: number
    fields: Array<{ key: string; value: string }>
    supportedModes?: string[]
  }>
  supportedModes: string[]
  modeOptions?: Array<{ id: string; label: string; editable: boolean; source: string; description?: string }>
  controlSurface: "cli-owned" | "customizable"
  allowDerivedAgentModes: boolean
  editableAgentModeFields?: string[]
  activeModesInWorkflow: string[]
  telemetry?: {
    source: string
    available: boolean
    summary: string
    periods: {
      today?: {
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
      month?: {
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
      allTime?: {
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
    }
    activeSessionCount?: number
    lastActivityAt?: string | null
    rawPath?: string | null
  }
}

export interface LocalCliInfo {
  generatedAt: string
  codex: {
    available: boolean
    version: string | null
    path: string | null
    model: string
    reasoningEffort: string
    sandbox: string
    configExists: boolean
    configPath: string
    quota: {
      available: boolean
      summary: string
      raw: string | null
      probes: CliProbe[]
    }
    features: {
      enabled: number
      total: number
      stableEnabled: number
    }
    probes: CliProbe[]
  }
  copilot: {
    available: boolean
    ghAvailable: boolean
    extensionDetected: boolean
    modelContext: {
      available: boolean
      summary: string
      raw: string | null
      rows: Array<Record<string, string>>
    }
    usage: {
      available: boolean
      summary: string
      raw: string | null
    }
    probes: CliProbe[]
  }
  kiro?: {
    available: boolean
    version: string | null
    path: string | null
    quota: {
      available: boolean
      summary: string
      raw: string | null
      balanceUsd: number | null
      probes: CliProbe[]
    }
    models: {
      available: boolean
      summary: string
      raw: string | null
      rows: Array<Record<string, string>>
    }
    probes: CliProbe[]
  }
  opencode?: {
    available: boolean
    version: string | null
    path: string | null
    quota: {
      available: boolean
      summary: string
      rawPath: string | null
      probes: CliProbe[]
    }
    usage: {
      available: boolean
      summary: string
      source: string
      activeSessionCount: number
      lastActivityAt: string | null
    }
    models: {
      available: boolean
      summary: string
      rows: Array<Record<string, string>>
    }
    probes: CliProbe[]
  }
  liveSnapshots?: CliLiveSnapshot[]
  commands: Record<string, CommandBinding[]>
}
