/**
 * Trace storage for workflow agent runs.
 *
 * Stores complete run traces including all events,
 * config, and results for replay and debugging.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { ulid } from "ulid"

import type { TraceRecord, RunEvent, AgentNodeConfig, AgentNodeOutput } from "./schema/types.js"

export interface TraceStoreOptions {
  dataDir: string
}

export class TraceStore {
  private dataDir: string

  constructor(options: TraceStoreOptions) {
    this.dataDir = join(options.dataDir, "traces")
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }
  }

  /**
   * Create a new trace record.
   */
  create(config: AgentNodeConfig, workflowId?: string, nodeId?: string): TraceRecord {
    const record: TraceRecord = {
      id: ulid(),
      workflowId,
      nodeId: nodeId ?? config.provider,
      config,
      events: [],
      result: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    }

    this.save(record)
    return record
  }

  /**
   * Append an event to a trace.
   */
  appendEvent(traceId: string, event: RunEvent): void {
    const record = this.get(traceId)
    if (!record) return

    record.events.push(event)
    this.save(record)
  }

  /**
   * Set the final result for a trace.
   */
  setResult(traceId: string, result: AgentNodeOutput): void {
    const record = this.get(traceId)
    if (!record) return

    record.result = result
    record.finishedAt = new Date().toISOString()
    this.save(record)
  }

  /**
   * Get a trace record by ID.
   */
  get(id: string): TraceRecord | null {
    const filePath = join(this.dataDir, `${id}.json`)
    try {
      const raw = readFileSync(filePath, "utf-8")
      return JSON.parse(raw) as TraceRecord
    } catch {
      return null
    }
  }

  /**
   * Save a trace record to disk.
   */
  save(record: TraceRecord): void {
    const filePath = join(this.dataDir, `${record.id}.json`)
    writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8")
  }

  /**
   * List all trace records.
   */
  list(): { id: string; nodeId?: string; startedAt: string; finishedAt: string | null }[] {
    if (!existsSync(this.dataDir)) return []

    return readdirSync(this.dataDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const raw = readFileSync(join(this.dataDir, f), "utf-8")
          const r = JSON.parse(raw) as TraceRecord
          return { id: r.id, nodeId: r.nodeId, startedAt: r.startedAt, finishedAt: r.finishedAt }
        } catch {
          return { id: f.replace(/\.json$/, ""), startedAt: "unknown", finishedAt: null }
        }
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  /**
   * Replay a trace's events as an async iterable.
   */
  async *replay(id: string): AsyncIterable<RunEvent> {
    const record = this.get(id)
    if (!record) return

    for (const event of record.events) {
      yield event
    }
  }
}
