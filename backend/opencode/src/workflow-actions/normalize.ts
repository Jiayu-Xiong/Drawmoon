import type { LegacyAgentNodeConfig, WorkflowAction, WorkflowActionConstraints } from "./types.js"
import { sessionPolicyFromLegacy } from "./types.js"

const DEFAULT_AGENT_MODE_IDS: Partial<Record<LegacyAgentNodeConfig["provider"], string>> = {
  opencode: "opencode-default-agent",
  codex: "codex-default-build",
  copilot: "copilot-default-agent",
  kiro: "kiro-default",
  custom: "custom-agent-mode",
}

export interface NormalizeLegacyNodeConfigOptions {
  id?: string
  label?: string
}

export function normalizeLegacyNodeConfig(
  config: LegacyAgentNodeConfig,
  options: NormalizeLegacyNodeConfigOptions = {},
): WorkflowAction {
  const id = options.id ?? config.id ?? "legacy-agent-node"
  const label = options.label ?? config.label ?? `${config.provider} ${config.mode}`
  const constraints = pickConstraints(config)

  return {
    id,
    kind: "agent-mode",
    label,
    inputs: {
      prompt: config.prompt,
      contextFiles: copyStringArray(config.contextFiles),
      cacheFiles: copyStringArray(config.cacheFiles),
      tools: copyStringArray(config.tools),
    },
    binding: {
      agentModeId: config.agentModeId ?? DEFAULT_AGENT_MODE_IDS[config.provider] ?? config.mode,
      providerId: config.provider,
    },
    overrides: {
      provider: config.provider,
      mode: config.mode,
      model: config.model,
      cwd: config.cwd,
      contextMode: config.contextMode,
      systemPromptFile: config.systemPromptFile,
      buildPromptFile: config.buildPromptFile,
      plannerFile: config.plannerFile,
      subagentFiles: copyStringArray(config.subagentFiles),
      customCommand: config.customCommand,
      customArgs: copyStringArray(config.customArgs),
      maxIterations: config.maxIterations,
      timeoutMs: config.timeoutMs,
      allowFileWrites: config.allowFileWrites,
    },
    session: {
      policy: sessionPolicyFromLegacy(config.sessionPolicy ?? config.contextMode),
      sessionKey: config.sessionKey,
      sessionId: config.sessionId,
    },
    constraints,
    execution: {
      timeoutMs: config.timeoutMs,
      allowWrites: config.allowFileWrites,
      maxIterations: config.maxIterations,
      cache: config.cacheFiles?.length ? { mode: "files-aware", files: copyStringArray(config.cacheFiles) } : undefined,
    },
    output: {
      expectedFormat: "text",
      summaryPolicy: config.contextMode === "summary" ? "brief" : "inherit",
    },
  }
}

function pickConstraints(config: LegacyAgentNodeConfig): WorkflowActionConstraints {
  return {
    forcedSkills: copyStringArray(config.forcedSkills),
    allowedSkills: copyStringArray(config.allowedSkills),
    forcedMcpServers: copyStringArray(config.forcedMcpServers),
    allowedMcpServers: copyStringArray(config.allowedMcpServers),
    forcedTools: copyStringArray(config.forcedTools),
    allowedTools: copyStringArray(config.allowedTools),
  }
}

function copyStringArray(value: string[] | undefined): string[] | undefined {
  return value ? [...value] : undefined
}
