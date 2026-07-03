import type { WorkflowRunStartOptions } from "../types.js"

export type ExecutionWorkerInbound =
  | { type: "init"; dataDir: string; cacheMode: "off" | "input-only" | "files-aware" }
  | { type: "execute"; runId: string; options?: WorkflowRunStartOptions; startAtNodeId?: string }
  | { type: "cancel"; runId: string }
  | { type: "shutdown"; reason?: string }

export type ExecutionWorkerOutbound =
  | { type: "ready" }
  | { type: "execute-done"; runId: string; error?: string }
