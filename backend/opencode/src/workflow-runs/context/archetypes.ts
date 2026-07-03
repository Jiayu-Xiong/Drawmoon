import type { AgentNodeConfig } from "../../schema/types.js"
import type { InteractionIntent, NodeArchetype, NodeContract, OutputCriticality } from "./types.js"
import { SYSTEM_MCP_IO, SYSTEM_MCP_WEB } from "./types.js"

export interface ArchetypeDefaults {
  contract?: NodeContract
  transport: NodeContract["transport"]
  intent: InteractionIntent
  allowFileWrites: boolean
  forcedMcpServers: string[]
  allowedTools: string[]
  defaultCriticality: OutputCriticality
}

const IO_MCP = [SYSTEM_MCP_IO]
const IO_WEB_MCP = [SYSTEM_MCP_IO, SYSTEM_MCP_WEB]

export const ARCHETYPE_INTENT: Record<NodeArchetype, InteractionIntent> = {
  planner: "handoff",
  worker: "handoff",
  reviser: "continue",
  merger: "handoff",
  reviewer: "review",
  media: "handoff",
  gate: "handoff",
  finalizer: "handoff",
}

export const ARCHETYPE_DEFAULTS: Record<NodeArchetype, ArchetypeDefaults> = {
  planner: {
    transport: "inter",
    intent: "handoff",
    allowFileWrites: true,
    forcedMcpServers: IO_WEB_MCP,
    allowedTools: ["artifact_link"],
    defaultCriticality: "critical",
    contract: {
      outputs: [
        { key: "allocation-plan", path: ".workflow/allocation-plan.json", criticality: "optional" },
        { key: "manifest", path: ".workflow/planner-manifest.json", criticality: "optional" },
        { key: "contextpack", path: "journal-architecture.md", criticality: "critical" },
        { key: "method-notes", path: "method-rewrite-notes.md", criticality: "critical" },
      ],
    },
  },
  worker: {
    transport: "inter",
    intent: "handoff",
    allowFileWrites: true,
    forcedMcpServers: IO_MCP,
    allowedTools: ["artifact_link"],
    defaultCriticality: "isolated",
  },
  reviser: {
    transport: "intra",
    intent: "continue",
    allowFileWrites: true,
    forcedMcpServers: IO_MCP,
    allowedTools: ["artifact_link"],
    defaultCriticality: "isolated",
  },
  merger: {
    transport: "inter",
    intent: "handoff",
    allowFileWrites: true,
    forcedMcpServers: IO_MCP,
    allowedTools: ["artifact_link"],
    defaultCriticality: "critical",
  },
  reviewer: {
    transport: "inter",
    intent: "review",
    allowFileWrites: false,
    forcedMcpServers: IO_WEB_MCP,
    allowedTools: ["artifact_link"],
    defaultCriticality: "optional",
  },
  media: {
    transport: "inter",
    intent: "handoff",
    allowFileWrites: false,
    forcedMcpServers: IO_MCP,
    allowedTools: ["artifact_link"],
    defaultCriticality: "isolated",
  },
  gate: {
    transport: "inter",
    intent: "handoff",
    allowFileWrites: false,
    forcedMcpServers: [],
    allowedTools: [],
    defaultCriticality: "optional",
  },
  finalizer: {
    transport: "inter",
    intent: "handoff",
    allowFileWrites: true,
    forcedMcpServers: IO_MCP,
    allowedTools: ["artifact_link"],
    defaultCriticality: "critical",
  },
}

export function mergeContract(archetype: NodeArchetype | undefined, explicit?: NodeContract): NodeContract | undefined {
  const base = archetype ? ARCHETYPE_DEFAULTS[archetype]?.contract : undefined
  if (!base && !explicit) return explicit
  return {
    transport: explicit?.transport ?? base?.transport,
    inputs: explicit?.inputs ?? base?.inputs,
    outputs: explicit?.outputs ?? base?.outputs,
  }
}

export function resolveInteractionIntent(
  archetype: NodeArchetype | undefined,
  explicit?: InteractionIntent,
): InteractionIntent {
  if (explicit) return explicit
  if (archetype) return ARCHETYPE_INTENT[archetype] ?? "handoff"
  return "handoff"
}

export function applyArchetypeToConfig(config: AgentNodeConfig, archetype?: NodeArchetype): AgentNodeConfig {
  if (!archetype) return config
  const defaults = ARCHETYPE_DEFAULTS[archetype]
  const constraints = { ...(config.constraints ?? {}) }
  if (!constraints.forcedMcpServers?.length) constraints.forcedMcpServers = [...defaults.forcedMcpServers]
  if (!constraints.allowedTools?.length) constraints.allowedTools = [...defaults.allowedTools]
  return {
    ...config,
    allowFileWrites: config.allowFileWrites ?? defaults.allowFileWrites,
    constraints,
  }
}
