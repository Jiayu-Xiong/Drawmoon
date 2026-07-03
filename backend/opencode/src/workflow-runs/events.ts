import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type { WorkflowRunStoredEvent } from "./types.js"

export interface WorkflowRunEventLogOptions {
  dataDir: string
}

export type WorkflowRunEventListener = (event: WorkflowRunStoredEvent) => void

export abstract class WorkflowRunEventLogBase {
  abstract append(runId: string, event: WorkflowRunStoredEvent): void
  abstract read(runId: string): WorkflowRunStoredEvent[]
  abstract subscribe(runId: string, listener: WorkflowRunEventListener): () => void
}

function streamPollMs() {
  const value = Number(process.env.WF_STREAM_POLL_MS ?? 250)
  return Number.isFinite(value) && value > 0 ? value : 250
}

export class FileWorkflowRunEventLog extends WorkflowRunEventLogBase {
  readonly dataDir: string

  constructor(options: WorkflowRunEventLogOptions) {
    super()
    this.dataDir = join(options.dataDir, "workflow-runs")
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }
  }

  append(runId: string, event: WorkflowRunStoredEvent): void {
    appendFileSync(this.eventPath(runId), JSON.stringify(event) + "\n", "utf-8")
  }

  read(runId: string): WorkflowRunStoredEvent[] {
    try {
      const raw = readFileSync(this.eventPath(runId), "utf-8")
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as WorkflowRunStoredEvent)
    } catch {
      return []
    }
  }

  /**
   * Tail the NDJSON file. Execution runs in a Bun Worker with a separate in-memory
   * listener map, so subscribe must poll the shared file for cross-thread streaming.
   */
  subscribe(runId: string, listener: WorkflowRunEventListener): () => void {
    let offset = this.read(runId).length
    const pollMs = streamPollMs()
    const poll = setInterval(() => {
      const events = this.read(runId)
      for (; offset < events.length; offset++) {
        listener(events[offset]!)
      }
    }, pollMs)
    return () => clearInterval(poll)
  }

  private eventPath(runId: string): string {
    return join(this.dataDir, `${runId}.events.ndjson`)
  }
}
