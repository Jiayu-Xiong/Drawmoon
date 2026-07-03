import { loadKuaipaoConfig, resolveApiFileKeyByEnv, resolveKuaipaoApiKey } from "../llm-api/kuaipao-config.js"
import type { AgentNodeConfig } from "../schema/types.js"
import { readLibraryManifest } from "../drawmoon/library.js"
import { syncDrawmoonCustomToolsToWorkspace } from "../drawmoon/custom-tool-sync.js"
import { applyToolConstraintsToOpencodeConfig } from "./opencode-constraints.js"
import {
  applyWorkspaceSandbox,
  workflowAllowsShell,
  workflowAllowsWebFetch,
} from "./opencode-native-defaults.js"

type WorkflowLlmApiBinding = NonNullable<AgentNodeConfig["llmApi"]>

function isModelPlaceholder(model?: string): boolean {
  return !model?.trim() || /inherited|configured-default|workflow-selected|^default$/i.test(model)
}

function stripProviderPrefix(model: string): string {
  return model.includes("/") ? model.split("/").slice(1).join("/") : model
}

function workflowProviderAlias(api?: WorkflowLlmApiBinding): string {
  if (!api?.id) return "workflow"
  if (api.id.startsWith("kuaipao-")) return "kuaipao"
  if (api.id.startsWith("deepseek-") || /deepseek/i.test(api.endpoint ?? "")) return "deepseek"
  const slug = api.id.toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-|-$/g, "")
  return slug || "workflow"
}

export function resolveApiKey(api: WorkflowLlmApiBinding | undefined, kuaipao = loadKuaipaoConfig()): string | null {
  if (api?.apiKeyEnv && process.env[api.apiKeyEnv]) return process.env[api.apiKeyEnv]!
  const fromApiFile = resolveApiFileKeyByEnv(api?.apiKeyEnv)
  if (fromApiFile) return fromApiFile
  if (!api || api.apiKeyEnv === kuaipao.apiKeyEnv || api.id?.startsWith("kuaipao-")) return resolveKuaipaoApiKey(kuaipao)
  return null
}

function buildWorkflowModels(modelId: string, api?: WorkflowLlmApiBinding) {
  if (api) return { [modelId]: { name: modelId } }
  const kuaipao = loadKuaipaoConfig()
  const catalog = kuaipao.models.length > 0 ? kuaipao.models : [{ id: modelId, name: modelId }]
  const models = Object.fromEntries(
    catalog.map((item) => [
      item.id,
      {
        name: item.name,
        ...(item.contextWindow
          ? {
              limit: {
                context: item.contextWindow,
                output: Math.min(8192, item.contextWindow),
              },
            }
          : {}),
      },
    ]),
  )
  if (!models[modelId]) models[modelId] = { name: modelId }
  return models
}

export interface OpencodeConfigBuildInput {
  model: string
  api?: WorkflowLlmApiBinding
  constraints?: AgentNodeConfig["constraints"]
  workspaceDir?: string
  readRoots?: string[]
  flatWriteOnly?: boolean
  /** When false, skip API key validation (preview/probes). */
  requireApiKey?: boolean
}

/** Build the OPENCODE_CONFIG_CONTENT object — same path for runner and strategy preview. */
export function buildOpencodeConfigObject(input: OpencodeConfigBuildInput): Record<string, unknown> {
  const kuaipao = loadKuaipaoConfig()
  const apiKey = resolveApiKey(input.api, kuaipao)
  if (input.requireApiKey !== false && !apiKey) {
    throw new Error(`LLM API key is missing. Set ${input.api?.apiKeyEnv ?? kuaipao.apiKeyEnv} or add it to the api config file.`)
  }

  const model = input.model
  const modelId = model.includes("/") ? model.split("/").slice(1).join("/") : model
  const providerId = model.includes("/") ? model.split("/")[0]! : workflowProviderAlias(input.api)
  const baseURL = input.api?.endpoint ?? kuaipao.openaiBaseUrl
  const models = buildWorkflowModels(modelId, input.api)

  const config: Record<string, unknown> = {
    $schema: "https://opencode.ai/config.json",
    model,
    provider: {
      [providerId]: {
        name: input.api?.id ?? "Kuaipao",
        npm: "@ai-sdk/openai-compatible",
        options: {
          name: providerId,
          apiKey: apiKey ?? "<redacted>",
          baseURL,
        },
        models,
      },
    },
  }

  applyToolConstraintsToOpencodeConfig(
    config,
    input.constraints,
    readLibraryManifest(),
    input.workspaceDir,
    {
      readRoots: input.readRoots,
      flatWriteOnly: input.flatWriteOnly,
    },
  )

  if (input.workspaceDir?.trim()) {
    const toolIds = [
      ...(input.constraints?.forcedTools ?? []),
      ...(input.constraints?.allowedTools ?? []),
    ]
    syncDrawmoonCustomToolsToWorkspace(input.workspaceDir.trim(), toolIds)
    applyWorkspaceSandbox(config, {
      allowWebFetch: workflowAllowsWebFetch(toolIds),
      allowBash: workflowAllowsShell(toolIds),
    })
  }

  return config
}

export function buildOpencodeConfigJson(input: OpencodeConfigBuildInput): string {
  return JSON.stringify(buildOpencodeConfigObject(input))
}

export function resolveWorkflowModel(model: string | undefined, api?: WorkflowLlmApiBinding): string {
  if (!api?.model) {
    if (model?.startsWith("kuaipao/")) return model
    if (model?.includes("/") && !model.startsWith("opencode/") && !model.includes("inherited")) return model
    const kuaipao = loadKuaipaoConfig()
    const modelId = model && !isModelPlaceholder(model)
      ? model.replace(/^opencode\//, "")
      : process.env.OPENCODE_KUAIPAO_MODEL || kuaipao.models[0]?.id || "gpt-5.5"
    return `kuaipao/${modelId}`
  }
  const provider = workflowProviderAlias(api)
  const modelId = stripProviderPrefix(!isModelPlaceholder(model) ? model! : api.model)
  return `${provider}/${modelId}`
}
