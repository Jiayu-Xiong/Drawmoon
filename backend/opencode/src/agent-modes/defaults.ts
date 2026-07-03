/**
 * Default Agent Mode definitions.
 *
 * These are pre-built strategy templates. Workflow nodes can select one
 * directly, inherit from one, or apply allowed per-node overrides.
 *
 * Agent Modes are NOT online agent instances — they contain no status,
 * health, login, quota, PID, or provider availability information.
 */

import type { AgentModeTemplateData } from "./types.js"
import {
  BaseAgentModeTemplate,
  CustomAgentModeTemplate,
  DerivedAgentModeTemplate,
} from "./types.js"
import { ISOLATION_PROBE_AGENT_SYSTEM } from "../drawmoon/isolation-smoke-probes.js"

// ── Opencode Default Agent ───────────────────────────────────────────────

const opencodeDefaultAgentData: AgentModeTemplateData = {
  id: "opencode-default-agent",
  version: "1.0.0",
  name: "Opencode Default Agent",
  description: "Default agent mode for Opencode CLI. Customizable, native alias 'agent'.",
  tags: ["opencode", "agent", "default"],
  kind: "base",
  origin: "native-cli",
  controlSurface: "customizable",
  providerCompatibility: {
    providerIds: ["opencode"],
    nativeAliases: { opencode: "agent" },
  },
  defaultBinding: {
    cliAlias: "agent",
    providerId: "opencode",
  },
  strategy: {
    model: "default",
    contextMode: "inherit",
    sessionPolicy: "inherit",
    maxIterations: 50,
    timeoutMs: 300_000,
    allowFileWrites: true,
    outputFormat: "text",
  },
  orchestration: undefined,
  constraints: {},
  fieldPolicy: {
    "id": "readonly",
    "version": "readonly",
    "name": "editable",
    "description": "editable",
    "tags": "editable",
    "kind": "inherited",
    "origin": "readonly",
    "controlSurface": "readonly",
    "providerCompatibility.providerIds": "editable",
    "providerCompatibility.nativeAliases": "readonly",
    "defaultBinding.cliAlias": "readonly",
    "defaultBinding.providerId": "readonly",
    "strategy.model": "editable",
    "strategy.systemPrompt": "editable",
    "strategy.buildPrompt": "editable",
    "strategy.systemPromptFile": "editable",
    "strategy.buildPromptFile": "editable",
    "strategy.plannerFile": "editable",
    "strategy.subagentFiles": "editable",
    "strategy.contextMode": "editable",
    "strategy.sessionPolicy": "editable",
    "strategy.maxIterations": "editable",
    "strategy.timeoutMs": "editable",
    "strategy.allowFileWrites": "editable",
    "strategy.outputFormat": "editable",
    "constraints.forcedTools": "editable",
    "constraints.allowedTools": "editable",
    "constraints.forcedSkills": "editable",
    "constraints.allowedSkills": "editable",
    "constraints.forcedMcpServers": "editable",
    "constraints.allowedMcpServers": "editable",
    "metadata": "editable",
  },
}

export const opencodeDefaultAgent = new BaseAgentModeTemplate(opencodeDefaultAgentData)

// ── Reasonix Plan-Build-Review ───────────────────────────────────────────

const reasonixPlanBuildReviewData: AgentModeTemplateData = {
  id: "reasonix-plan-build-review",
  version: "1.0.0",
  name: "Reasonix Plan-Build-Review",
  description:
    "Orchestrated agent mode using Reasonix with planner, executor, and reviewer roles.",
  tags: ["reasonix", "plan", "build", "review", "orchestrated"],
  kind: "base",
  origin: "native-cli",
  controlSurface: "customizable",
  providerCompatibility: {
    providerIds: ["reasonix"],
  },
  defaultBinding: {
    providerId: "reasonix",
  },
  strategy: {
    model: "default",
    contextMode: "fresh",
    sessionPolicy: "fresh",
    maxIterations: 100,
    timeoutMs: 600_000,
    allowFileWrites: true,
    outputFormat: "markdown",
  },
  orchestration: {
    plannerAgentModeId: "reasonix-plan-build-review",
    executorAgentModeId: "reasonix-plan-build-review",
    reviewerAgentModeId: "reasonix-plan-build-review",
  },
  constraints: {},
  fieldPolicy: {
    "id": "readonly",
    "version": "readonly",
    "name": "editable",
    "description": "editable",
    "tags": "editable",
    "kind": "inherited",
    "origin": "readonly",
    "controlSurface": "readonly",
    "providerCompatibility.providerIds": "editable",
    "defaultBinding.providerId": "readonly",
    "strategy.model": "editable",
    "strategy.contextMode": "editable",
    "strategy.sessionPolicy": "editable",
    "strategy.maxIterations": "editable",
    "strategy.timeoutMs": "editable",
    "strategy.allowFileWrites": "editable",
    "strategy.outputFormat": "editable",
    "orchestration.plannerAgentModeId": "editable",
    "orchestration.executorAgentModeId": "editable",
    "orchestration.reviewerAgentModeId": "editable",
    "constraints.forcedTools": "editable",
    "constraints.allowedTools": "editable",
    "constraints.forcedSkills": "editable",
    "constraints.allowedSkills": "editable",
    "constraints.forcedMcpServers": "editable",
    "constraints.allowedMcpServers": "editable",
    "metadata": "editable",
  },
}

export const reasonixPlanBuildReview = new BaseAgentModeTemplate(reasonixPlanBuildReviewData)

// ── Codex Default Build ──────────────────────────────────────────────────

const codexDefaultBuildData: AgentModeTemplateData = {
  id: "codex-default-build",
  version: "1.0.0",
  name: "Codex Default Build",
  description:
    "Default build mode for Codex CLI. Exists even when Codex is offline. CLI binding readonly; prompt/session fields may be overridable.",
  tags: ["codex", "build", "default"],
  kind: "base",
  origin: "native-cli",
  controlSurface: "cli-owned",
  providerCompatibility: {
    providerIds: ["codex"],
    nativeAliases: { codex: "build" },
  },
  defaultBinding: {
    cliAlias: "build",
    providerId: "codex",
  },
  strategy: {
    model: "default",
    contextMode: "fresh",
    sessionPolicy: "fresh",
    maxIterations: 80,
    timeoutMs: 600_000,
    allowFileWrites: true,
    outputFormat: "text",
  },
  orchestration: undefined,
  constraints: {},
  fieldPolicy: {
    "id": "readonly",
    "version": "readonly",
    "name": "readonly",
    "description": "readonly",
    "tags": "readonly",
    "kind": "inherited",
    "origin": "readonly",
    "controlSurface": "readonly",
    "providerCompatibility.providerIds": "readonly",
    "providerCompatibility.nativeAliases": "readonly",
    "defaultBinding.cliAlias": "readonly",
    "defaultBinding.providerId": "readonly",
    "strategy.model": "readonly",
    "strategy.systemPrompt": "editable",
    "strategy.buildPrompt": "editable",
    "strategy.systemPromptFile": "editable",
    "strategy.buildPromptFile": "editable",
    "strategy.plannerFile": "readonly",
    "strategy.subagentFiles": "readonly",
    "strategy.contextMode": "readonly",
    "strategy.sessionPolicy": "editable",
    "strategy.maxIterations": "readonly",
    "strategy.timeoutMs": "readonly",
    "strategy.allowFileWrites": "readonly",
    "strategy.outputFormat": "readonly",
    "constraints.forcedTools": "readonly",
    "constraints.allowedTools": "readonly",
    "constraints.forcedSkills": "readonly",
    "constraints.allowedSkills": "readonly",
    "constraints.forcedMcpServers": "readonly",
    "constraints.allowedMcpServers": "readonly",
    "metadata": "readonly",
  },
}

export const codexDefaultBuild = new BaseAgentModeTemplate(codexDefaultBuildData)

// ── Copilot Default Agent ────────────────────────────────────────────────

const copilotDefaultAgentData: AgentModeTemplateData = {
  id: "copilot-default-agent",
  version: "1.0.0",
  name: "Copilot Default Agent",
  description:
    "Default agent mode bound to Copilot. Agent-mode-bound style with limited overrides.",
  tags: ["copilot", "agent", "default"],
  kind: "base",
  origin: "agent-mode-bound",
  controlSurface: "cli-owned",
  providerCompatibility: {
    providerIds: ["copilot"],
  },
  defaultBinding: {
    providerId: "copilot",
  },
  strategy: {
    model: "default",
    contextMode: "inherit",
    sessionPolicy: "inherit",
    maxIterations: 40,
    timeoutMs: 300_000,
    allowFileWrites: true,
    outputFormat: "text",
  },
  orchestration: undefined,
  constraints: {},
  fieldPolicy: {
    "id": "readonly",
    "version": "readonly",
    "name": "readonly",
    "description": "readonly",
    "tags": "readonly",
    "kind": "inherited",
    "origin": "readonly",
    "controlSurface": "readonly",
    "providerCompatibility.providerIds": "readonly",
    "defaultBinding.providerId": "readonly",
    "strategy.model": "editable",
    "strategy.systemPrompt": "editable",
    "strategy.buildPrompt": "editable",
    "strategy.systemPromptFile": "readonly",
    "strategy.buildPromptFile": "readonly",
    "strategy.plannerFile": "readonly",
    "strategy.subagentFiles": "readonly",
    "strategy.contextMode": "readonly",
    "strategy.sessionPolicy": "readonly",
    "strategy.maxIterations": "readonly",
    "strategy.timeoutMs": "readonly",
    "strategy.allowFileWrites": "readonly",
    "strategy.outputFormat": "readonly",
    "constraints.forcedTools": "readonly",
    "constraints.allowedTools": "readonly",
    "constraints.forcedSkills": "readonly",
    "constraints.allowedSkills": "readonly",
    "constraints.forcedMcpServers": "readonly",
    "constraints.allowedMcpServers": "readonly",
    "metadata": "readonly",
  },
}

export const copilotDefaultAgent = new BaseAgentModeTemplate(copilotDefaultAgentData)

// ── Kiro Default ─────────────────────────────────────────────────────────

const kiroDefaultData: AgentModeTemplateData = {
  id: "kiro-default",
  version: "1.0.0",
  name: "Kiro Default",
  description:
    "Native Kiro CLI defaults. Command fields are readonly.",
  tags: ["kiro", "default"],
  kind: "base",
  origin: "native-cli",
  controlSurface: "cli-owned",
  providerCompatibility: {
    providerIds: ["kiro"],
    nativeAliases: { kiro: "chat" },
  },
  defaultBinding: {
    cliAlias: "chat",
    providerId: "kiro",
  },
  strategy: {
    model: "default",
    contextMode: "fresh",
    sessionPolicy: "fresh",
    maxIterations: 60,
    timeoutMs: 300_000,
    allowFileWrites: true,
    outputFormat: "text",
  },
  orchestration: undefined,
  constraints: {},
  fieldPolicy: {
    "id": "readonly",
    "version": "readonly",
    "name": "readonly",
    "description": "readonly",
    "tags": "readonly",
    "kind": "inherited",
    "origin": "readonly",
    "controlSurface": "readonly",
    "providerCompatibility.providerIds": "readonly",
    "providerCompatibility.nativeAliases": "readonly",
    "defaultBinding.cliAlias": "readonly",
    "defaultBinding.providerId": "readonly",
    "strategy.model": "readonly",
    "strategy.systemPrompt": "readonly",
    "strategy.buildPrompt": "readonly",
    "strategy.systemPromptFile": "readonly",
    "strategy.buildPromptFile": "readonly",
    "strategy.plannerFile": "readonly",
    "strategy.subagentFiles": "readonly",
    "strategy.contextMode": "readonly",
    "strategy.sessionPolicy": "readonly",
    "strategy.maxIterations": "readonly",
    "strategy.timeoutMs": "readonly",
    "strategy.allowFileWrites": "readonly",
    "strategy.outputFormat": "readonly",
    "constraints.forcedTools": "readonly",
    "constraints.allowedTools": "readonly",
    "constraints.forcedSkills": "readonly",
    "constraints.allowedSkills": "readonly",
    "constraints.forcedMcpServers": "readonly",
    "constraints.allowedMcpServers": "readonly",
    "metadata": "readonly",
  },
}

export const kiroDefault = new BaseAgentModeTemplate(kiroDefaultData)

// ── Custom Agent Mode ────────────────────────────────────────────────────

const customAgentModeData: AgentModeTemplateData = {
  id: "custom-agent-mode",
  version: "1.0.0",
  name: "Custom Agent Mode",
  description:
    "Fully editable custom agent mode for user-defined configurations.",
  tags: ["custom", "user-defined"],
  kind: "custom",
  origin: "custom",
  controlSurface: "customizable",
  providerCompatibility: {
    providerIds: ["custom", "opencode", "codex", "reasonix", "copilot", "openai", "kiro"],
  },
  defaultBinding: {
    providerId: "custom",
  },
  strategy: {
    model: "default",
    contextMode: "fresh",
    sessionPolicy: "fresh",
    maxIterations: 50,
    timeoutMs: 300_000,
    allowFileWrites: true,
    outputFormat: "text",
  },
  orchestration: undefined,
  constraints: {},
  fieldPolicy: {
    "id": "editable",
    "version": "editable",
    "name": "editable",
    "description": "editable",
    "tags": "editable",
    "kind": "editable",
    "origin": "editable",
    "controlSurface": "editable",
    "providerCompatibility.providerIds": "editable",
    "providerCompatibility.nativeAliases": "editable",
    "defaultBinding.cliAlias": "editable",
    "defaultBinding.llmApiTemplateId": "editable",
    "defaultBinding.workflowActionTemplateId": "editable",
    "defaultBinding.providerId": "editable",
    "strategy.model": "editable",
    "strategy.systemPrompt": "editable",
    "strategy.buildPrompt": "editable",
    "strategy.systemPromptFile": "editable",
    "strategy.buildPromptFile": "editable",
    "strategy.plannerFile": "editable",
    "strategy.subagentFiles": "editable",
    "strategy.contextMode": "editable",
    "strategy.sessionPolicy": "editable",
    "strategy.maxIterations": "editable",
    "strategy.timeoutMs": "editable",
    "strategy.allowFileWrites": "editable",
    "strategy.outputFormat": "editable",
    "orchestration.plannerAgentModeId": "editable",
    "orchestration.executorAgentModeId": "editable",
    "orchestration.reviewerAgentModeId": "editable",
    "constraints.forcedTools": "editable",
    "constraints.allowedTools": "editable",
    "constraints.forcedSkills": "editable",
    "constraints.allowedSkills": "editable",
    "constraints.forcedMcpServers": "editable",
    "constraints.allowedMcpServers": "editable",
    "metadata": "editable",
  },
}

export const customAgentMode = new CustomAgentModeTemplate(customAgentModeData)

function opencodeNativeModeData(mode: "chat" | "plan" | "build"): AgentModeTemplateData {
  const writes = mode !== "chat"
  const labels = { chat: "Chat", plan: "Plan", build: "Build" } as const
  return {
    id: `opencode-${mode}`,
    version: "1.0.0",
    name: `OpenCode ${labels[mode]}`,
    description: `OpenCode ${mode} strategy. The workflow node supplies the LLM API/model at runtime.`,
    tags: ["opencode", mode, "workflow-selected-model"],
    kind: "custom",
    origin: "native-cli",
    controlSurface: "customizable",
    providerCompatibility: {
      providerIds: ["opencode"],
      nativeAliases: { opencode: mode === "build" ? "agent" : mode },
    },
    defaultBinding: {
      cliAlias: mode === "build" ? "agent" : mode,
      providerId: "opencode",
    },
    strategy: {
      model: "workflow-selected",
      contextMode: mode === "chat" ? "fresh" : "inherit",
      sessionPolicy: mode === "chat" ? "fresh" : "inherit",
      maxIterations: mode === "chat" ? 1 : 25,
      timeoutMs: mode === "chat" ? 300_000 : 900_000,
      allowFileWrites: writes,
      outputFormat: "text",
    },
    orchestration: undefined,
    constraints: {
      allowedTools: writes
        ? ["read_file", "write_file", "edit_file", "shell_metadata", "artifact_link"]
        : ["read_file", "artifact_link"],
    },
    fieldPolicy: {
      "id": "readonly",
      "version": "readonly",
      "name": "editable",
      "description": "editable",
      "tags": "editable",
      "kind": "inherited",
      "origin": "readonly",
      "controlSurface": "readonly",
      "defaultBinding.providerId": "readonly",
      "defaultBinding.cliAlias": "readonly",
      "strategy.model": "inherited",
      "strategy.systemPrompt": "editable",
      "strategy.buildPrompt": "editable",
      "strategy.systemPromptFile": "editable",
      "strategy.buildPromptFile": "editable",
      "strategy.contextMode": "editable",
      "strategy.sessionPolicy": "editable",
      "strategy.maxIterations": "editable",
      "strategy.timeoutMs": "editable",
      "strategy.allowFileWrites": "editable",
      "strategy.outputFormat": "editable",
      "constraints.allowedTools": "editable",
      "metadata": "editable",
    },
  }
}

export const opencodeChat = new CustomAgentModeTemplate(opencodeNativeModeData("chat"))
export const opencodePlan = new CustomAgentModeTemplate(opencodeNativeModeData("plan"))
export const opencodeBuild = new CustomAgentModeTemplate(opencodeNativeModeData("build"))

function opencodeIsolationChatMode(
  id: "opencode-chat-isolation-alpha" | "opencode-chat-isolation-beta",
  name: string,
  skillId: string,
  mcpId: string,
): AgentModeTemplateData {
  return {
    id,
    version: "1.0.0",
    name,
    description: `OpenCode chat for ${skillId}/${mcpId}. Proves skill read + MCP call; secrets live only in library entities.`,
    tags: ["opencode", "chat", "isolation", skillId, mcpId],
    kind: "custom",
    origin: "custom",
    controlSurface: "customizable",
    providerCompatibility: {
      providerIds: ["opencode"],
      nativeAliases: { opencode: "chat" },
    },
    defaultBinding: {
      cliAlias: "chat",
      providerId: "opencode",
    },
    strategy: {
      model: "workflow-selected",
      systemPrompt: ISOLATION_PROBE_AGENT_SYSTEM,
      contextMode: "fresh",
      sessionPolicy: "fresh",
      maxIterations: 4,
      timeoutMs: 180_000,
      allowFileWrites: false,
      outputFormat: "text",
    },
    orchestration: undefined,
    constraints: {
      forcedSkills: [skillId],
      forcedMcpServers: [mcpId],
      allowedTools: ["read_file", "artifact_link", "skill"],
    },
    fieldPolicy: {
      "id": "readonly",
      "version": "readonly",
      "name": "editable",
      "description": "editable",
      "tags": "editable",
      "kind": "inherited",
      "origin": "readonly",
      "controlSurface": "readonly",
      "defaultBinding.providerId": "readonly",
      "strategy.model": "inherited",
      "strategy.systemPrompt": "editable",
      "strategy.contextMode": "readonly",
      "strategy.sessionPolicy": "readonly",
      "strategy.maxIterations": "readonly",
      "strategy.timeoutMs": "editable",
      "strategy.allowFileWrites": "readonly",
      "constraints.forcedSkills": "readonly",
      "constraints.forcedMcpServers": "readonly",
      "constraints.allowedTools": "readonly",
      "metadata": "editable",
    },
  }
}

export const opencodeChatIsolationAlpha = new CustomAgentModeTemplate(
  opencodeIsolationChatMode("opencode-chat-isolation-alpha", "OpenCode Isolation Alpha", "skill-alpha", "mcp-alpha"),
)
export const opencodeChatIsolationBeta = new CustomAgentModeTemplate(
  opencodeIsolationChatMode("opencode-chat-isolation-beta", "OpenCode Isolation Beta", "skill-beta", "mcp-beta"),
)

// ── OpenCode Chat (Kuaipao) ──────────────────────────────────────────

const opencodeChatKuaipaoData: AgentModeTemplateData = {
  id: "opencode-chat-kuaipao",
  version: "1.0.0",
  name: "OpenCode Chat",
  description: "OpenCode chat strategy; the workflow node supplies the LLM API and model at runtime.",
  tags: ["opencode", "chat", "workflow-selected-model"],
  kind: "custom",
  origin: "custom",
  controlSurface: "customizable",
  providerCompatibility: {
    providerIds: ["opencode"],
  },
  defaultBinding: {
    providerId: "opencode",
  },
  strategy: {
    model: "workflow-selected",
    contextMode: "inherit",
    sessionPolicy: "shared",
    maxIterations: 1,
    timeoutMs: 300_000,
    allowFileWrites: false,
    outputFormat: "text",
  },
  orchestration: undefined,
  constraints: {},
  fieldPolicy: {
    "id": "readonly",
    "version": "readonly",
    "name": "editable",
    "description": "editable",
    "tags": "editable",
    "kind": "inherited",
    "origin": "readonly",
    "controlSurface": "readonly",
    "defaultBinding.providerId": "readonly",
    "strategy.model": "editable",
    "strategy.contextMode": "editable",
    "strategy.sessionPolicy": "editable",
    "strategy.maxIterations": "editable",
    "strategy.timeoutMs": "editable",
    "strategy.allowFileWrites": "editable",
    "strategy.outputFormat": "editable",
  },
}

export const opencodeChatKuaipao = new CustomAgentModeTemplate(opencodeChatKuaipaoData)

// ── Custom IO Collaboration Planner ────────────────────────────────────

const customIoPlannerData: AgentModeTemplateData = {
  id: "custom-io-planner",
  version: "1.0.0",
  name: "IO Collaboration Planner",
  description:
    "OpenCode planner with file access. Emits JSON allocation plan for runtime folder creation and flat→dest migration (workflow-io strategy).",
  tags: ["opencode", "custom", "planner", "workflow-io", "io-collab"],
  kind: "custom",
  origin: "custom",
  controlSurface: "customizable",
  providerCompatibility: {
    providerIds: ["opencode"],
    nativeAliases: { opencode: "plan" },
  },
  defaultBinding: {
    cliAlias: "plan",
    providerId: "opencode",
  },
  strategy: {
    model: "workflow-selected",
    contextMode: "fresh",
    sessionPolicy: "fresh",
    maxIterations: 12,
    timeoutMs: 900_000,
    allowFileWrites: true,
    outputFormat: "json",
  },
  orchestration: undefined,
  constraints: {
    forcedMcpServers: ["workflow-io", "workflow-web"],
    allowedTools: ["read_file", "write_file", "edit_file", "glob", "list", "grep", "artifact_link"],
  },
  fieldPolicy: {
    "id": "readonly",
    "version": "readonly",
    "name": "editable",
    "description": "editable",
    "tags": "editable",
    "kind": "inherited",
    "origin": "readonly",
    "controlSurface": "readonly",
    "defaultBinding.providerId": "readonly",
    "defaultBinding.cliAlias": "readonly",
    "strategy.model": "inherited",
    "strategy.systemPrompt": "editable",
    "strategy.contextMode": "editable",
    "strategy.maxIterations": "editable",
    "strategy.timeoutMs": "editable",
    "strategy.allowFileWrites": "editable",
    "strategy.outputFormat": "editable",
    "constraints.forcedMcpServers": "readonly",
    "constraints.allowedTools": "editable",
    "metadata": "editable",
  },
  metadata: {
    archetype: "planner",
    ioCollabStrategy: "workflow-io",
  },
}

export const customIoPlanner = new CustomAgentModeTemplate(customIoPlannerData)

// ── Registry ─────────────────────────────────────────────────────────────

/** All built-in default agent modes keyed by id */
export const defaultAgentModes: Record<string, BaseAgentModeTemplate | CustomAgentModeTemplate | DerivedAgentModeTemplate> = {
  "opencode-chat": opencodeChat,
  "opencode-plan": opencodePlan,
  "opencode-build": opencodeBuild,
  "opencode-chat-isolation-alpha": opencodeChatIsolationAlpha,
  "opencode-chat-isolation-beta": opencodeChatIsolationBeta,
  "opencode-chat-kuaipao": opencodeChatKuaipao,
  "custom-io-planner": customIoPlanner,
  "opencode-default-agent": opencodeDefaultAgent,
  "reasonix-plan-build-review": reasonixPlanBuildReview,
  "codex-default-build": codexDefaultBuild,
  "copilot-default-agent": copilotDefaultAgent,
  "kiro-default": kiroDefault,
  "custom-agent-mode": customAgentMode,
}
