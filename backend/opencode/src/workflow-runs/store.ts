import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { WorkflowRunListItem, WorkflowRunProgress, WorkflowRunRecord, WorkflowRunStatus } from "./types.js"

export interface WorkflowRunStoreOptions {
  dataDir: string
}

export abstract class WorkflowRunStoreBase {
  abstract create(record: WorkflowRunRecord): WorkflowRunRecord
  abstract get(id: string): WorkflowRunRecord | null
  abstract save(record: WorkflowRunRecord): WorkflowRunRecord
  abstract delete(id: string): boolean
  abstract list(): WorkflowRunListItem[]
  abstract listLightweight(): WorkflowRunListItem[]
  abstract updateLabels(id: string, labels: string[], defaultLabel?: string): WorkflowRunRecord | null
  abstract updateMetadata(id: string, metadata: { name?: string; labels?: string[]; defaultLabel?: string }): WorkflowRunRecord | null
  abstract markOrphanedRunsFailed(reason: string): WorkflowRunRecord[]
}

export class FileWorkflowRunStore extends WorkflowRunStoreBase {
  readonly dataDir: string
  private listCache: { items: WorkflowRunListItem[]; at: number; indexMtime: number } | null = null
  private recordCache = new Map<string, { record: WorkflowRunRecord; at: number; mtimeMs: number }>()
  private indexCache: { items: WorkflowRunListItem[]; at: number } | null = null
  private static LIST_CACHE_TTL = 2000 // 2s
  private static RECORD_CACHE_TTL = 5000 // 5s

  constructor(options: WorkflowRunStoreOptions) {
    super()
    this.dataDir = join(options.dataDir, "workflow-runs")
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }
  }

  create(record: WorkflowRunRecord): WorkflowRunRecord {
    return this.save(record)
  }

  get(id: string): WorkflowRunRecord | null {
    const path = this.runPath(id)
    const cached = this.recordCache.get(id)
    if (cached) {
      try {
        const mtimeMs = statSync(path).mtimeMs
        if (mtimeMs <= cached.mtimeMs && Date.now() - cached.at < FileWorkflowRunStore.RECORD_CACHE_TTL) {
          return cached.record
        }
      } catch {
        this.recordCache.delete(id)
      }
    }
    try {
      const raw = readFileSync(path, "utf-8")
      const record = JSON.parse(raw) as WorkflowRunRecord
      const mtimeMs = statSync(path).mtimeMs
      this.recordCache.set(id, { record, at: Date.now(), mtimeMs })
      return record
    } catch {
      return null
    }
  }

  save(record: WorkflowRunRecord): WorkflowRunRecord {
    const next = { ...record, updatedAt: new Date().toISOString() }
    next.progress = this.calculateProgress(next)
    writeFileSync(this.runPath(next.id), JSON.stringify(next, null, 2), "utf-8")
    this.listCache = null
    this.updateIndexFor(next)
    this.recordCache.set(next.id, { record: next, at: Date.now(), mtimeMs: statSync(this.runPath(next.id)).mtimeMs })
    return next
  }

  delete(id: string): boolean {
    try {
      const jsonPath = this.runPath(id)
      const ndjsonPath = join(this.dataDir, `${id}.events.ndjson`)
      if (existsSync(jsonPath)) unlinkSync(jsonPath)
      if (existsSync(ndjsonPath)) unlinkSync(ndjsonPath)
      this.listCache = null
      this.removeIndexItem(id)
      this.recordCache.delete(id)
      return true
    } catch {
      return false
    }
  }

  listLightweight(): WorkflowRunListItem[] {
    const indexPath = this.indexPath()
    const indexMtime = existsSync(indexPath) ? statSync(indexPath).mtimeMs : 0
    if (
      this.listCache
      && this.listCache.indexMtime === indexMtime
      && Date.now() - this.listCache.at < FileWorkflowRunStore.LIST_CACHE_TTL
    ) {
      return this.listCache.items
    }
    const items = this.readIndex()
    this.listCache = { items, at: Date.now(), indexMtime }
    return items
  }

  list(): WorkflowRunListItem[] {
    if (!existsSync(this.dataDir)) return []

    return readdirSync(this.dataDir)
      .filter((file) => file.endsWith(".json") && file !== "workflow-runs.index.json")
      .map((file) => this.get(file.slice(0, -5)))
      .filter(isWorkflowRunRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((record) => this.toListItem(record))
  }

  updateLabels(id: string, labels: string[], defaultLabel?: string): WorkflowRunRecord | null {
    const record = this.get(id)
    if (!record) return null
    record.labels = normalizeLabels(labels)
    if (defaultLabel !== undefined && defaultLabel.trim()) {
      record.defaultLabel = defaultLabel.trim()
    }
    return this.save(record)
  }

  updateMetadata(id: string, metadata: { name?: string; labels?: string[]; defaultLabel?: string }): WorkflowRunRecord | null {
    const record = this.get(id)
    if (!record) return null
    if (metadata.name !== undefined && metadata.name.trim()) {
      record.name = metadata.name.trim()
    }
    if (metadata.labels !== undefined) {
      record.labels = normalizeLabels(metadata.labels)
    }
    if (metadata.defaultLabel !== undefined && metadata.defaultLabel.trim()) {
      record.defaultLabel = metadata.defaultLabel.trim()
    }
    return this.save(record)
  }

  markOrphanedRunsFailed(reason: string): WorkflowRunRecord[] {
    const failed: WorkflowRunRecord[] = []
    for (const item of this.list()) {
      const record = this.get(item.id)
      if (!record || record.status !== "running") continue

      const timestamp = new Date().toISOString()
      record.status = "failed"
      record.finishedAt = timestamp
      record.currentNodeIds = []
      record.error = reason
      for (const nodeId of Object.keys(record.nodeStates)) {
        const state = record.nodeStates[nodeId]
        if (!state) continue
        if (state.status === "running") {
          state.status = "failed"
          state.finishedAt = timestamp
          state.error = reason
          if (!record.failedNodeIds.includes(nodeId)) {
            record.failedNodeIds.push(nodeId)
          }
        }
      }
      failed.push(this.save(record))
    }
    return failed
  }

  updateStatus(record: WorkflowRunRecord, status: WorkflowRunStatus, error?: string): WorkflowRunRecord {
    record.status = status
    record.error = error ?? record.error
    if (["completed", "failed", "cancelled"].includes(status)) {
      record.finishedAt = record.finishedAt ?? new Date().toISOString()
    }
    return this.save(record)
  }

  private runPath(id: string): string {
    return join(this.dataDir, `${id}.json`)
  }

  private indexPath(): string {
    return join(this.dataDir, "workflow-runs.index.json")
  }

  private toListItem(record: WorkflowRunRecord): WorkflowRunListItem {
    const usage = record.history?.usage
    return {
      id: record.id,
      templateId: record.templateId,
      defaultLabel: record.defaultLabel ?? record.templateId,
      labels: record.labels ?? [],
      name: record.name,
      status: record.status,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      finishedAt: record.finishedAt,
      activeDurationMs: record.activeDurationMs ?? 0,
      activeSegmentStartedAt: record.activeSegmentStartedAt ?? null,
      progress: record.progress,
      currentNodeIds: record.currentNodeIds,
      nodeStates: Object.fromEntries(
        Object.entries(record.nodeStates ?? {}).map(([nodeId, state]) => [nodeId, { status: state.status }]),
      ),
      tokenUsage: usage?.totalTokens != null ? {
        totalTokens: usage.totalTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        reasoningTokens: usage.reasoningTokens,
      } : undefined,
      error: record.error,
    }
  }

  private readIndex(): WorkflowRunListItem[] {
    if (this.indexCache && Date.now() - this.indexCache.at < FileWorkflowRunStore.LIST_CACHE_TTL) {
      return this.indexCache.items
    }
    try {
      const raw = readFileSync(this.indexPath(), "utf-8")
      const parsed = JSON.parse(raw) as { runs?: WorkflowRunListItem[] }
      let items = Array.isArray(parsed.runs)
        ? parsed.runs.filter(isWorkflowRunListItem).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : []
      if (items.length > 0 && items.some((item) => !item.nodeStates)) {
        items = this.rebuildIndex()
      }
      this.indexCache = { items, at: Date.now() }
      return items
    } catch {
      const rebuilt = this.rebuildIndex()
      this.indexCache = { items: rebuilt, at: Date.now() }
      return rebuilt
    }
  }

  private writeIndex(items: WorkflowRunListItem[]): void {
    const sorted = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    writeFileSync(this.indexPath(), JSON.stringify({ runs: sorted }, null, 2), "utf-8")
    this.indexCache = { items: sorted, at: Date.now() }
  }

  private rebuildIndex(): WorkflowRunListItem[] {
    const items = this.list()
    this.writeIndex(items)
    return items
  }

  private updateIndexFor(record: WorkflowRunRecord): void {
    const item = this.toListItem(record)
    const current = this.readIndex().filter((entry) => entry.id !== item.id)
    this.writeIndex([item, ...current])
  }

  private removeIndexItem(id: string): void {
    const current = this.readIndex().filter((entry) => entry.id !== id)
    this.writeIndex(current)
  }

  private calculateProgress(record: WorkflowRunRecord): WorkflowRunProgress {
    const states = Object.values(record.nodeStates)
    const totalNodes = states.length
    const completedNodes = states.filter((state) => state.status === "completed").length
    const failedNodes = states.filter((state) => state.status === "failed").length
    const runningNodes = states.filter((state) => state.status === "running").length
    const waitingNodes = states.filter((state) => state.status === "waiting").length
    return {
      totalNodes,
      completedNodes,
      failedNodes,
      runningNodes,
      waitingNodes,
      percent: totalNodes === 0 ? 100 : Math.round((completedNodes / totalNodes) * 100),
    }
  }
}

function normalizeLabels(labels: string[]): string[] {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function isWorkflowRunStatus(value: unknown): value is WorkflowRunStatus {
  return value === "queued" ||
    value === "running" ||
    value === "paused" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
}

function isWorkflowRunProgress(value: unknown): value is WorkflowRunProgress {
  if (!isRecord(value)) return false
  return typeof value.totalNodes === "number" &&
    typeof value.completedNodes === "number" &&
    typeof value.failedNodes === "number" &&
    typeof value.runningNodes === "number" &&
    typeof value.waitingNodes === "number" &&
    typeof value.percent === "number"
}

function isWorkflowRunListItem(value: unknown): value is WorkflowRunListItem {
  if (!isRecord(value)) return false
  return typeof value.id === "string" &&
    typeof value.templateId === "string" &&
    typeof value.defaultLabel === "string" &&
    Array.isArray(value.labels) &&
    value.labels.every((label) => typeof label === "string") &&
    typeof value.name === "string" &&
    isWorkflowRunStatus(value.status) &&
    typeof value.createdAt === "string" &&
    (typeof value.startedAt === "string" || value.startedAt === null) &&
    typeof value.updatedAt === "string" &&
    (typeof value.finishedAt === "string" || value.finishedAt === null) &&
    isWorkflowRunProgress(value.progress) &&
    (typeof value.error === "string" || value.error === null)
}

function isWorkflowRunRecord(value: unknown): value is WorkflowRunRecord {
  if (!isWorkflowRunListItem(value)) return false
  return isRecord(value) &&
    isRecord(value.graph) &&
    Array.isArray(value.currentNodeIds) &&
    Array.isArray(value.completedNodeIds) &&
    Array.isArray(value.failedNodeIds) &&
    isRecord(value.nodeStates) &&
    isRecord(value.nodeResults) &&
    isRecord(value.nodeSessions) &&
    isRecord(value.sessionGroups) &&
    isRecord(value.history)
}
