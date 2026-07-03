/**
 * Agent Modes – barrel export.
 *
 * Agent Modes are reusable strategy templates (not online agent instances).
 * Workflow nodes can select one directly, inherit from one, or apply
 * allowed per-node overrides.
 */

export * from "./types.js"
export * from "./defaults.js"
export * from "./resolve.js"

import { defaultAgentModes } from "./defaults.js"
import type { AgentModeTemplateBase } from "./types.js"
import type { AgentModeResolverContext } from "./resolve.js"
import { resolveAgentModeConfig } from "./resolve.js"
import type { AgentModeOverrideInput, ResolvedAgentModeConfig } from "./types.js"

// ── System Factory ───────────────────────────────────────────────────────

export interface AgentModeSystemOptions {
  /** Custom registry of agent modes (defaults to built-in defaults) */
  registry?: Record<string, AgentModeTemplateBase>
  /** Optional provider-level defaults */
  providerDefaults?: Record<string, Partial<import("./types.js").AgentModeTemplateData>>
  /** Optional LLM API derived values */
  llmApiDefaults?: Partial<import("./types.js").AgentModeTemplateData>
}

export interface AgentModeSystem {
  /** Resolve an agent mode config from inputs */
  resolve(input: AgentModeOverrideInput): ResolvedAgentModeConfig
  /** Get the current registry */
  getRegistry(): Record<string, AgentModeTemplateBase>
  /** Register a new agent mode */
  register(template: AgentModeTemplateBase): void
}

export function createAgentModeSystem(options: AgentModeSystemOptions = {}): AgentModeSystem {
  const registry: Record<string, AgentModeTemplateBase> = {
    ...defaultAgentModes,
    ...options.registry,
  }

  const context: AgentModeResolverContext = {
    registry,
    providerDefaults: options.providerDefaults,
    llmApiDefaults: options.llmApiDefaults,
  }

  return {
    resolve(input: AgentModeOverrideInput): ResolvedAgentModeConfig {
      return resolveAgentModeConfig(input, context)
    },

    getRegistry(): Record<string, AgentModeTemplateBase> {
      return { ...registry }
    },

    register(template: AgentModeTemplateBase): void {
      registry[template.id] = template
    },
  }
}
