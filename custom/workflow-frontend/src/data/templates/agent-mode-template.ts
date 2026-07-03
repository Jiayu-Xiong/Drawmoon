import type { AgentModeTemplate } from "../console-model"

export type AgentModeOrigin = "native-cli" | "agent-mode-bound" | "llm-api-derived" | "custom"

export type AgentModeFieldPolicy = "hidden" | "readonly" | "editable" | "inherited"

export type AgentModeStrategyField =
	| "model"
	| "contextMode"
	| "maxIterations"
	| "timeoutMs"
	| "allowFileWrites"
	| "allowedTools"
	| "outputKinds"
	| "cacheFiles"
	| "contextFiles"
	| "retryPolicy"
	| "defaultSystemPromptFile"
	| "defaultSystemPrompt"
	| "allowSystemPromptOverride"
	| "defaultUserPromptBias"

export type AgentModeFieldPolicies = Partial<Record<AgentModeStrategyField, AgentModeFieldPolicy>>

export interface MinimalAgentModeTemplate extends AgentModeTemplate {
	origin?: AgentModeOrigin
	inheritsFromAgentModeId?: string
	derivedFromLlmApiTemplateId?: string
	fieldPolicy?: AgentModeFieldPolicies
}

export const agentModeFieldDefaultsByOrigin: Record<AgentModeOrigin, AgentModeFieldPolicies> = {
	custom: {
		model: "editable",
		contextMode: "editable",
		maxIterations: "editable",
		timeoutMs: "editable",
		allowFileWrites: "editable",
		allowedTools: "editable",
		outputKinds: "editable",
		cacheFiles: "editable",
		contextFiles: "editable",
		retryPolicy: "editable",
		defaultSystemPromptFile: "editable",
		defaultSystemPrompt: "editable",
		allowSystemPromptOverride: "editable",
		defaultUserPromptBias: "editable",
	},
	"native-cli": {
		model: "readonly",
		contextMode: "editable",
		maxIterations: "editable",
		timeoutMs: "editable",
		allowFileWrites: "readonly",
		allowedTools: "readonly",
		outputKinds: "readonly",
		cacheFiles: "editable",
		contextFiles: "editable",
		retryPolicy: "editable",
		defaultSystemPromptFile: "readonly",
		defaultSystemPrompt: "editable",
		allowSystemPromptOverride: "editable",
		defaultUserPromptBias: "editable",
	},
	"agent-mode-bound": {
		model: "inherited",
		contextMode: "inherited",
		maxIterations: "inherited",
		timeoutMs: "editable",
		allowFileWrites: "inherited",
		allowedTools: "inherited",
		outputKinds: "inherited",
		cacheFiles: "inherited",
		contextFiles: "inherited",
		retryPolicy: "inherited",
		defaultSystemPromptFile: "inherited",
		defaultSystemPrompt: "inherited",
		allowSystemPromptOverride: "inherited",
		defaultUserPromptBias: "editable",
	},
	"llm-api-derived": {
		model: "inherited",
		contextMode: "editable",
		maxIterations: "editable",
		timeoutMs: "editable",
		allowFileWrites: "editable",
		allowedTools: "editable",
		outputKinds: "editable",
		cacheFiles: "editable",
		contextFiles: "editable",
		retryPolicy: "editable",
		defaultSystemPromptFile: "editable",
		defaultSystemPrompt: "editable",
		allowSystemPromptOverride: "editable",
		defaultUserPromptBias: "editable",
	},
}

export function agentModeFieldPolicy(mode: MinimalAgentModeTemplate, field: AgentModeStrategyField): AgentModeFieldPolicy {
	const explicit = mode.fieldPolicy?.[field]
	if (explicit) return explicit

	const origin = mode.origin ?? "custom"
	return agentModeFieldDefaultsByOrigin[origin][field] ?? "editable"
}

export const isolatedAgentModeTemplates: MinimalAgentModeTemplate[] = [
	{
		id: "opencode-api-derived-build",
		name: "opencode API Derived Build",
		description: "Build strategy executed by opencode while model and API parameters come from an LLM API template.",
		provider: "opencode",
		origin: "llm-api-derived",
		derivedFromLlmApiTemplateId: "kuaipao-openai-chat",
		mode: "build",
		model: "inherited-from-llm-api-template",
		contextMode: "inherit",
		defaultSystemPromptFile: "agents/opencode-api-derived.md",
		defaultSystemPrompt: "Use the node objective and declared output contract. Keep model and API sampling parameters inherited from the selected LLM API template.",
		allowSystemPromptOverride: true,
		allowedTools: ["read_file", "write_file", "edit_file", "artifact_link"],
		outputKinds: ["markdown", "json", "directory"],
		maxIterations: 12,
		timeoutMs: 600000,
		allowFileWrites: true,
		cacheFiles: [],
		contextFiles: [],
		retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
	},
	{
		id: "copilot-bound-chat",
		name: "Copilot Bound Chat",
		description: "Chat strategy executed by Copilot CLI while strategy defaults are inherited from another agent mode.",
		provider: "copilot",
		origin: "agent-mode-bound",
		inheritsFromAgentModeId: "opencode-api-derived-build",
		mode: "chat",
		model: "inherited-from-bound-agent-mode",
		contextMode: "fresh",
		defaultSystemPromptFile: "inherited://bound-agent-mode",
		defaultSystemPrompt: "Use the inherited strategy defaults unless a node supplies an allowed override.",
		allowSystemPromptOverride: true,
		allowedTools: ["copilot_chat"],
		outputKinds: ["markdown", "json"],
		maxIterations: 1,
		timeoutMs: 240000,
		allowFileWrites: false,
		cacheFiles: [],
		contextFiles: [],
		retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
		fieldPolicy: {
			timeoutMs: "editable",
			defaultUserPromptBias: "editable",
		},
	},
	{
		id: "codex-native-cli-build",
		name: "Codex Native CLI Build",
		description: "Build strategy owned by the native Codex CLI while workflow-level prompt and context policy remain configurable.",
		provider: "codex",
		origin: "native-cli",
		mode: "build",
		model: "codex/configured",
		contextMode: "inherit",
		defaultSystemPromptFile: "codex://configured-default",
		defaultSystemPrompt: "Use local Codex defaults and apply the workflow node objective within the declared output contract.",
		allowSystemPromptOverride: true,
		allowedTools: ["codex_exec", "read_file", "edit_file"],
		outputKinds: ["markdown", "json", "directory"],
		maxIterations: 25,
		timeoutMs: 900000,
		allowFileWrites: true,
		cacheFiles: [],
		contextFiles: [],
		retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
	},
]
