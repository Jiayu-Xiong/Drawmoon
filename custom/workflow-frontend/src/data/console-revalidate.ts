import { markRuntimeSuccess } from "../api/http-client"
import type { View } from "../pages/console/navigation"
import { fetchWorkflowRunsInDisplayThread, setCachedRuns, syncRunMonitors } from "../runtime-bridge"
import { ensureRuntimeCache } from "./runtime-cache"
import { bootstrapTemplateRegistry, revalidateTemplateCatalog } from "./template-store"
import { ensureToolsLoaded } from "./tools-store"

export type RevalidateScope = "templates" | "runs" | "runtime" | "tools" | "all"

export async function revalidateConsoleData(scope: RevalidateScope = "all") {
  const tasks: Promise<unknown>[] = []

  if (scope === "all" || scope === "templates") {
    tasks.push(bootstrapTemplateRegistry({ background: true }))
    tasks.push(revalidateTemplateCatalog())
  }
  if (scope === "all" || scope === "tools") {
    tasks.push(ensureToolsLoaded().catch(() => undefined))
  }
  if (scope === "all" || scope === "runs") {
    tasks.push(
      fetchWorkflowRunsInDisplayThread()
        .then((runs) => {
          setCachedRuns(runs)
          syncRunMonitors(runs)
          markRuntimeSuccess()
        })
        .catch(() => undefined),
    )
  }
  if (scope === "all" || scope === "runtime") {
    tasks.push(ensureRuntimeCache({ force: false }).catch(() => undefined))
  }

  await Promise.allSettled(tasks)
}

export function scheduleRevalidateForView(view: View) {
  switch (view) {
    case "detail":
    case "entities":
      void revalidateConsoleData("all")
      break
    case "editor":
    case "templateGen":
      void revalidateConsoleData("templates")
      break
    case "tools":
      void revalidateConsoleData("tools")
      break
    case "system":
    case "agentModes":
    case "llmApi":
      void revalidateConsoleData("runtime")
      break
    default:
      break
  }
}
