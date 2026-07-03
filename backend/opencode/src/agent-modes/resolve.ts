/**
 * Agent Mode Config Resolver.
 *
 * Composition order:
 *   1. node override
 *   2. explicit agent mode values
 *   3. inherited / extended agent mode values
 *   4. derived LLM API values
 *   5. provider defaults
 *
 * Rules:
 *   - Empty string, empty array, null, and undefined do NOT erase inherited
 *     values unless the field policy explicitly allows clearing.
 *   - Readonly and inherited fields reject override.
 *   - Hidden fields are not emitted into the resolved config.
 *   - Returns both `resolved` and `diagnostics`.
 */

import type {
  AgentModeDiagnostic,
  AgentModeFieldPolicy,
  AgentModeOverrideInput,
  AgentModeTemplateData,
  ResolvedAgentModeConfig,
} from "./types.js"
import { mergeAgentModeTemplateData } from "./types.js"
import type { AgentModeTemplateBase } from "./types.js"
import { defaultAgentModes } from "./defaults.js"

// ── Resolver Context ─────────────────────────────────────────────────────

export interface AgentModeResolverContext {
  /** Registry of available agent modes (keyed by id) */
  registry: Record<string, AgentModeTemplateBase>
  /** Optional provider-level defaults (keyed by provider id) */
  providerDefaults?: Record<string, Partial<AgentModeTemplateData>>
  /** Optional LLM API derived values */
  llmApiDefaults?: Partial<AgentModeTemplateData>
}

// ── Main Resolver ────────────────────────────────────────────────────────

/**
 * Resolve an agent mode configuration from inputs.
 *
 * Returns both the fully resolved config and any diagnostics.
 */
export function resolveAgentModeConfig(
  input: AgentModeOverrideInput,
  context: AgentModeResolverContext = { registry: defaultAgentModes },
): ResolvedAgentModeConfig {
  const diagnostics: AgentModeDiagnostic[] = []

  // Step 1: Find the base agent mode template
  const agentModeId = input.agentModeId ?? "custom-agent-mode"
  const baseTemplate = context.registry[agentModeId]

  if (!baseTemplate) {
    diagnostics.push({
      level: "error",
      path: "agentModeId",
      message: `Agent mode "${agentModeId}" not found in registry.`,
    })
    // Fall back to custom-agent-mode
    const fallback = context.registry["custom-agent-mode"]
    if (!fallback) {
      return {
        agentModeId,
        resolved: createMinimalFallback(agentModeId),
        diagnostics,
      }
    }
    return resolveWithBase(fallback, input, context, diagnostics)
  }

  return resolveWithBase(baseTemplate, input, context, diagnostics)
}

function resolveWithBase(
  baseTemplate: AgentModeTemplateBase,
  input: AgentModeOverrideInput,
  context: AgentModeResolverContext,
  diagnostics: AgentModeDiagnostic[],
): ResolvedAgentModeConfig {
  const agentModeId = input.agentModeId ?? baseTemplate.id

  // Step 1: Start with the lowest-priority runtime defaults.
  let resolved = createMinimalFallback(baseTemplate.id)
  if (input.providerId && context.providerDefaults?.[input.providerId]) {
    resolved = mergeAgentModeTemplateData(resolved, context.providerDefaults[input.providerId]!)
  }
  if (context.llmApiDefaults) {
    resolved = mergeAgentModeTemplateData(resolved, context.llmApiDefaults)
  }

  // Step 2: Walk the inheritance chain and apply explicit template values.
  const inheritedChain = collectInheritanceChain(baseTemplate, context.registry)
  for (const template of inheritedChain) {
    resolved = mergeAgentModeTemplateData(resolved, template.toData())
  }

  // Step 5: Apply explicit agent mode values (the template itself)
  // The baseTemplate IS the top of the inheritance chain, already applied above
  // But we also need to handle extendsModeId for direct parent
  if (baseTemplate.extendsModeId && !inheritedChain.some((t) => t.id === baseTemplate.extendsModeId)) {
    const parentTemplate = context.registry[baseTemplate.extendsModeId]
    if (parentTemplate) {
      resolved = applyInheritedLayer(resolved, parentTemplate.toData(), diagnostics)
    } else {
      diagnostics.push({
        level: "warning",
        path: "extendsModeId",
        message: `Extended mode "${baseTemplate.extendsModeId}" not found in registry.`,
      })
    }
  }

  // Apply base template's own values (already in chain, but ensure fieldPolicy from actual template)
  resolved.fieldPolicy = { ...resolved.fieldPolicy, ...baseTemplate.toData().fieldPolicy }

  // Step 6: Apply node overrides (highest priority)
  if (input.overrides) {
    resolved = applyNodeOverrides(resolved, input.overrides, diagnostics, resolved.fieldPolicy)
  }

  // Step 7: Strip hidden fields from resolved config
  resolved = stripHiddenFields(resolved)

  return { agentModeId, resolved, diagnostics }
}

// ── Inheritance Chain ────────────────────────────────────────────────────

function collectInheritanceChain(
  template: AgentModeTemplateBase,
  registry: Record<string, AgentModeTemplateBase>,
): AgentModeTemplateBase[] {
  const chain: AgentModeTemplateBase[] = []
  const visited = new Set<string>()
  let current: AgentModeTemplateBase | undefined = template

  while (current) {
    if (visited.has(current.id)) break // cycle detection
    visited.add(current.id)
    chain.unshift(current)
    const nextId: string | undefined = current.extendsModeId
    current = nextId ? registry[nextId] : undefined
  }

  return chain
}

// ── Layer Application ────────────────────────────────────────────────────

function applyLayer(
  base: AgentModeTemplateData,
  layer: Partial<AgentModeTemplateData>,
  source: string,
  diagnostics: AgentModeDiagnostic[],
  fieldPolicy: AgentModeTemplateData["fieldPolicy"],
): AgentModeTemplateData {
  const validated = validateOverrideFields(layer, fieldPolicy, source, diagnostics)
  return mergeAgentModeTemplateData(base, validated)
}

function applyInheritedLayer(
  base: AgentModeTemplateData,
  parent: AgentModeTemplateData,
  diagnostics: AgentModeDiagnostic[],
): AgentModeTemplateData {
  // Inherited values from parent are applied with lower priority
  return mergeAgentModeTemplateData(parent, base)
}

function applyNodeOverrides(
  base: AgentModeTemplateData,
  overrides: Partial<AgentModeTemplateData>,
  diagnostics: AgentModeDiagnostic[],
  fieldPolicy: AgentModeTemplateData["fieldPolicy"],
): AgentModeTemplateData {
  const validated = validateOverrideFields(overrides, fieldPolicy, "node-override", diagnostics)
  return mergeAgentModeTemplateData(base, validated)
}

// ── Field Policy Validation ──────────────────────────────────────────────

function validateOverrideFields(
  overrides: Partial<AgentModeTemplateData>,
  fieldPolicy: AgentModeTemplateData["fieldPolicy"],
  source: string,
  diagnostics: AgentModeDiagnostic[],
): Partial<AgentModeTemplateData> {
  const policyMap = new Map(Object.entries(fieldPolicy))
  return validateOverrideFieldsRecursive(overrides, "", policyMap, source, diagnostics) as Partial<AgentModeTemplateData>
}

function validateOverrideFieldsRecursive(
  obj: Record<string, unknown>,
  parentPath: string,
  policyMap: Map<string, AgentModeFieldPolicy>,
  source: string,
  diagnostics: AgentModeDiagnostic[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = parentPath ? `${parentPath}.${key}` : key
    const exactPolicy = policyMap.get(fieldPath)
    const policy = exactPolicy ?? getFieldPolicy(fieldPath, policyMap)

    if (isPlainObject(value) && !exactPolicy) {
      const nested = validateOverrideFieldsRecursive(
        value as Record<string, unknown>,
        fieldPath,
        policyMap,
        source,
        diagnostics,
      )
      if (Object.keys(nested).length > 0) result[key] = nested
      continue
    }

    if (policy === "readonly" || policy === "inherited") {
      diagnostics.push({
        level: "warning",
        path: fieldPath,
        message: `Field "${fieldPath}" is ${policy} — override from ${source} rejected.`,
      })
      continue
    }

    if (policy === "hidden") {
      diagnostics.push({
        level: "info",
        path: fieldPath,
        message: `Field "${fieldPath}" is hidden — override from ${source} ignored.`,
      })
      continue
    }

    // If the value is a plain object (not array, not null), recurse into it
    if (isPlainObject(value)) {
      result[key] = validateOverrideFieldsRecursive(
        value as Record<string, unknown>,
        fieldPath,
        policyMap,
        source,
        diagnostics,
      )
    } else {
      result[key] = value
    }
  }

  return result
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getFieldPolicy(
  fieldPath: string,
  policyMap: Map<string, AgentModeFieldPolicy>,
): AgentModeFieldPolicy {
  // Try exact match first
  if (policyMap.has(fieldPath)) {
    return policyMap.get(fieldPath)!
  }
  // Try prefix match for nested fields
  const parts = fieldPath.split(".")
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join(".")
    if (policyMap.has(prefix)) {
      return policyMap.get(prefix)!
    }
  }
  return "readonly"
}

// ── Hidden Field Stripping ───────────────────────────────────────────────

function stripHiddenFields(data: AgentModeTemplateData): AgentModeTemplateData {
  const policyMap = new Map(Object.entries(data.fieldPolicy))
  const hiddenFields = new Set<string>()

  for (const [key, policy] of policyMap) {
    if (policy === "hidden") {
      hiddenFields.add(key)
    }
  }

  if (hiddenFields.size === 0) return data

  const result = { ...data }

  // Strip hidden top-level fields and nested strategy/constraint fields
  if (hiddenFields.has("strategy")) {
    result.strategy = {}
  } else {
    result.strategy = { ...data.strategy }
    for (const field of hiddenFields) {
      if (field.startsWith("strategy.")) {
        const subKey = field.slice("strategy.".length)
        delete (result.strategy as Record<string, unknown>)[subKey]
      }
    }
  }

  if (hiddenFields.has("constraints")) {
    result.constraints = {}
  } else {
    result.constraints = { ...data.constraints }
    for (const field of hiddenFields) {
      if (field.startsWith("constraints.")) {
        const subKey = field.slice("constraints.".length)
        delete (result.constraints as Record<string, unknown>)[subKey]
      }
    }
  }

  if (hiddenFields.has("orchestration")) {
    result.orchestration = undefined
  } else if (data.orchestration) {
    result.orchestration = { ...data.orchestration }
    for (const field of hiddenFields) {
      if (field.startsWith("orchestration.")) {
        const subKey = field.slice("orchestration.".length)
        delete (result.orchestration as Record<string, unknown>)[subKey]
      }
    }
  }

  if (hiddenFields.has("defaultBinding")) {
    result.defaultBinding = undefined
  } else if (data.defaultBinding) {
    result.defaultBinding = { ...data.defaultBinding }
  }

  if (hiddenFields.has("providerCompatibility")) {
    result.providerCompatibility = { providerIds: [] }
  }

  if (hiddenFields.has("metadata")) {
    result.metadata = undefined
  }

  return result
}

// ── Fallback ─────────────────────────────────────────────────────────────

function createMinimalFallback(agentModeId: string): AgentModeTemplateData {
  return {
    id: agentModeId,
    version: "0.0.0",
    name: agentModeId,
    description: "Auto-generated fallback agent mode.",
    tags: [],
    kind: "custom",
    origin: "custom",
    controlSurface: "customizable",
    providerCompatibility: { providerIds: [] },
    strategy: {},
    constraints: {},
    fieldPolicy: {},
  }
}
