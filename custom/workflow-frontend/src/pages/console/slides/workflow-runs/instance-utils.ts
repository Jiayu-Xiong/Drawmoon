import type { NodeState, WorkflowStatus, TokenUsageSnapshot } from "../../../../data/console-model"
import type { WorkflowEntity } from "../../../../data/console-model"
import type { WorkflowRunListItem } from "../../../../api"
import { getWorkflowEntityInstance } from "../../../../data/workflow-entity"
import { serializeWorkflowTemplateSnapshot } from "../../../../data/workflow-template-snapshot"
import { workflowTemplates } from "../../shared/core"

const instanceCache = new Map<string, WorkflowInstanceItem>()

function instanceSnapshotKey(item: WorkflowInstanceItem): string {
  const nodeStates = Object.entries(item.nodeStates ?? {})
    .map(([id, state]) => `${id}:${state.status}`)
    .sort()
    .join("|")
  return [
    item.name,
    item.status,
    item.updatedAt,
    item.progressPercent,
    item.completedNodes,
    item.totalNodes,
    (item.currentNodeIds ?? []).join(","),
    nodeStates,
    item.templateId,
  ].join("§")
}

export type WorkflowSortMode = "time" | "template" | "name"

export type WorkflowInstanceItem = {
  id: string
  name: string
  templateId: string
  templateName: string
  status: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  activeDurationMs?: number
  activeSegmentStartedAt?: string | null
  updatedAt: string
  progressPercent: number
  completedNodes: number
  totalNodes: number
  labels: string[]
  source: "runtime" | "local"
  currentNodeIds?: string[]
  nodeStates?: Record<string, { status: string }>
  tokenUsage?: Pick<TokenUsageSnapshot, "totalTokens" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "reasoningTokens">
  entity: WorkflowEntity
  templateMissing?: boolean
  templateSnapshot?: Record<string, unknown>
}

function tokenUsageFromListItem(run: WorkflowRunListItem): WorkflowInstanceItem["tokenUsage"] {
  if (!run.tokenUsage?.totalTokens) return undefined
  return {
    totalTokens: run.tokenUsage.totalTokens,
    inputTokens: run.tokenUsage.inputTokens,
    outputTokens: run.tokenUsage.outputTokens,
    cacheReadTokens: run.tokenUsage.cacheReadTokens,
    cacheWriteTokens: run.tokenUsage.cacheWriteTokens,
    reasoningTokens: run.tokenUsage.reasoningTokens,
  }
}

export function mapDisplayStatus(status: string): WorkflowStatus {
  if (status === "running") return "running"
  if (status === "queued" || status === "pending") return "queued"
  if (status === "failed") return "failed"
  if (status === "completed" || status === "success") return "completed"
  if (status === "paused") return "paused"
  if (status === "looping") return "looping"
  return "queued"
}

export function templateNameFor(id: string) {
  return workflowTemplates.find((item) => item.id === id)?.name ?? id
}

export function formatWhen(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function formatDurationMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`
  const hr = Math.floor(min / 60)
  const minRem = min % 60
  return minRem ? `${hr}h ${minRem}m` : `${hr}h`
}

export function resolveActiveDurationMs(input: {
  status?: string
  activeDurationMs?: number | null
  activeSegmentStartedAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
}, now = Date.now()) {
  const base = input.activeDurationMs ?? 0
  if (input.status === "running" && input.activeSegmentStartedAt) {
    const seg = Math.max(0, now - new Date(input.activeSegmentStartedAt).getTime())
    return base + seg
  }
  if (input.activeDurationMs != null) return base
  return null
}

export function formatDuration(start?: string | null, end?: string | null) {
  if (!start) return "—"
  const a = new Date(start).getTime()
  const b = end ? new Date(end).getTime() : Date.now()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "—"
  return formatDurationMs(b - a)
}

export function formatActiveDuration(input: {
  status?: string
  activeDurationMs?: number | null
  activeSegmentStartedAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
}, now = Date.now()) {
  const active = resolveActiveDurationMs(input, now)
  if (active != null) return formatDurationMs(active)
  return formatDuration(input.startedAt, input.finishedAt)
}

export function instanceFromRuntime(run: WorkflowRunListItem, entity: WorkflowEntity): WorkflowInstanceItem {
  const inst = getWorkflowEntityInstance(run.id)
  const snapshot = inst?.templateSnapshot
  return {
    id: run.id,
    name: run.name,
    templateId: run.templateId,
    templateName: templateNameFor(run.templateId),
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    activeDurationMs: run.activeDurationMs,
    activeSegmentStartedAt: run.activeSegmentStartedAt,
    updatedAt: run.updatedAt,
    progressPercent: run.progress.percent,
    completedNodes: run.progress.completedNodes,
    totalNodes: run.progress.totalNodes,
    labels: [run.defaultLabel, ...run.labels],
    source: "runtime",
    currentNodeIds: run.currentNodeIds,
    nodeStates: run.nodeStates,
    tokenUsage: tokenUsageFromListItem(run),
    entity,
    templateMissing: inst?.templateMissingFromRegistry,
    templateSnapshot: snapshot ? serializeWorkflowTemplateSnapshot(snapshot) : undefined,
  }
}

function previewEntityFromRunListItem(run: WorkflowRunListItem): WorkflowEntity {
  const template = workflowTemplates.find((item) => item.id === run.templateId) ?? workflowTemplates[0]
  const status = mapDisplayStatus(run.status)
  const columns = template?.columns ?? []
  const currentColumn = Math.max(1, Math.min(columns.length || 1, run.progress.completedNodes + (run.progress.runningNodes > 0 ? 1 : 0) || 1))
  const columnStates = columns.map((column, index) => {
    const columnIndex = index + 1
    let state: NodeState = "waiting"
    if (columnIndex < currentColumn) state = "done"
    else if (columnIndex === currentColumn) {
      state = status === "running" || status === "looping"
        ? "running"
        : status === "queued"
          ? "queued"
          : status === "failed"
            ? "failed"
            : "waiting"
    }
    const parallel = column.lanes.reduce((sum, lane) => sum + lane.nodeIds.length, 0)
    return { columnId: column.id, state, parallel: Math.max(1, parallel), done: state === "done" ? parallel : 0 }
  })

  return {
    id: run.id,
    templateId: run.templateId,
    name: run.name,
    status,
    workingDirectory: template?.workingDirectory ?? "",
    currentColumn,
    currentStageId: columns[currentColumn - 1]?.stageId ?? template?.stages[0]?.id ?? "",
    runtime: "backend-opencode",
    model: run.defaultLabel,
    queuePosition: 0,
    progress: run.progress.percent,
    columnStates,
    activeAgents: [],
    logs: [],
    filesTouched: [],
    artifacts: [],
    toolsUsed: [],
    latestOutput: run.error ?? "Run summary loaded.",
    tokenUsage: tokenUsageFromListItem(run),
  }
}

export function mergeInstances(runtimeRuns: WorkflowRunListItem[]): WorkflowInstanceItem[] {
  return runtimeRuns.map((run) => {
    const entity =
      getWorkflowEntityInstance(run.id)?.toEntity() ??
      previewEntityFromRunListItem(run)
    const next = instanceFromRuntime(run, entity)
    const prev = instanceCache.get(run.id)
    if (prev && instanceSnapshotKey(prev) === instanceSnapshotKey(next)) return prev
    instanceCache.set(run.id, next)
    return next
  })
}

export function filterAndSortInstances(items: WorkflowInstanceItem[], query: string, sortMode: WorkflowSortMode) {
  const q = query.trim().toLowerCase()
  const filtered = items.filter((item) => {
    if (!q) return true
    const haystack = [
      item.name,
      item.templateId,
      item.templateName,
      item.status,
      formatWhen(item.createdAt),
      formatWhen(item.startedAt),
      formatWhen(item.finishedAt),
      ...item.labels,
    ].join(" ").toLowerCase()
    return haystack.includes(q)
  })

  return filtered.sort((a, b) => {
    if (sortMode === "template") return a.templateName.localeCompare(b.templateName) || b.createdAt.localeCompare(a.createdAt)
    if (sortMode === "name") return a.name.localeCompare(b.name) || b.createdAt.localeCompare(a.createdAt)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function itemLabels(labels: string[]) {
  return [...new Set(labels.filter(Boolean))]
}

/** Active runs only — for optional filtering in list views. */
export function filterActiveInstances(items: WorkflowInstanceItem[]) {
  return items.filter((item) => ["running", "looping", "queued", "paused"].includes(item.status))
}
