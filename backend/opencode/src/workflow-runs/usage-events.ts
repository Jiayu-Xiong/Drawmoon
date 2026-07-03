import type { FileWorkflowRunStore } from "./store.js"
import type { WorkflowRunListItem, WorkflowRunRecord } from "./types.js"
import type { TokenUsage } from "../schema/types.js"

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

export interface WorkflowUsageQuery {
  limit?: number
  templateId?: string
  runId?: string
  since?: string
  until?: string
  cli?: string
  api?: string
  agentMode?: string
}

const PROVIDER_CLI: Record<string, string> = {
  opencode: "opencode-cli",
  codex: "codex-cli",
  copilot: "copilot-cli",
  kiro: "kiro-cli",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function nodeBinding(run: WorkflowRunRecord, nodeId: string) {
  const node = run.graph.nodes.find((item) => item.id === nodeId)
  if (!node) return {}
  const action = isRecord(node.action) ? node.action : undefined
  const config = isRecord(node.config) ? node.config : undefined
  const binding = isRecord(action?.binding) ? action.binding : undefined
  const metadata = isRecord(action?.metadata) ? action.metadata : undefined
  const configLlm = isRecord(config?.llmApi) ? config.llmApi : undefined
  const metaLlm = isRecord(metadata?.llmApi) ? metadata.llmApi : undefined
  const providerId = typeof binding?.providerId === "string"
    ? binding.providerId
    : typeof config?.provider === "string"
      ? config.provider
      : undefined
  const agentModeId = typeof binding?.agentModeId === "string"
    ? binding.agentModeId
    : run.history?.selectedAgentModes?.[nodeId]
  const llmApiId = typeof binding?.llmApiTemplateId === "string"
    ? binding.llmApiTemplateId
    : typeof metaLlm?.id === "string"
      ? metaLlm.id
      : typeof configLlm?.id === "string"
        ? configLlm.id
        : undefined
  const cliTemplateId = providerId ? PROVIDER_CLI[providerId] ?? providerId : undefined
  return { providerId, agentModeId, llmApiId, cliTemplateId, nodeLabel: node.label ?? nodeId }
}

function usagePayload(usage: TokenUsage) {
  return {
    totalTokens: usage.totalTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    reasoningTokens: usage.reasoningTokens,
    costUsd: usage.costUsd,
    source: usage.source,
  }
}

function occurredAtFor(run: WorkflowRunListItem | WorkflowRunRecord) {
  return run.finishedAt ?? run.updatedAt ?? run.createdAt
}

function inTimeRange(at: string, since?: string, until?: string) {
  const ms = new Date(at).getTime()
  if (Number.isNaN(ms)) return true
  if (since) {
    const s = new Date(since).getTime()
    if (!Number.isNaN(s) && ms < s) return false
  }
  if (until) {
    const u = new Date(until).getTime()
    if (!Number.isNaN(u) && ms > u) return false
  }
  return true
}

function matchesFilters(
  event: WorkflowUsageEvent,
  query: WorkflowUsageQuery,
): boolean {
  if (query.cli) {
    const needle = query.cli.toLowerCase()
    const hay = [event.cliTemplateId, event.providerId].filter(Boolean).join(" ").toLowerCase()
    if (!hay.includes(needle)) return false
  }
  if (query.api && !(event.llmApiId ?? "").toLowerCase().includes(query.api.toLowerCase())) return false
  if (query.agentMode && !(event.agentModeId ?? "").toLowerCase().includes(query.agentMode.toLowerCase())) return false
  return true
}

function eventsFromRun(run: WorkflowRunRecord): WorkflowUsageEvent[] {
  const at = occurredAtFor(run)
  const byNode = { ...(run.history?.usage?.byNode ?? {}) }

  for (const [nodeId, result] of Object.entries(run.nodeResults ?? {})) {
    if (result.usage?.totalTokens && !byNode[nodeId]) {
      byNode[nodeId] = result.usage
    }
  }

  const nodeIds = Object.keys(byNode)
  if (nodeIds.length) {
    return nodeIds
      .filter((nodeId) => (byNode[nodeId]?.totalTokens ?? 0) > 0)
      .map((nodeId) => {
        const binding = nodeBinding(run, nodeId)
        return {
          id: `${run.id}:${nodeId}`,
          runId: run.id,
          runName: run.name,
          templateId: run.templateId,
          nodeId,
          nodeLabel: binding.nodeLabel,
          providerId: binding.providerId,
          cliTemplateId: binding.cliTemplateId,
          agentModeId: binding.agentModeId,
          llmApiId: binding.llmApiId,
          occurredAt: at,
          usage: usagePayload(byNode[nodeId]!),
        }
      })
  }

  const usage = run.history?.usage
  if (usage?.totalTokens) {
    return [{
      id: `${run.id}:total`,
      runId: run.id,
      runName: run.name,
      templateId: run.templateId,
      occurredAt: at,
      usage: usagePayload(usage),
    }]
  }

  return []
}

function eventFromListItem(item: WorkflowRunListItem): WorkflowUsageEvent | null {
  const tokens = item.tokenUsage?.totalTokens ?? 0
  if (!tokens) return null
  return {
    id: `${item.id}:summary`,
    runId: item.id,
    runName: item.name,
    templateId: item.templateId,
    occurredAt: occurredAtFor(item),
    usage: {
      totalTokens: item.tokenUsage!.totalTokens,
      inputTokens: item.tokenUsage!.inputTokens,
      outputTokens: item.tokenUsage!.outputTokens,
      cacheReadTokens: item.tokenUsage!.cacheReadTokens,
      cacheWriteTokens: item.tokenUsage!.cacheWriteTokens,
      reasoningTokens: item.tokenUsage!.reasoningTokens,
      source: "run-index",
    },
  }
}

export function listWorkflowUsageEvents(
  store: FileWorkflowRunStore,
  query: WorkflowUsageQuery = {},
): { events: WorkflowUsageEvent[]; total: number } {
  const limit = Math.min(100, Math.max(1, query.limit ?? 20))
  let items = store.listLightweight()

  if (query.templateId) items = items.filter((item) => item.templateId === query.templateId)
  if (query.runId) items = items.filter((item) => item.id === query.runId)
  if (query.since || query.until) {
    items = items.filter((item) => inTimeRange(occurredAtFor(item), query.since, query.until))
  }

  items = items.sort((a, b) => occurredAtFor(b).localeCompare(occurredAtFor(a)))

  const events: WorkflowUsageEvent[] = []
  for (const item of items) {
    if (events.length >= limit * 6) break
    const record = store.get(item.id)
    const fromRecord = record ? eventsFromRun(record) : []
    if (fromRecord.length) {
      for (const event of fromRecord) {
        if (!matchesFilters(event, query)) continue
        events.push(event)
      }
      continue
    }
    const summary = eventFromListItem(item)
    if (summary && matchesFilters(summary, query)) events.push(summary)
  }

  events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const sliced = events.slice(0, limit)
  return { events: sliced, total: events.length }
}
