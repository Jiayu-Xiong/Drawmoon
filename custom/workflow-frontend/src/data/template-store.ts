import { createSignal } from "solid-js"

import { fetchDrawmoonWorkflowTemplates, getHealth, listTemplates } from "../api/runtime-api"
import type { WorkflowTemplateInfo } from "../api/types/workflow-runs"
import { getBootstrappedWorkflowTemplates, ensureTemplateBootstrap } from "./bootstrap-templates"
import {
  ensureDrawmoonWorkflowTemplates,
  getDrawmoonTemplateHydration,
  subscribeDrawmoonWorkflowTemplatesHydrated,
} from "./drawmoon/templates-sync"
import { REPO_STARTER_TEMPLATE_IDS } from "./loading-workflow-template"

export const [templateRegistryVersion, setTemplateRegistryVersion] = createSignal(0)
export const [templateCatalogVersion, setTemplateCatalogVersion] = createSignal(0)
export const [templatesEverReady, setTemplatesEverReady] = createSignal(false)

let cachedTemplateCatalog: WorkflowTemplateInfo[] = []

export const [backendEverOnline, setBackendEverOnline] = createSignal(false)
export const [templateRevalidating, setTemplateRevalidating] = createSignal(false)

export interface TemplateBootstrapResult {
  backendOnline: boolean
  templateCount: number
  message: string | null
}

export const [templateBootstrapResult, setTemplateBootstrapResult] = createSignal<TemplateBootstrapResult>({
  backendOnline: true,
  templateCount: 0,
  message: null,
})

function syncTemplatesEverReady(templateCount: number) {
  if (templateCount > 0) setTemplatesEverReady(true)
}

subscribeDrawmoonWorkflowTemplatesHydrated(() => {
  setTemplateRegistryVersion((value) => value + 1)
})

export async function bootstrapTemplateRegistry(options?: { background?: boolean }): Promise<TemplateBootstrapResult> {
  const cachedCount = getBootstrappedWorkflowTemplates().length
  if (cachedCount > 0) setTemplatesEverReady(true)

  const revalidating = Boolean(options?.background && cachedCount > 0)
  if (revalidating) setTemplateRevalidating(true)

  try {
    const backendOnline = await getHealth().catch(() => false)
    if (!backendOnline) {
      const everOnline = backendEverOnline()
      const result: TemplateBootstrapResult = {
        backendOnline: false,
        templateCount: cachedCount,
        message: everOnline || cachedCount > 0
          ? null
          : "后端未启动：请在 xy/backend/opencode 启动 runtime（端口 3456）",
      }
      if (!everOnline && !cachedCount) setTemplateBootstrapResult(result)
      return result
    }

    setBackendEverOnline(true)
    ensureTemplateBootstrap()
    await ensureDrawmoonWorkflowTemplates()
    setTemplateRegistryVersion((value) => value + 1)

    const hydration = getDrawmoonTemplateHydration()
    const templateCount = getBootstrappedWorkflowTemplates().length
    syncTemplatesEverReady(templateCount)

    let message: string | null = null
    if (!templateCount) {
      if (hydration.state === "error") {
        message = `工作流模板加载失败：${hydration.message}`
      } else if (hydration.state === "ready" && hydration.imported === 0) {
        message = "~/.drawmoon/templates/workflows 为空，请 seed 或添加模板 JSON"
      } else {
        message = "未加载到工作流模板（drawmoon 同步未完成）"
      }
    } else if (hydration.failures.length) {
      message = `部分模板导入失败（${hydration.failures.length}）：${hydration.failures.slice(0, 2).join("; ")}`
    }

    const result: TemplateBootstrapResult = { backendOnline: true, templateCount, message }
    setTemplateBootstrapResult(result)
    return result
  } finally {
    if (revalidating) setTemplateRevalidating(false)
  }
}

/** Cache-first revalidation: returns immediately when registry is warm. */
export function revalidateTemplateRegistry() {
  void bootstrapTemplateRegistry({ background: true })
}

export function bumpTemplateRegistryVersion() {
  setTemplateRegistryVersion((value) => value + 1)
}

export function useWorkflowTemplateList(): WorkflowTemplate[] {
  templateRegistryVersion()
  return getBootstrappedWorkflowTemplates()
}

export function getCachedTemplateCatalog(): WorkflowTemplateInfo[] {
  templateCatalogVersion()
  return cachedTemplateCatalog
}

export async function revalidateTemplateCatalog(): Promise<WorkflowTemplateInfo[]> {
  try {
    const catalog = await loadWorkflowTemplateCatalog()
    cachedTemplateCatalog = catalog
    setTemplateCatalogVersion((value) => value + 1)
    return catalog
  } catch {
    return cachedTemplateCatalog
  }
}

export async function loadWorkflowTemplateCatalog(): Promise<WorkflowTemplateInfo[]> {
  const [builtin, drawmoonMetas] = await Promise.all([
    listTemplates().catch(() => [] as WorkflowTemplateInfo[]),
    fetchDrawmoonWorkflowTemplates().catch(() => []),
  ])
  const byId = new Map<string, WorkflowTemplateInfo>()
  for (const template of builtin) {
    if (!REPO_STARTER_TEMPLATE_IDS.has(template.id)) byId.set(template.id, template)
  }
  for (const meta of drawmoonMetas) {
    byId.set(meta.id, {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      version: "drawmoon",
      defaultLabel: meta.id,
      labels: [],
      nodeCount: meta.nodeCount ?? 0,
      edgeCount: meta.edgeCount ?? 0,
    })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}
