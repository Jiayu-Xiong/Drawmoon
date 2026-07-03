import type { AgentRuntime } from "../runtime.js"
import { FileWorkflowRunEventLog } from "./events.js"
import { WorkflowRunRoutes } from "./routes.js"
import { WorkflowRunRunner } from "./runner.js"
import { FileWorkflowRunStore } from "./store.js"

export * from "./types.js"
export * from "./store.js"
export * from "./events.js"
export * from "./runner.js"
export * from "./routes.js"
export * from "./output-paths.js"
export * from "./artifact-file-resolver.js"
export * from "./workflow-output-route.js"
export * from "./context/index.js"

export interface WorkflowRunSystemOptions {
  dataDir: string
  runtime: AgentRuntime
  onRunStarted?: (runId: string) => void
  cacheMode?: "off" | "input-only" | "files-aware"
}

export function createWorkflowRunSystem(options: WorkflowRunSystemOptions) {
  const store = new FileWorkflowRunStore({ dataDir: options.dataDir })
  const events = new FileWorkflowRunEventLog({ dataDir: options.dataDir })
  const runner = new WorkflowRunRunner({
    runtime: options.runtime,
    store,
    events,
    dataDir: options.dataDir,
    cacheMode: options.cacheMode,
  })
  const routes = new WorkflowRunRoutes({ store, events, runner, onRunStarted: options.onRunStarted })

  return { store, events, runner, routes }
}
