import { json } from "./http-client"
import type { CommandBinding } from "./types/cli"
import type { CliInfoResponse, ProviderInfo, RuntimeSnapshot } from "./types/runtime"
import type { WorkflowTemplateInfo } from "./types/workflow-runs"

export interface BootstrapResponse {
  health: { status: string; timestamp?: string }
  providers: ProviderInfo[]
  commands: Record<string, CommandBinding[]>
  cliInfo: CliInfoResponse["info"]
  cliRefreshing: string[]
  cliRefreshActive: boolean
  templates: WorkflowTemplateInfo[]
  drawmoonWorkflowTemplates?: Array<{ id: string; name: string; description?: string }>
}

export async function getBootstrap(): Promise<BootstrapResponse> {
  return json<BootstrapResponse>("/bootstrap")
}

export async function getHealth() {
  try {
    await json<{ status: string }>("/health")
    return true
  } catch {
    return false
  }
}

export async function getProviders() {
  return json<{ providers: ProviderInfo[] }>("/providers").then((x) => x.providers)
}

export async function getCommands(provider?: string) {
  const suffix = provider ? `?provider=${encodeURIComponent(provider)}` : ""
  return json<{ commands: Record<string, CommandBinding[]> }>(`/commands${suffix}`).then((x) => x.commands)
}

export async function getCliInfo(): Promise<CliInfoResponse> {
  return json<CliInfoResponse>("/cli/info")
}

export async function startCliInfoRefresh(provider?: "opencode" | "kiro" | "codex" | "copilot") {
  return json<{ started: boolean; refreshing: string[] }>("/cli/info/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(provider ? { provider } : {}),
  })
}

export async function getCodexStatus() {
  return json<{ status: unknown }>("/codex/status").then((x) => x.status)
}

export async function getCache() {
  return json<{ entries: unknown[] }>("/cache").then((x) => x.entries)
}

export async function clearCache() {
  return json<{ cleared: number }>("/cache", { method: "DELETE" })
}

export async function getSessions() {
  return json<{ sessions: unknown[] }>("/sessions").then((x) => x.sessions)
}

export async function getTraces() {
  return json<{ traces: unknown[] }>("/traces").then((x) => x.traces)
}

function snapshotFromBootstrap(bootstrap: BootstrapResponse, extras?: Partial<RuntimeSnapshot>): RuntimeSnapshot {
  return {
    health: bootstrap.health.status === "ok",
    providers: bootstrap.providers,
    commands: bootstrap.commands,
    cliInfo: bootstrap.cliInfo,
    cliRefreshing: bootstrap.cliRefreshing,
    cliRefreshActive: bootstrap.cliRefreshActive,
    cacheEntries: extras?.cacheEntries ?? [],
    traces: extras?.traces ?? [],
    sessions: extras?.sessions ?? [],
    templates: bootstrap.templates,
  }
}

export async function getRuntimeSnapshot(options?: { lite?: boolean }): Promise<RuntimeSnapshot> {
  try {
    const bootstrap = await getBootstrap()
    if (options?.lite) return snapshotFromBootstrap(bootstrap)
    const [cacheEntries, traces, sessions] = await Promise.all([
      getCache().catch(() => []),
      getTraces().catch(() => []),
      getSessions().catch(() => []),
    ])
    return snapshotFromBootstrap(bootstrap, { cacheEntries, traces, sessions })
  } catch {
    return {
      health: false,
      providers: [],
      commands: {},
      cliInfo: null,
      cliRefreshing: [],
      cliRefreshActive: false,
      cacheEntries: [],
      traces: [],
      sessions: [],
      templates: [],
    }
  }
}

export async function listTemplates() {
  return json<{ templates: WorkflowTemplateInfo[] }>("/templates").then((x) => x.templates)
}

export async function getTemplateGraph(id: string) {
  return json<{ template: WorkflowTemplateInfo; graph: unknown }>(`/templates/${encodeURIComponent(id)}`)
    .then((x) => x.graph)
}

export interface DrawmoonWorkflowTemplateMeta {
  id: string
  name: string
  description?: string
  path: string
  updatedAt: string
  nodeCount?: number
  edgeCount?: number
}

export async function fetchDrawmoonWorkflowTemplates() {
  return json<{ templates: DrawmoonWorkflowTemplateMeta[] }>("/drawmoon/templates/workflows").then((x) => x.templates)
}

export async function fetchDrawmoonWorkflowTemplate(id: string) {
  return json<{ template: unknown }>(`/drawmoon/templates/workflows/${encodeURIComponent(id)}`).then((x) => x.template)
}
