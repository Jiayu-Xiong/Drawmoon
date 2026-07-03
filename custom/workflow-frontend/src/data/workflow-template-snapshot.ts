import type { WorkflowTemplate } from "./console-model"
import { getWorkflowUiTemplate, importWorkflowUiTemplateFromJson } from "./template-registry"
import { saveDrawmoonWorkflowTemplate } from "../api/drawmoon"

export const WORKFLOW_TEMPLATE_SNAPSHOT_KEY = "workflowTemplateSnapshot"

export function serializeWorkflowTemplateSnapshot(template: WorkflowTemplate): Record<string, unknown> {
  return JSON.parse(JSON.stringify(template)) as Record<string, unknown>
}

export function parseWorkflowTemplateSnapshot(raw: unknown): WorkflowTemplate | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== "string" || !Array.isArray(record.nodes)) return null
  return raw as WorkflowTemplate
}

export function resolveWorkflowTemplate(
  templateId: string,
  snapshot?: unknown,
): WorkflowTemplate | undefined {
  const fromRegistry = getWorkflowUiTemplate(templateId)
  if (fromRegistry) return fromRegistry
  const fromSnapshot = parseWorkflowTemplateSnapshot(snapshot)
  if (fromSnapshot && fromSnapshot.id === templateId) return fromSnapshot
  return fromSnapshot ?? undefined
}

export function isTemplateMissingFromRegistry(templateId: string, snapshot?: unknown): boolean {
  if (getWorkflowUiTemplate(templateId)) return false
  return Boolean(parseWorkflowTemplateSnapshot(snapshot))
}

export async function restoreWorkflowTemplateFromSnapshot(snapshot: unknown): Promise<WorkflowTemplate> {
  const template = parseWorkflowTemplateSnapshot(snapshot)
  if (!template) throw new Error("Invalid workflow template snapshot")
  await saveDrawmoonWorkflowTemplate(template)
  importWorkflowUiTemplateFromJson(template)
  return template
}
