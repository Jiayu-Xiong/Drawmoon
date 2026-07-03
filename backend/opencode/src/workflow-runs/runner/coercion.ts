import type { AgentModeTemplateData } from "../../agent-modes/types.js"
import type { AgentMode, AgentNodeConfig, ProviderId } from "../../schema/types.js"
import type { WorkflowAction } from "../../workflow-actions/types.js"
import { firstUsableModelValue } from "../../shared/model-placeholders.js"

export function actionOverridesToAgentMode(action: WorkflowAction): Partial<AgentModeTemplateData> {
  return {
    strategy: {
      model: stringValue(action.overrides.model),
      contextMode: toContextModeOrUndefined(action.overrides.contextMode),
      systemPromptFile: stringValue(action.overrides.systemPromptFile),
      buildPromptFile: stringValue(action.overrides.buildPromptFile),
      plannerFile: stringValue(action.overrides.plannerFile),
      subagentFiles: stringArrayValue(action.overrides.subagentFiles),
      maxIterations: numberValue(action.overrides.maxIterations),
      timeoutMs: numberValue(action.overrides.timeoutMs),
      allowFileWrites: booleanValue(action.overrides.allowFileWrites),
    },
    constraints: action.constraints
      ? {
          forcedTools: action.constraints.forcedTools,
          allowedTools: action.constraints.allowedTools,
          forcedSkills: action.constraints.forcedSkills,
          allowedSkills: action.constraints.allowedSkills,
          forcedMcpServers: action.constraints.forcedMcpServers,
          allowedMcpServers: action.constraints.allowedMcpServers,
        }
      : undefined,
  }
}

export function toProviderId(value: unknown): ProviderId {
  if (value === "direct-api" || value === "direct-llm") return "custom"
  const allowed: ProviderId[] = ["opencode", "codex", "reasonix", "copilot", "custom", "openai", "kiro"]
  return allowed.includes(value as ProviderId) ? value as ProviderId : "custom"
}

export function toAgentMode(value: unknown): AgentMode {
  const allowed: AgentMode[] = ["chat", "agent", "build", "plan", "review"]
  return allowed.includes(value as AgentMode) ? value as AgentMode : "agent"
}

export function toContextMode(value: unknown): AgentNodeConfig["contextMode"] {
  return toContextModeOrUndefined(value) ?? "fresh"
}

export function toContextModeOrUndefined(value: unknown): AgentNodeConfig["contextMode"] | undefined {
  const allowed: AgentNodeConfig["contextMode"][] = ["fresh", "inherit", "fork", "summary", "artifacts"]
  return allowed.includes(value as AgentNodeConfig["contextMode"]) ? value as AgentNodeConfig["contextMode"] : undefined
}

export function toSessionPolicy(value: unknown): AgentNodeConfig["sessionPolicy"] {
  const allowed: NonNullable<AgentNodeConfig["sessionPolicy"]>[] = ["fresh", "inherit", "fork", "summary", "artifacts", "shared"]
  return allowed.includes(value as NonNullable<AgentNodeConfig["sessionPolicy"]>) ? value as AgentNodeConfig["sessionPolicy"] : "fresh"
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

export function stringArrayValue(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined
}

export function firstUsableModel(...values: unknown[]): string | undefined {
  return firstUsableModelValue(...values)
}
