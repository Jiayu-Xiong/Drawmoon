/**
 * Background execution queue — keeps workflow runs off the HTTP request path
 * and serializes heavy run scheduling without blocking the event loop synchronously.
 */

import type { WorkflowRunStartOptions } from "./types.js"

type QueuedTask = () => Promise<void>

interface PendingRunTask {
  options: WorkflowRunStartOptions
  startAtNodeId?: string
}

export class WorkflowExecutionQueue {
  private tasks: QueuedTask[] = []
  private draining = false
  private gracefulStop = false
  private pendingByRun = new Map<string, PendingRunTask[]>()

  /** Defer executeRun until the active run slot is free (retry while running). */
  deferRunResume(runId: string, options: WorkflowRunStartOptions, startAtNodeId?: string) {
    const queue = this.pendingByRun.get(runId) ?? []
    queue.push({ options, startAtNodeId })
    this.pendingByRun.set(runId, queue)
  }

  takeDeferredRunResume(runId: string): PendingRunTask | undefined {
    const queue = this.pendingByRun.get(runId)
    if (!queue?.length) {
      this.pendingByRun.delete(runId)
      return undefined
    }
    const next = queue.shift()!
    if (!queue.length) this.pendingByRun.delete(runId)
    return next
  }

  hasDeferredRunResume(runId: string): boolean {
    return (this.pendingByRun.get(runId)?.length ?? 0) > 0
  }

  /** Request graceful stop: in-flight nodes finish, then no new runs start. */
  requestGracefulStop() {
    this.gracefulStop = true
  }

  isGracefulStopRequested() {
    return this.gracefulStop
  }

  resetGracefulStop() {
    this.gracefulStop = false
  }

  enqueue(task: QueuedTask) {
    if (this.gracefulStop) return
    this.tasks.push(task)
    void this.drain()
  }

  private async drain() {
    if (this.draining) return
    this.draining = true
    try {
      while (this.tasks.length > 0 && !this.gracefulStop) {
        const task = this.tasks.shift()
        if (task) await task()
      }
    } finally {
      this.draining = false
      if (this.tasks.length > 0 && !this.gracefulStop) void this.drain()
    }
  }

  get pendingCount() {
    return this.tasks.length
  }
}

export const workflowExecutionQueue = new WorkflowExecutionQueue()
