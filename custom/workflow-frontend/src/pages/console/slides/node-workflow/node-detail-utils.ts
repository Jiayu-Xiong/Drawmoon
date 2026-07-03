import type { BackendProvider, SystemSnapshot, WorkflowTemplate } from "../../../../data/console-model"
import { getCliTemplate } from "../../../../data/cli-templates"
import { listLlmApiTemplates } from "../../../../data/llm-api-templates"
import type { cliTemplates } from "../../../../data/cli-templates"
import { getAgentModeTemplate } from "../../../../data/template-registry"
import { providerFromNode } from "../../shared/core"

export function templateCliProviders(template: WorkflowTemplate) {
  const ids = new Set<string>()
  for (const node of template.nodes) {
    const cliId = node.cliTemplateId ?? (node.agentModeTemplateId ? getAgentModeTemplate(node.agentModeTemplateId)?.cliTemplateId : undefined)
    const cli = cliId ? getCliTemplate(cliId) : undefined
    if (cli) ids.add(cli.providerId)
    else ids.add(providerFromNode(node, template))
  }
  return [...ids]
}

export function templateLlmApis(template: WorkflowTemplate) {
  const ids = new Set(template.nodes.map((node) => node.llmApiTemplateId).filter((id): id is string => Boolean(id)))
  return listLlmApiTemplates().filter((api) => ids.has(api.id))
}

export function resolveLlmApiStatus(
  api: ReturnType<typeof listLlmApiTemplates>[number],
  providers: BackendProvider[],
  snapshot: SystemSnapshot,
) {
  if (api.endpoint.includes("kuaipao") || api.id.startsWith("kuaipao")) {
    const kuaipao = providers.find((item) => item.id === "kuaipao")
    if (kuaipao?.status === "online") return "online"
    return snapshot.apiBinding.status === "online" ? "degraded" : snapshot.apiBinding.status
  }
  const provider = providers.find((item) => item.id === api.provider)
  if (provider) return provider.status
  return snapshot.apiBinding.status
}

export function workflowUsesCliTemplate(template: WorkflowTemplate, cli: typeof cliTemplates[number]) {
  return template.nodes.some((node) => providerFromNode(node) === cli.providerId)
}

export function cliDisplayFields(cli: typeof cliTemplates[number], snapshot: SystemSnapshot) {
  if (cli.providerId !== "codex") return cli.fields
  const quota = snapshot.quota.summary
  const percent = quota.match(/\b\d+(?:\.\d+)?%/)
  const reset = quota.match(/(?:reset|refresh|renews?)[:\s]+([^,;]+)/i)
  return cli.fields.map((field) => {
    if (field.key === "weekly remaining") return { ...field, value: percent?.[0] ?? field.value }
    if (field.key === "refresh") return { ...field, value: reset?.[1]?.trim() ?? field.value }
    return field
  })
}
