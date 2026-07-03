/**
 * Main-thread bridge to the workflow execution worker.
 * HTTP handlers stay responsive while runs execute in a dedicated Bun Worker.
 */

import type { WorkflowRunStartOptions } from "../types.js"
import type { ExecutionWorkerInbound, ExecutionWorkerOutbound } from "./types.js"

interface ExecutionWorkerHandle {
  postMessage(message: unknown): void
  addEventListener(type: string, listener: (event: MessageEvent) => void): void
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void
  terminate(): void
}

declare const Worker: new (url: string | URL) => ExecutionWorkerHandle

export interface ExecutionBridgeOptions {
  dataDir: string
  cacheMode?: "off" | "input-only" | "files-aware"
}

const bridges = new Map<string, WorkflowExecutionBridge>()

export function getExecutionBridge(options: ExecutionBridgeOptions): WorkflowExecutionBridge {
  const key = `${options.dataDir}::${options.cacheMode ?? "input-only"}`
  let bridge = bridges.get(key)
  if (!bridge) {
    bridge = new WorkflowExecutionBridge(options)
    bridges.set(key, bridge)
  }
  return bridge
}

export class WorkflowExecutionBridge {
  private worker: ExecutionWorkerHandle | null = null
  private initPromise: Promise<void> | null = null
  private readonly dataDir: string
  private readonly cacheMode: "off" | "input-only" | "files-aware"

  constructor(options: ExecutionBridgeOptions) {
    this.dataDir = options.dataDir
    this.cacheMode = options.cacheMode ?? "input-only"
  }

  private ensureWorker(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.worker = new Worker(new URL("./execution-worker.ts", import.meta.url).href)
    this.initPromise = new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as ExecutionWorkerOutbound
        if (data?.type === "ready") {
          this.worker?.removeEventListener("message", onMessage)
          resolve()
        }
      }
      const onError = (error: MessageEvent) => {
        this.worker?.removeEventListener("error", onError)
        reject(error.data ?? new Error("execution worker failed"))
      }
      this.worker!.addEventListener("message", onMessage)
      this.worker!.addEventListener("error", onError)
      const init: ExecutionWorkerInbound = {
        type: "init",
        dataDir: this.dataDir,
        cacheMode: this.cacheMode,
      }
      this.worker!.postMessage(init)
    })
    return this.initPromise
  }

  async executeRun(runId: string, options: WorkflowRunStartOptions = {}, startAtNodeId?: string): Promise<void> {
    await this.ensureWorker()
    if (!this.worker) return
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as ExecutionWorkerOutbound
        if (data?.type !== "execute-done" || data.runId !== runId) return
        this.worker?.removeEventListener("message", onMessage)
        if (data.error) {
          console.error(`[execution-bridge] run ${runId} failed: ${data.error}`)
          resolve()
          return
        }
        else resolve()
      }
      this.worker!.addEventListener("message", onMessage)
      const payload: ExecutionWorkerInbound = {
        type: "execute",
        runId,
        options,
        startAtNodeId,
      }
      this.worker!.postMessage(payload)
    })
  }

  async cancelRun(runId: string): Promise<void> {
    await this.ensureWorker()
    this.worker?.postMessage({ type: "cancel", runId } satisfies ExecutionWorkerInbound)
  }

  async shutdown(reason?: string): Promise<void> {
    if (!this.worker) return
    this.worker.postMessage({ type: "shutdown", reason } satisfies ExecutionWorkerInbound)
    this.worker.terminate()
    this.worker = null
    this.initPromise = null
  }
}
