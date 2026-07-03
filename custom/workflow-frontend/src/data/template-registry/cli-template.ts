import type { AgentRuntimeMode, CliCapabilities, CliProviderTemplate } from "../console-model"
import { seedAgentModesOnCliImport } from "../cli-agent-mode-seeder"
import { createTemplateRegistry, isRecord, requireString } from "./registry"

const DEFAULT_CAPABILITIES: CliCapabilities = {
  controlSurface: "cli-owned",
  modelBinding: "cli-native",
  supportedModes: ["chat", "build"],
  quota: { kind: "unknown", unitLabel: "unknown" },
  allowDerivedAgentModes: false,
}

function parseCapabilities(json: unknown): CliCapabilities {
  if (!isRecord(json)) return { ...DEFAULT_CAPABILITIES }
  const quota = isRecord(json.quota) ? json.quota : {}
  const supportedModes = Array.isArray(json.supportedModes)
    ? json.supportedModes.filter((m): m is AgentRuntimeMode => typeof m === "string")
    : DEFAULT_CAPABILITIES.supportedModes
  const modelCapabilities = Array.isArray(json.modelCapabilities)
    ? json.modelCapabilities.filter(isRecord).map((mc) => ({
      id: requireString(mc, "id"),
      contextWindow: typeof mc.contextWindow === "number" ? mc.contextWindow : undefined,
      costMultiplier: typeof mc.costMultiplier === "number" ? mc.costMultiplier : undefined,
      supportedModes: Array.isArray(mc.supportedModes)
        ? mc.supportedModes.filter((m): m is AgentRuntimeMode => typeof m === "string")
        : supportedModes,
    }))
    : undefined
  return {
    controlSurface: json.controlSurface === "customizable" ? "customizable" : "cli-owned",
    modelBinding: json.modelBinding === "llm-api" ? "llm-api" : "cli-native",
    supportedModes,
    quota: {
      kind: typeof quota.kind === "string" ? quota.kind as CliCapabilities["quota"]["kind"] : "unknown",
      probeCommandId: typeof quota.probeCommandId === "string" ? quota.probeCommandId : undefined,
      refreshIntervalMs: typeof quota.refreshIntervalMs === "number" ? quota.refreshIntervalMs : undefined,
      unitLabel: typeof quota.unitLabel === "string" ? quota.unitLabel : undefined,
    },
    editableAgentModeFields: Array.isArray(json.editableAgentModeFields)
      ? json.editableAgentModeFields.map(String)
      : undefined,
    allowDerivedAgentModes: json.allowDerivedAgentModes === true,
    modelCapabilities,
  }
}

export abstract class CliProviderTemplateBase {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly startupCommand: string
  readonly providerId: CliProviderTemplate["providerId"]
  readonly cliKind?: CliProviderTemplate["cliKind"]
  readonly llmApiTemplateIds?: string[]
  readonly promptCommand: CliProviderTemplate["promptCommand"]
  readonly fields: CliProviderTemplate["fields"]
  readonly commands: CliProviderTemplate["commands"]
  readonly models: CliProviderTemplate["models"]
  readonly capabilities: CliCapabilities

  protected constructor(data: CliProviderTemplate) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.startupCommand = data.startupCommand
    this.providerId = data.providerId
    this.cliKind = data.cliKind
    this.llmApiTemplateIds = data.llmApiTemplateIds ? [...data.llmApiTemplateIds] : undefined
    this.promptCommand = { ...data.promptCommand, args: [...data.promptCommand.args] }
    this.fields = data.fields.map((field) => ({ ...field }))
    this.commands = data.commands.map((command) => ({ ...command, args: [...command.args] }))
    this.models = data.models.map((model) => ({
      ...model,
      fields: model.fields.map((field) => ({ ...field })),
    }))
    this.capabilities = data.capabilities ?? { ...DEFAULT_CAPABILITIES }
  }

  toData(): CliProviderTemplate {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      startupCommand: this.startupCommand,
      providerId: this.providerId,
      cliKind: this.cliKind,
      llmApiTemplateIds: this.llmApiTemplateIds ? [...this.llmApiTemplateIds] : undefined,
      promptCommand: { ...this.promptCommand, args: [...this.promptCommand.args] },
      fields: this.fields.map((field) => ({ ...field })),
      commands: this.commands.map((command) => ({ ...command, args: [...command.args] })),
      models: this.models.map((model) => ({
        ...model,
        fields: model.fields.map((field) => ({ ...field })),
      })),
      capabilities: { ...this.capabilities },
    }
  }
}

export class PlainCliProviderTemplate extends CliProviderTemplateBase {
  constructor(data: CliProviderTemplate) {
    super(data)
  }
}

const registry = createTemplateRegistry<CliProviderTemplateBase>()

export function registerCliTemplate(template: CliProviderTemplateBase | CliProviderTemplate): CliProviderTemplateBase {
  const instance = template instanceof CliProviderTemplateBase ? template : new PlainCliProviderTemplate(template)
  registry.register(instance)
  return instance
}

export function listCliTemplateInstances(): CliProviderTemplateBase[] {
  return registry.list()
}

export function getCliTemplateInstance(id?: string | null): CliProviderTemplateBase | undefined {
  return id ? registry.get(id) : undefined
}

export function listCliTemplates(): CliProviderTemplate[] {
  return registry.list().map((item) => item.toData())
}

export function getCliTemplate(id?: string | null): CliProviderTemplate | undefined {
  return getCliTemplateInstance(id)?.toData()
}

export function cliTemplateByProvider(providerId: string): CliProviderTemplate | undefined {
  return registry.list().find((template) => template.providerId === providerId)?.toData()
}

export function renameCliTemplateId(oldId: string, newId: string, patch?: Partial<CliProviderTemplate>): boolean {
  const current = registry.get(oldId)
  if (!current || !newId.trim() || oldId === newId || registry.has(newId)) return false
  registry.unregister(oldId)
  registerCliTemplate(new PlainCliProviderTemplate({ ...current.toData(), ...patch, id: newId }))
  return true
}

export function importCliTemplateFromJson(json: unknown): CliProviderTemplateBase {
  if (!isRecord(json)) throw new Error("Invalid CLI template JSON")
  const promptCommand = isRecord(json.promptCommand) ? json.promptCommand : {}
  const template = new PlainCliProviderTemplate({
    id: requireString(json, "id"),
    name: requireString(json, "name"),
    description: typeof json.description === "string" ? json.description : "",
    startupCommand: requireString(json, "startupCommand"),
    providerId: requireString(json, "providerId") as CliProviderTemplate["providerId"],
    cliKind: json.cliKind === "official" ? "official" : json.cliKind === "custom" ? "custom" : undefined,
    llmApiTemplateIds: Array.isArray(json.llmApiTemplateIds) ? json.llmApiTemplateIds.map(String) : undefined,
    promptCommand: {
      id: typeof promptCommand.id === "string" ? promptCommand.id : "prompt",
      label: typeof promptCommand.label === "string" ? promptCommand.label : "Prompt",
      command: typeof promptCommand.command === "string" ? promptCommand.command : requireString(json, "startupCommand"),
      args: Array.isArray(promptCommand.args) ? promptCommand.args.map(String) : [],
      outputStyle: (typeof promptCommand.outputStyle === "string" ? promptCommand.outputStyle : "text") as CliProviderTemplate["promptCommand"]["outputStyle"],
      consumesTokens: promptCommand.consumesTokens !== false,
    },
    fields: Array.isArray(json.fields)
      ? json.fields.filter(isRecord).map((field) => ({
        key: requireString(field, "key"),
        value: typeof field.value === "string" ? field.value : "",
      }))
      : [],
    commands: Array.isArray(json.commands)
      ? json.commands.filter(isRecord).map((command) => ({
        id: requireString(command, "id"),
        label: typeof command.label === "string" ? command.label : requireString(command, "id"),
        command: requireString(command, "command"),
        args: Array.isArray(command.args) ? command.args.map(String) : [],
        outputStyle: (typeof command.outputStyle === "string" ? command.outputStyle : "text") as CliProviderTemplate["commands"][number]["outputStyle"],
        consumesTokens: command.consumesTokens !== false,
      }))
      : [],
    models: Array.isArray(json.models)
      ? json.models.filter(isRecord).map((model) => ({
        id: requireString(model, "id"),
        name: typeof model.name === "string" ? model.name : requireString(model, "id"),
        statusLabel: typeof model.statusLabel === "string" ? model.statusLabel : "available",
        fields: Array.isArray(model.fields)
          ? model.fields.filter(isRecord).map((field) => ({
            key: requireString(field, "key"),
            value: typeof field.value === "string" ? field.value : "",
          }))
          : [],
      }))
      : [],
    capabilities: parseCapabilities(json.capabilities),
  })
  registerCliTemplate(template)
  seedAgentModesOnCliImport(template.toData())
  return template
}
