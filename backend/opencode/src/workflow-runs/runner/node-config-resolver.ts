import { normalizeLegacyNodeConfig } from "../../workflow-actions/index.js"
import { resolveAgentModeConfig } from "../../agent-modes/index.js"
import type { AgentNodeConfig, WorkflowNode } from "../../schema/types.js"
import type { WorkflowAction } from "../../workflow-actions/types.js"
import {
  actionOverridesToAgentMode,
  firstUsableModel,
  toAgentMode,
  toContextMode,
  toProviderId,
  toSessionPolicy,
} from "./coercion.js"
import { ensureWriteCapability, readNodeArchetype } from "../context/index.js"

export interface LlmApiActionMetadata {
  modality?: "text" | "image" | "audio"
  llmApi?: AgentNodeConfig["llmApi"]
}

export function nodeAction(node: WorkflowNode, contextMode: AgentNodeConfig["contextMode"]): WorkflowAction {
  const candidate = node.action as WorkflowAction | undefined
  if (candidate?.kind) return candidate
  return normalizeLegacyNodeConfig({ ...node.config, contextMode }, { id: node.id, label: node.label })
}

export function resolveNodeConfig(
  node: WorkflowNode,
  contextMode: AgentNodeConfig["contextMode"],
  sharedSessionIds: Map<string, string>,
): AgentNodeConfig {
  const action = nodeAction(node, contextMode)
  const providerId = toProviderId(action.binding.providerId ?? node.config.provider)
  const modeConfig = resolveAgentModeConfig({
    agentModeId: action.binding.agentModeId,
    providerId,
    overrides: actionOverridesToAgentMode(action),
  })
  const resolved = modeConfig.resolved
  const provider = providerId ?? resolved.defaultBinding?.providerId
  const nativeAlias = resolved.defaultBinding?.cliAlias ?? resolved.providerCompatibility.nativeAliases?.[provider]
  const strategy = resolved.strategy
  const metadata = (action.metadata ?? {}) as LlmApiActionMetadata
  const llmApi = metadata.llmApi ?? node.config.llmApi
  const model = firstUsableModel(action.overrides.model, llmApi?.model, node.config.model, strategy.model)
  const config: AgentNodeConfig = {
    ...node.config,
    provider,
    mode: toAgentMode(nativeAlias ?? action.overrides.mode ?? node.config.mode),
    contextMode: toContextMode(strategy.contextMode ?? action.overrides.contextMode ?? contextMode),
    prompt: action.inputs.prompt ?? node.config.prompt,
    contextFiles: action.inputs.contextFiles ?? node.config.contextFiles,
    cacheFiles: action.inputs.cacheFiles ?? node.config.cacheFiles,
    systemPromptFile: strategy.systemPromptFile ?? action.overrides.systemPromptFile ?? node.config.systemPromptFile,
    buildPromptFile: strategy.buildPromptFile ?? action.overrides.buildPromptFile ?? node.config.buildPromptFile,
    plannerFile: strategy.plannerFile ?? action.overrides.plannerFile ?? node.config.plannerFile,
    subagentFiles: strategy.subagentFiles ?? action.overrides.subagentFiles ?? node.config.subagentFiles,
    model,
    llmApi,
    sessionPolicy: toSessionPolicy(action.session.policy ?? strategy.sessionPolicy),
    sessionKey: action.session.sessionKey,
    sessionId: action.session.sessionId,
    timeoutMs: action.execution.timeoutMs ?? strategy.timeoutMs ?? node.config.timeoutMs,
    maxIterations: action.execution.maxIterations ?? strategy.maxIterations ?? node.config.maxIterations,
    allowFileWrites: action.execution.allowWrites ?? strategy.allowFileWrites ?? node.config.allowFileWrites,
    customCommand: action.overrides.customCommand ?? node.config.customCommand,
    customArgs: action.overrides.customArgs ?? node.config.customArgs,
  }
  if (config.sessionPolicy === "shared" && config.sessionKey && !config.sessionId) {
    config.sessionId = sharedSessionIds.get(config.sessionKey)
  }
  const modeConstraints = resolved.constraints ?? {}
  const actionConstraints = action.constraints ?? {}
  const inputTools = action.inputs.tools?.filter((t): t is string => Boolean(t)) ?? []
  const baseAllowed = actionConstraints.allowedTools?.length
    ? actionConstraints.allowedTools
    : modeConstraints.allowedTools ?? []
  const allowedTools = [...new Set([...baseAllowed, ...inputTools])]
  const merged = {
    forcedTools: actionConstraints.forcedTools?.length ? actionConstraints.forcedTools : modeConstraints.forcedTools,
    allowedTools: allowedTools.length ? allowedTools : undefined,
    forcedSkills: actionConstraints.forcedSkills?.length ? actionConstraints.forcedSkills : modeConstraints.forcedSkills,
    allowedSkills: actionConstraints.allowedSkills?.length ? actionConstraints.allowedSkills : modeConstraints.allowedSkills,
    forcedMcpServers: actionConstraints.forcedMcpServers?.length ? actionConstraints.forcedMcpServers : modeConstraints.forcedMcpServers,
    allowedMcpServers: actionConstraints.allowedMcpServers?.length ? actionConstraints.allowedMcpServers : modeConstraints.allowedMcpServers,
  }
  if (Object.values(merged).some((value) => Array.isArray(value) && value.length)) {
    config.constraints = merged
  }
  return ensureWriteCapability(config, readNodeArchetype(node))
}
