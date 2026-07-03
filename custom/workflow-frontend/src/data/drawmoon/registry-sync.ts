import { fetchDrawmoonRegistry, saveDrawmoonRegistryBucket } from "../../api/drawmoon"
import { registerAgentModeTemplate } from "../template-registry/agent-mode-template"
import { registerCliTemplate } from "../template-registry/cli-template"
import { registerLlmApiTemplate } from "../template-registry/llm-api-template"
import { listAgentModeTemplates } from "../template-registry/agent-mode-template"
import { listLlmApiTemplates } from "../template-registry/llm-api-template"
import { listCliTemplates } from "../template-registry/cli-template"
import type { AgentModeTemplate, CliProviderTemplate, LlmApiTemplate } from "../console-model"

let hydrated = false

export async function hydrateDrawmoonRegistry() {
  if (hydrated) return
  hydrated = true
  try {
    const snapshot = await fetchDrawmoonRegistry()
    for (const item of snapshot.cliTemplates.items as CliProviderTemplate[]) {
      if (item?.id) registerCliTemplate(item)
    }
    for (const item of snapshot.agentModeTemplates.items as AgentModeTemplate[]) {
      if (item?.id) registerAgentModeTemplate(item)
    }
    for (const item of snapshot.llmApiTemplates.items as LlmApiTemplate[]) {
      if (item?.id) registerLlmApiTemplate(item)
    }
  } catch {
    // Runtime may be offline during first paint.
  }
}

export async function persistDrawmoonRegistry() {
  await Promise.all([
    saveDrawmoonRegistryBucket("cli-templates", listCliTemplates()),
    saveDrawmoonRegistryBucket("agent-mode-templates", listAgentModeTemplates()),
    saveDrawmoonRegistryBucket("llm-api-templates", listLlmApiTemplates()),
  ])
}
