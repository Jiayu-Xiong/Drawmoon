import { ensureCopilotLlmBind } from "./llm-api-bind/bootstrap"
import { registerWorkflowUiTemplate, listWorkflowUiTemplates, unregisterWorkflowUiTemplate } from "./template-registry"
import { ensureLlmApiTemplatesRegistered } from "./llm-api-templates"
import { ensureAgentModeTemplatesRegistered } from "./agent-mode-templates"
import { ensureCliTemplatesRegistered } from "./cli-templates"
import { mockWorkflowTemplates } from "./paper-template"
import { hydrateDrawmoonRegistry } from "./drawmoon/registry-sync"
import { hydrateDrawmoonWorkflowTemplates } from "./drawmoon/templates-sync"
import { LOADING_WORKFLOW_TEMPLATE, REPO_STARTER_TEMPLATE_IDS } from "./loading-workflow-template"
import type { WorkflowTemplate } from "./console-model"
import { invalidateRuntimeCache } from "./runtime-cache"

const TEMPLATE_OVERRIDE_STORAGE_KEY = "drawmoon.workflow-template-overrides"

export function saveWorkflowTemplateOverride(template: WorkflowTemplate) {
  if (typeof localStorage === "undefined") return
  try {
    const raw = localStorage.getItem(TEMPLATE_OVERRIDE_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) as Record<string, WorkflowTemplate> : {}
    map[template.id] = template
    localStorage.setItem(TEMPLATE_OVERRIDE_STORAGE_KEY, JSON.stringify(map))
    void import("./template-store").then((m) => m.revalidateTemplateRegistry())
    invalidateRuntimeCache()
  } catch {
    // ignore quota / private mode
  }
}

function loadWorkflowTemplateOverride(id: string): WorkflowTemplate | undefined {
  if (typeof localStorage === "undefined") return undefined
  try {
    const raw = localStorage.getItem(TEMPLATE_OVERRIDE_STORAGE_KEY)
    if (!raw) return undefined
    const map = JSON.parse(raw) as Record<string, WorkflowTemplate>
    return map[id]
  } catch {
    return undefined
  }
}

let initialized = false

function purgeRepoStarterTemplates() {
  for (const id of REPO_STARTER_TEMPLATE_IDS) unregisterWorkflowUiTemplate(id)
}

export function ensureTemplateBootstrap() {
  if (initialized) return
  ensureLlmApiTemplatesRegistered()
  ensureAgentModeTemplatesRegistered()
  ensureCliTemplatesRegistered()
  void ensureCopilotLlmBind()
  void hydrateDrawmoonRegistry()
  void hydrateDrawmoonWorkflowTemplates()

  purgeRepoStarterTemplates()

  for (const template of mockWorkflowTemplates) {
    registerWorkflowUiTemplate(template)
  }

  initialized = true
}

export function getBootstrappedWorkflowTemplates() {
  ensureTemplateBootstrap()
  purgeRepoStarterTemplates()
  return listWorkflowUiTemplates().filter((template) => !REPO_STARTER_TEMPLATE_IDS.has(template.id))
}

export function getPaperTemplate(): WorkflowTemplate | undefined {
  ensureTemplateBootstrap()
  return getBootstrappedWorkflowTemplates().find((template) => template.id === "journal-paper-default")
    ?? getBootstrappedWorkflowTemplates().find((template) => template.id === "paper-journal-default")
}

export function resolveDefaultWorkflowTemplate(): WorkflowTemplate {
  const templates = getBootstrappedWorkflowTemplates()
  const preferred = templates.find((template) => template.id === "paper-journal-default")
    ?? templates.find((template) => template.id === "journal-paper-default")
    ?? templates.find((template) => template.id.includes("paper") || template.id.includes("tmm") || template.id.includes("iclr"))
  return preferred ?? templates[0] ?? LOADING_WORKFLOW_TEMPLATE
}
