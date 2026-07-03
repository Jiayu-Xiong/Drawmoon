import { buildOpencodeConfigObject } from "../providers/opencode-config-builder.js"
import { enabledToolsForRuntime } from "../providers/opencode-native-defaults.js"
import type { AgentNodeConfig } from "../schema/types.js"
import {
  flattenOpencodePreviewToKv,
  OPENCODE_BUILTIN_TOOLS,
  OPENCODE_PERMISSION_KEYS,
  STRATEGY_GROUP_KEYS,
} from "./opencode-strategy-schema.js"
import { resolveToolMappingsForEnabledOpencode, resolveToolMappingsForList, toolMappingCatalog } from "./tool-mapping.js"
import {
  loadBuiltinToolDescriptions,
  loadNativeAgents,
  loadPlanModePrompts,
  loadSessionPromptCatalog,
  resolveOpencodeAgentId,
  resolveProviderSystemPrompt,
} from "./opencode-vendor-snapshot.js"

export interface OpencodeConfigPreviewInput {
  model?: string
  mode?: string
  systemPrompt?: string
  userPromptBias?: string
  constraints?: AgentNodeConfig["constraints"]
  workspaceDir?: string
  readRoots?: string[]
  flatWriteOnly?: boolean
  editableOverlayKeys?: string[]
  includePlanPrompts?: boolean
}

/** Preview the JSON blob OpenCode receives via OPENCODE_CONFIG_CONTENT plus vendor prompts/tools. */
export function previewOpencodeRuntimePayload(input: OpencodeConfigPreviewInput = {}) {
  const model = input.model ?? "kuaipao/gpt-4o"
  const providerId = model.includes("/") ? model.split("/")[0]! : "kuaipao"
  const modelId = model.includes("/") ? model.split("/").slice(1).join("/") : model

  const config = buildOpencodeConfigObject({
    model,
    constraints: input.constraints,
    workspaceDir: input.workspaceDir,
    readRoots: input.readRoots,
    flatWriteOnly: input.flatWriteOnly,
    requireApiKey: false,
  })

  const opencodeAgent = resolveOpencodeAgentId(input.mode)
  const nativeAgent = loadNativeAgents().find((agent) => agent.name === opencodeAgent)
  const providerPrompt = resolveProviderSystemPrompt(model)
  const planPrompts = (input.includePlanPrompts ?? opencodeAgent === "plan") ? loadPlanModePrompts() : []
  const toolDescriptions = loadBuiltinToolDescriptions()
  const enabledTools = enabledToolsForRuntime(config, model)

  const subagentCatalog = loadNativeAgents()
    .filter((agent) => agent.mode === "subagent" && !agent.hidden)
    .map((agent) => `- ${agent.name}: ${agent.description}${agent.prompt ? " (has agent prompt)" : ""}`)
    .join("\n")

  const environmentTemplate = [
    `You are powered by the model named ${modelId}. The exact model ID is ${providerId}/${modelId}`,
    "Here is some useful information about the environment you are running in:",
    "<env>",
    `  Working directory: ${input.workspaceDir ?? "<workspace>"}`,
    "  Workspace root folder: <worktree>",
    "  Is directory a git repo: <detected at run time>",
    `  Platform: ${process.platform}`,
    `  Today's date: ${new Date().toDateString()}`,
    "</env>",
  ].join("\n")

  const runtimeEnvelope = {
    argv: ["opencode", "run", "--format", "json", "--model", model, "--dir", input.workspaceDir ?? "<workspace>", "--agent", opencodeAgent],
    env: {
      WORKFLOW_WORKSPACE_ROOT: input.workspaceDir ?? "<workspace>",
      OPENCODE_CONFIG_CONTENT: "<see opencodeConfig>",
      AGENT_MODE: input.mode ?? "build",
    },
    stdin: "assembled at run time: node prompt + upstream context blocks",
  }

  const workflowOverlay: Record<string, unknown> = {}
  if (input.systemPrompt?.trim()) workflowOverlay.defaultSystemPrompt = input.systemPrompt.trim()
  if (input.userPromptBias?.trim()) workflowOverlay.defaultUserPromptBias = input.userPromptBias.trim()
  if (input.constraints?.allowedTools?.length) workflowOverlay.allowedTools = input.constraints.allowedTools
  if (input.constraints?.forcedTools?.length) workflowOverlay.forcedTools = input.constraints.forcedTools
  if (input.constraints?.forcedMcpServers?.length) workflowOverlay.forcedMcpServers = input.constraints.forcedMcpServers
  if (input.constraints?.allowedMcpServers?.length) workflowOverlay.allowedMcpServers = input.constraints.allowedMcpServers
  if (input.constraints?.forcedSkills?.length) workflowOverlay.forcedSkills = input.constraints.forcedSkills
  if (input.constraints?.allowedSkills?.length) workflowOverlay.allowedSkills = input.constraints.allowedSkills

  const constraintToolIds = [
    ...(input.constraints?.forcedTools ?? []),
    ...(input.constraints?.allowedTools ?? []),
  ]
  const runtimeToolMappings = constraintToolIds.length
    ? resolveToolMappingsForList(constraintToolIds)
    : resolveToolMappingsForEnabledOpencode(enabledTools)

  const exposedKv = flattenOpencodePreviewToKv({
    opencodeAgent,
    agentInfo: nativeAgent,
    providerPrompt,
    planPrompts,
    toolDescriptions,
    enabledTools,
    opencodeConfig: config,
    runtimeEnvelope,
    workflowOverlay: Object.keys(workflowOverlay).length ? workflowOverlay : undefined,
    editableOverlayKeys: input.editableOverlayKeys,
    environmentTemplate,
    subagentCatalog,
    runtimeToolMappings,
  })

  const schemaEstimatePerTool = 450
  const promptTokens = exposedKv
    .filter((item) => item.group === STRATEGY_GROUP_KEYS.system_prompt
      || item.group === STRATEGY_GROUP_KEYS.agent
      || item.group === STRATEGY_GROUP_KEYS.plan_mode
      || item.group === STRATEGY_GROUP_KEYS.tools
      || item.group === STRATEGY_GROUP_KEYS.subagents
      || item.group === STRATEGY_GROUP_KEYS.environment)
    .reduce((sum, item) => sum + (item.tokens ?? Math.ceil(item.value.length / 4)), 0)

  return {
    opencodeAgent,
    opencodeConfig: config,
    runtimeEnvelope,
    exposedKv,
    runtimeToolMappings,
    totals: {
      kvCount: exposedKv.length,
      estimatedPromptTokens: promptTokens + enabledTools.length * schemaEstimatePerTool,
      visiblePromptTokens: promptTokens,
      estimatedSchemaTokens: enabledTools.length * schemaEstimatePerTool,
      providerPromptTokens: providerPrompt.tokens,
      enabledToolCount: enabledTools.length,
    },
    catalog: {
      sessionPrompts: loadSessionPromptCatalog(),
      nativeAgents: loadNativeAgents().map(({ name, description, mode, native, hidden }) => ({ name, description, mode, native, hidden })),
      builtinTools: OPENCODE_BUILTIN_TOOLS,
      permissionKeys: OPENCODE_PERMISSION_KEYS,
      toolMappings: toolMappingCatalog(),
    },
  }
}

export function opencodeStrategySchemaOnly() {
  return {
    sessionPrompts: loadSessionPromptCatalog(),
    nativeAgents: loadNativeAgents().map(({ name, description, mode }) => ({ name, description, mode })),
    builtinTools: OPENCODE_BUILTIN_TOOLS,
    permissionKeys: OPENCODE_PERMISSION_KEYS,
    toolMappings: toolMappingCatalog(),
  }
}
