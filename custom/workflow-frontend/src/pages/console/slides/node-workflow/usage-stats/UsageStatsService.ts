import type { WorkflowRunListItem } from "../../../../../api"
import { listWorkflowRuns } from "../../../../../api"
import type { WorkflowUsageFilters, WorkflowUsageQueryResult, WorkflowUsageEvent } from "./types"

const API_BASE = "/api"

function buildQuery(filters: WorkflowUsageFilters): string {
  const params = new URLSearchParams()
  params.set("limit", String(filters.limit ?? 20))
  if (filters.templateId?.trim()) params.set("templateId", filters.templateId.trim())
  if (filters.runId?.trim()) params.set("runId", filters.runId.trim())
  if (filters.since?.trim()) params.set("since", filters.since.trim())
  if (filters.until?.trim()) params.set("until", filters.until.trim())
  if (filters.cli?.trim()) params.set("cli", filters.cli.trim())
  if (filters.api?.trim()) params.set("api", filters.api.trim())
  if (filters.agentMode?.trim()) params.set("agentMode", filters.agentMode.trim())
  return params.toString()
}

function occurredAt(run: WorkflowRunListItem) {
  return run.finishedAt ?? run.updatedAt ?? run.createdAt
}

function inTimeRange(at: string, since?: string, until?: string) {
  const ms = new Date(at).getTime()
  if (Number.isNaN(ms)) return true
  if (since && ms < new Date(since).getTime()) return false
  if (until && ms > new Date(until).getTime()) return false
  return true
}

function matchesClientFilters(event: WorkflowUsageEvent, filters: WorkflowUsageFilters) {
  if (filters.templateId && event.templateId !== filters.templateId) return false
  if (filters.runId && event.runId !== filters.runId) return false
  if (!inTimeRange(event.occurredAt, filters.since, filters.until)) return false
  if (filters.cli) {
    const hay = [event.cliTemplateId, event.providerId].filter(Boolean).join(" ").toLowerCase()
    if (!hay.includes(filters.cli.toLowerCase())) return false
  }
  if (filters.api && !(event.llmApiId ?? "").toLowerCase().includes(filters.api.toLowerCase())) return false
  if (filters.agentMode && !(event.agentModeId ?? "").toLowerCase().includes(filters.agentMode.toLowerCase())) return false
  return true
}

function fallbackFromRunList(filters: WorkflowUsageFilters): WorkflowUsageQueryResult {
  return listWorkflowRuns().then((runs) => {
    const events: WorkflowUsageEvent[] = runs
      .filter((run) => (run.tokenUsage?.totalTokens ?? 0) > 0)
      .map((run) => ({
        id: `${run.id}:summary`,
        runId: run.id,
        runName: run.name,
        templateId: run.templateId,
        occurredAt: occurredAt(run),
        usage: {
          totalTokens: run.tokenUsage!.totalTokens,
          inputTokens: run.tokenUsage!.inputTokens,
          outputTokens: run.tokenUsage!.outputTokens,
          cacheReadTokens: run.tokenUsage!.cacheReadTokens,
          cacheWriteTokens: run.tokenUsage!.cacheWriteTokens,
          reasoningTokens: run.tokenUsage!.reasoningTokens,
          source: "run-list",
        },
      }))
      .filter((event) => matchesClientFilters(event, filters))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    const limit = filters.limit ?? 20
    return { events: events.slice(0, limit), total: events.length }
  })
}

export class UsageStatsService {
  async query(filters: WorkflowUsageFilters = {}): Promise<WorkflowUsageQueryResult> {
    const suffix = buildQuery(filters)
    try {
      const response = await fetch(`${API_BASE}/workflow-usage/events?${suffix}`)
      if (response.ok) {
        const result = await response.json() as WorkflowUsageQueryResult
        if (result.events.length) return result
      }
    } catch {
      // Fall through to list API.
    }
    return fallbackFromRunList(filters)
  }
}

export const usageStatsService = new UsageStatsService()
