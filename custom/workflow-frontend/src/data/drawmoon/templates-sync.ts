import { fetchDrawmoonWorkflowTemplates, fetchDrawmoonWorkflowTemplate, getHealth } from "../../api/runtime-api"
import type { WorkflowTemplate } from "../console-model"
import { normalizeTemplateExecutor } from "../node-executor-binding"
import { importWorkflowUiTemplateFromJson } from "../template-registry"
import { rebindWorkflowEntityTemplates } from "../workflow-entity"

let hydrated = false
let hydrating: Promise<void> | null = null
const listeners = new Set<() => void>()

export interface DrawmoonTemplateHydration {
  state: "idle" | "loading" | "ready" | "error"
  imported: number
  failures: string[]
  message: string | null
}

let hydrationSnapshot: DrawmoonTemplateHydration = {
  state: "idle",
  imported: 0,
  failures: [],
  message: null,
}

export function getDrawmoonTemplateHydration(): DrawmoonTemplateHydration {
  return hydrationSnapshot
}

export function isDrawmoonWorkflowTemplatesHydrating() {
  return hydrating !== null && !hydrated
}

function notifyHydrated() {
  listeners.forEach((listener) => listener())
}

export function subscribeDrawmoonWorkflowTemplatesHydrated(listener: () => void) {
  listeners.add(listener)
  if (hydrated) listener()
  return () => listeners.delete(listener)
}

export function isDrawmoonWorkflowTemplatesHydrated() {
  return hydrated
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function hydrateDrawmoonWorkflowTemplates() {
  if (hydrated) return
  if (hydrating) return hydrating
  hydrationSnapshot = { state: "loading", imported: 0, failures: [], message: null }
  hydrating = (async () => {
    try {
      const healthOk = await getHealth().catch(() => false)
      if (!healthOk) {
        hydrationSnapshot = {
          state: "error",
          imported: 0,
          failures: [],
          message: "后端未启动 (127.0.0.1:3456)",
        }
        return
      }
      const metas = await fetchDrawmoonWorkflowTemplates()
      let imported = 0
      const failures: string[] = []
      await Promise.all(metas.map(async (meta) => {
        try {
          const template = await fetchDrawmoonWorkflowTemplate(meta.id)
          const rebound = normalizeTemplateExecutor(template as WorkflowTemplate)
          importWorkflowUiTemplateFromJson(rebound)
          imported += 1
        } catch (err) {
          failures.push(`${meta.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }))
      if (failures.length) {
        console.warn("[drawmoon] workflow template import failures:", failures.join("; "))
      }
      if (imported > 0) {
        console.info(`[drawmoon] loaded ${imported} workflow template(s) from ~/.drawmoon`)
        hydrated = true
        hydrationSnapshot = { state: "ready", imported, failures, message: null }
        rebindWorkflowEntityTemplates()
        notifyHydrated()
        return
      }
      if (metas.length === 0) {
        hydrated = true
        hydrationSnapshot = { state: "ready", imported: 0, failures, message: null }
        notifyHydrated()
        return
      }
      hydrationSnapshot = {
        state: "error",
        imported: 0,
        failures,
        message: failures[0] ?? "模板导入全部失败",
      }
    } catch (err) {
      hydrationSnapshot = {
        state: "error",
        imported: 0,
        failures: [],
        message: err instanceof Error ? err.message : String(err),
      }
    } finally {
      hydrating = null
    }
  })()
  return hydrating
}

export async function ensureDrawmoonWorkflowTemplates(options?: { maxAttempts?: number }) {
  const maxAttempts = options?.maxAttempts ?? 12
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (hydrated) return
    if (attempt > 0) resetDrawmoonWorkflowTemplateHydration()
    await hydrateDrawmoonWorkflowTemplates()
    if (hydrated) return
    await sleep(400 + attempt * 600)
  }
}

export function resetDrawmoonWorkflowTemplateHydration() {
  hydrated = false
  hydrating = null
  hydrationSnapshot = { state: "idle", imported: 0, failures: [], message: null }
}

export async function importSavedDrawmoonWorkflowTemplate(id: string) {
  const template = await fetchDrawmoonWorkflowTemplate(id)
  const rebound = normalizeTemplateExecutor(template as WorkflowTemplate)
  importWorkflowUiTemplateFromJson(rebound)
  hydrated = true
  hydrationSnapshot = { state: "ready", imported: 1, failures: [], message: null }
  rebindWorkflowEntityTemplates()
  notifyHydrated()
}
