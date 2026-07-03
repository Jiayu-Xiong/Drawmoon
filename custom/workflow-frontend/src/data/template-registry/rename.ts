import type { AgentModeTemplate, CliProviderTemplate, LlmApiTemplate } from "../console-model"
import { PlainAgentModeTemplate } from "./agent-mode-template"
import { PlainCliProviderTemplate } from "./cli-template"
import { PlainLlmApiTemplate } from "./llm-api-template"
import { createTemplateRegistry } from "./registry"

type Registry<T extends { id: string }> = ReturnType<typeof createTemplateRegistry<T>>

export function renameRegistryItem<TItem extends { id: string }, TData extends { id: string }>(
  registry: Registry<TItem>,
  factory: (data: TData) => TItem,
  toData: (item: TItem) => TData,
  oldId: string,
  newId: string,
  patch?: Partial<TData>,
): boolean {
  if (!newId.trim() || oldId === newId) return false
  const current = registry.get(oldId)
  if (!current || registry.has(newId)) return false
  registry.unregister(oldId)
  registry.register(factory({ ...toData(current), ...patch, id: newId } as TData))
  return true
}

export function renameLlmApiTemplate(
  registry: Registry<PlainLlmApiTemplate>,
  oldId: string,
  newId: string,
  patch?: Partial<LlmApiTemplate>,
) {
  return renameRegistryItem(
    registry,
    (data) => new PlainLlmApiTemplate(data),
    (item) => item.toData(),
    oldId,
    newId,
    patch,
  )
}

export function renameAgentModeTemplate(
  registry: Registry<PlainAgentModeTemplate>,
  oldId: string,
  newId: string,
  patch?: Partial<AgentModeTemplate>,
) {
  return renameRegistryItem(
    registry,
    (data) => new PlainAgentModeTemplate(data),
    (item) => item.toData(),
    oldId,
    newId,
    patch,
  )
}

export function renameCliTemplate(
  registry: Registry<PlainCliProviderTemplate>,
  oldId: string,
  newId: string,
  patch?: Partial<CliProviderTemplate>,
) {
  return renameRegistryItem(
    registry,
    (data) => new PlainCliProviderTemplate(data),
    (item) => item.toData(),
    oldId,
    newId,
    patch,
  )
}
