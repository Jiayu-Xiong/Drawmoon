import type { WorkflowTemplate } from "../console-model"
import { migrateWorkflowTemplateIntents } from "@opencode-ai/backend-opencode/drawmoon/migrate-template-intents"
import { createTemplateRegistry, isRecord, requireString } from "./registry"

export abstract class WorkflowUiTemplateBase {
  readonly data: WorkflowTemplate

  protected constructor(data: WorkflowTemplate) {
    this.data = structuredClone(data)
  }

  get id() {
    return this.data.id
  }

  get name() {
    return this.data.name
  }

  toData(): WorkflowTemplate {
    return structuredClone(this.data)
  }
}

export class PlainWorkflowUiTemplate extends WorkflowUiTemplateBase {
  constructor(data: WorkflowTemplate) {
    super(data)
  }
}

const registry = createTemplateRegistry<WorkflowUiTemplateBase>()

export function registerWorkflowUiTemplate(template: WorkflowUiTemplateBase | WorkflowTemplate): WorkflowUiTemplateBase {
  const instance = template instanceof WorkflowUiTemplateBase ? template : new PlainWorkflowUiTemplate(template)
  registry.register(instance)
  return instance
}

export function listWorkflowUiTemplateInstances(): WorkflowUiTemplateBase[] {
  return registry.list()
}

export function getWorkflowUiTemplateInstance(id?: string | null): WorkflowUiTemplateBase | undefined {
  return id ? registry.get(id) : undefined
}

export function listWorkflowUiTemplates(): WorkflowTemplate[] {
  return registry.list().map((item) => item.toData())
}

export function getWorkflowUiTemplate(id?: string | null): WorkflowTemplate | undefined {
  return getWorkflowUiTemplateInstance(id)?.toData()
}

export function unregisterWorkflowUiTemplate(id: string): boolean {
  return registry.unregister(id)
}

export function importWorkflowUiTemplateFromJson(json: unknown): WorkflowUiTemplateBase {
  if (!isRecord(json)) throw new Error("Invalid workflow template JSON")
  const migrated = migrateWorkflowTemplateIntents(json as Record<string, unknown>) as unknown as WorkflowTemplate
  if (!Array.isArray(migrated.nodes) || !migrated.nodes.length) throw new Error("Workflow template requires nodes")
  if (!Array.isArray(migrated.columns) || !migrated.columns.length) throw new Error("Workflow template requires columns")
  if (!Array.isArray(migrated.stages) || !migrated.stages.length) throw new Error("Workflow template requires stages")
  const template = new PlainWorkflowUiTemplate(migrated)
  if (!template.id.trim()) template.data.id = requireString(migrated as unknown as Record<string, unknown>, "id")
  registerWorkflowUiTemplate(template)
  return template
}
