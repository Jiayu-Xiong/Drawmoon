import {
  getWorkflowRun,
  streamWorkflowRun,
  type WorkflowRunLifecycleEvent,
  type WorkflowRunRecord,
  type WorkflowRunStoredEvent,
} from "../api"

export interface WorkflowStreamLogEntry {
  time: string
  level: "info" | "warn" | "error"
  message: string
  nodeId?: string
}

export interface WorkflowRunStreamHandlers {
  onEvent?: (event: WorkflowRunStoredEvent) => void
  onLog?: (entry: WorkflowStreamLogEntry) => void
  onLiveOutput?: (nodeId: string, text: string, append: boolean) => void
  onNodeLifecycle?: (event: WorkflowRunLifecycleEvent) => void
  onRunUpdated?: (run: WorkflowRunRecord) => void
}

const TERMINAL_WORKFLOW_EVENTS = new Set([
  "workflow_completed",
  "workflow_failed",
  "workflow_cancelled",
])

let lastDetailRefreshAt = 0

function formatStreamMessage(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed) return null
  const tool = trimmed.match(/^opencode\s+(.+)$/i)
  if (tool) return `工具调用: ${tool[1]}`
  return trimmed
}

function formatTime(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  } catch {
    return timestamp.slice(-8)
  }
}

function isLifecycleEvent(event: WorkflowRunStoredEvent): event is WorkflowRunLifecycleEvent {
  return event.type.startsWith("workflow_") || event.type.startsWith("node_")
}

function lifecycleMessage(event: WorkflowRunLifecycleEvent): string {
  switch (event.type) {
    case "workflow_queued":
      return "Workflow queued"
    case "workflow_started":
      return "Workflow started"
    case "workflow_completed":
      return "Workflow completed"
    case "workflow_failed":
      return `Workflow failed${event.error ? `: ${event.error}` : ""}`
    case "workflow_cancelled":
      return "Workflow cancelled"
    case "workflow_paused":
      return `Workflow paused${event.error ? `: ${event.error}` : ""}`
    case "node_started":
      return `Node started: ${event.nodeId ?? "unknown"}`
    case "node_completed":
      return `Node completed: ${event.nodeId ?? "unknown"}`
    case "node_failed":
      return `Node failed: ${event.nodeId ?? "unknown"}${event.error ? ` — ${event.error}` : ""}`
    case "node_cancelled":
      return `Node cancelled: ${event.nodeId ?? "unknown"}`
    case "node_paused":
      return `Node paused: ${event.nodeId ?? "unknown"}${event.error ? ` — ${event.error}` : ""}`
    default:
      return event.type
  }
}

export class WorkflowRunStreamContext {
  private activeNodeIds = new Set<string>()
  private sessionToNode = new Map<string, string>()
  private lastStdoutNodeId: string | null = null

  reset() {
    this.activeNodeIds.clear()
    this.sessionToNode.clear()
    this.lastStdoutNodeId = null
  }

  private bindSession(sessionId: string, nodeId: string) {
    this.sessionToNode.set(sessionId, nodeId)
  }

  private markNodeStarted(nodeId: string) {
    this.activeNodeIds.add(nodeId)
    this.lastStdoutNodeId = nodeId
  }

  private markNodeEnded(nodeId: string) {
    this.activeNodeIds.delete(nodeId)
    for (const [sessionId, bound] of this.sessionToNode.entries()) {
      if (bound === nodeId) this.sessionToNode.delete(sessionId)
    }
    if (this.lastStdoutNodeId === nodeId) {
      this.lastStdoutNodeId = [...this.activeNodeIds][0] ?? null
    }
  }

  resolveStdoutNodeId(event: WorkflowRunStoredEvent): string | null {
    if ("nodeId" in event && event.nodeId && event.nodeId !== "opencode" && event.nodeId !== "llm-api") {
      return event.nodeId
    }
    if ("sessionId" in event && typeof event.sessionId === "string") {
      const bound = this.sessionToNode.get(event.sessionId)
      if (bound) return bound
    }
    if (this.lastStdoutNodeId) return this.lastStdoutNodeId
    const first = [...this.activeNodeIds][0]
    return first ?? null
  }

  handle(event: WorkflowRunStoredEvent, handlers: WorkflowRunStreamHandlers) {
    handlers.onEvent?.(event)

    if (isLifecycleEvent(event)) {
      handlers.onNodeLifecycle?.(event)
      const level = event.type.includes("failed") ? "error" : event.type.includes("cancelled") ? "warn" : "info"
      handlers.onLog?.({
        time: formatTime(event.timestamp),
        level,
        message: lifecycleMessage(event),
        nodeId: event.nodeId,
      })

      if ((event.type === "node_started" || event.type === "node_paused") && event.nodeId) {
        this.markNodeStarted(event.nodeId)
      } else if (
        (event.type === "node_completed" || event.type === "node_failed" || event.type === "node_cancelled")
        && event.nodeId
      ) {
        this.markNodeEnded(event.nodeId)
      }
      return
    }

    if (event.type === "session" && "sessionId" in event && typeof event.sessionId === "string") {
      const nodeId = this.resolveStdoutNodeId(event)
      if (nodeId) this.bindSession(event.sessionId, nodeId)
      return
    }

    if (event.type === "stdout" && "data" in event && typeof event.data === "string") {
      const nodeId = this.resolveStdoutNodeId(event)
      if (nodeId) handlers.onLiveOutput?.(nodeId, event.data, true)
      return
    }

    if (event.type === "progress" && "message" in event && typeof event.message === "string") {
      const message = formatStreamMessage(event.message)
      if (!message) return
      handlers.onLog?.({
        time: formatTime(event.timestamp),
        level: "info",
        message,
        nodeId: this.resolveStdoutNodeId(event) ?? undefined,
      })
      return
    }

    if (event.type === "stderr" && "data" in event && typeof event.data === "string") {
      const snippet = event.data.trim().slice(0, 240)
      if (!snippet) return
      handlers.onLog?.({
        time: formatTime(event.timestamp),
        level: "warn",
        message: snippet,
        nodeId: this.resolveStdoutNodeId(event) ?? undefined,
      })
    }
  }
}

export async function subscribeWorkflowRunStream(
  runId: string,
  handlers: WorkflowRunStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const context = new WorkflowRunStreamContext()

  const refreshRun = async (light = true) => {
    const now = Date.now()
    if (light && now - lastDetailRefreshAt < 4000) return
    lastDetailRefreshAt = now
    try {
      const run = await getWorkflowRun(runId, { light })
      handlers.onRunUpdated?.(run)
    } catch {
      // Keep streaming on transient refresh errors.
    }
  }

  const consumeStream = async () => {
    for await (const event of streamWorkflowRun(runId, signal)) {
      context.handle(event, handlers)

      if (isLifecycleEvent(event) && event.type === "workflow_started") {
        void refreshRun(true)
      }

      if (isLifecycleEvent(event) && TERMINAL_WORKFLOW_EVENTS.has(event.type)) {
        await refreshRun(false)
        return
      }

      if (isLifecycleEvent(event) && event.type === "workflow_paused") {
        await refreshRun(false)
      }
    }
  }

  while (!signal?.aborted) {
    try {
      await consumeStream()
      return
    } catch {
      if (signal?.aborted) return
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
}
