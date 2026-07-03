/**
 * Agent Mode type definitions.
 *
 * Agent Mode is a reusable strategy template — NOT an online agent instance.
 * No field may represent online/offline status, account state, quota, health,
 * PID, CLI version, or provider availability.
 *
 * Agent Modes work like base classes: workflow nodes can select one directly,
 * inherit from one, or apply allowed per-node overrides.
 */

import type { AgentMode, ProviderId } from "../schema/types.js"

// ── Classification Types ─────────────────────────────────────────────────

export type AgentModeKind = "base" | "derived" | "custom"

export type AgentModeOrigin =
  | "native-cli"
  | "user-installed"
  | "llm-api-derived"
  | "agent-mode-bound"
  | "custom"

export type AgentModeControlSurface =
  | "cli-owned"
  | "customizable"
  | "runtime-owned"

export type AgentModeFieldPolicy =
  | "hidden"
  | "readonly"
  | "editable"
  | "inherited"

// ── Strategy ─────────────────────────────────────────────────────────────

export interface AgentModeStrategy {
  /** Default model name or alias */
  model?: string
  /** Inline system prompt */
  systemPrompt?: string
  /** Inline build/user prompt */
  buildPrompt?: string
  /** Path to system prompt file */
  systemPromptFile?: string
  /** Path to build prompt file */
  buildPromptFile?: string
  /** Path to planner prompt file */
  plannerFile?: string
  /** Paths to subagent config files */
  subagentFiles?: string[]
  /** Default context mode */
  contextMode?: "fresh" | "inherit" | "fork" | "summary" | "artifacts"
  /** Default session policy */
  sessionPolicy?: "fresh" | "inherit" | "shared" | "fork" | "summary" | "artifacts"
  /** Maximum iterations before forced stop */
  maxIterations?: number
  /** Timeout in milliseconds */
  timeoutMs?: number
  /** Whether the agent is allowed to write files */
  allowFileWrites?: boolean
  /** Expected output format */
  outputFormat?: "text" | "json" | "markdown" | "artifact" | "none"
}

// ── Orchestration ────────────────────────────────────────────────────────

export interface AgentModeOrchestration {
  /** Agent mode id for the planner role */
  plannerAgentModeId?: string
  /** Agent mode id for the executor role */
  executorAgentModeId?: string
  /** Agent mode id for the reviewer role */
  reviewerAgentModeId?: string
}

// ── Constraints ──────────────────────────────────────────────────────────

export interface AgentModeConstraints {
  /** Tools the agent is forced to use (cannot be removed) */
  forcedTools?: string[]
  /** Tools the agent is allowed to use (whitelist) */
  allowedTools?: string[]
  /** Skills the agent is forced to use */
  forcedSkills?: string[]
  /** Skills the agent is allowed to use */
  allowedSkills?: string[]
  /** MCP servers the agent is forced to connect to */
  forcedMcpServers?: string[]
  /** MCP servers the agent is allowed to connect to */
  allowedMcpServers?: string[]
}

// ── Default Binding ──────────────────────────────────────────────────────

export interface AgentModeDefaultBinding {
  /** CLI native mode alias, e.g. opencode "agent", codex "build" */
  cliAlias?: string
  /** LLM API template id */
  llmApiTemplateId?: string
  /** Workflow action template id */
  workflowActionTemplateId?: string
  /** Default provider id */
  providerId?: ProviderId
}

// ── Provider Compatibility ───────────────────────────────────────────────

export interface AgentModeProviderCompatibility {
  /** Provider ids this mode is compatible with */
  providerIds: ProviderId[]
  /** Native mode aliases keyed by provider id */
  nativeAliases?: Record<string, string>
}

// ── Field Policy Map ─────────────────────────────────────────────────────

/**
 * Per-field edit policy.
 * Keys are field paths in dot notation, e.g. "strategy.model", "constraints.forcedTools".
 */
export type AgentModeFieldPolicyMap = Record<string, AgentModeFieldPolicy>

// ── Agent Mode Template ──────────────────────────────────────────────────

export interface AgentModeTemplateData {
  /** Unique identifier */
  id: string
  /** Semantic version */
  version: string
  /** Human-readable name */
  name: string
  /** Short description */
  description: string
  /** Search/filter tags */
  tags: string[]
  /** Classification */
  kind: AgentModeKind
  /** Origin of this mode definition */
  origin: AgentModeOrigin
  /** Who controls the mode fields */
  controlSurface: AgentModeControlSurface
  /** Which providers this mode works with */
  providerCompatibility: AgentModeProviderCompatibility
  /** Optional default CLI/API/template binding (not status) */
  defaultBinding?: AgentModeDefaultBinding
  /** Strategy: model, prompts, context/session, iterations, timeout, etc. */
  strategy: AgentModeStrategy
  /** Optional orchestration: planner/executor/reviewer roles */
  orchestration?: AgentModeOrchestration
  /** Allowed/forced tools, skills, MCP servers */
  constraints: AgentModeConstraints
  /** Per-field edit policy */
  fieldPolicy: AgentModeFieldPolicyMap
  /** Optional base mode id for inheritance */
  extendsModeId?: string
  /** Optional metadata */
  metadata?: Record<string, unknown>
}

// ── Resolver Types ───────────────────────────────────────────────────────

export interface AgentModeOverrideInput {
  /** Agent mode id to resolve */
  agentModeId?: string
  /** Per-field overrides from the workflow node */
  overrides?: Partial<AgentModeTemplateData>
  /** Provider id context */
  providerId?: ProviderId
}

export interface AgentModeDiagnostic {
  /** Severity level */
  level: "info" | "warning" | "error"
  /** Field path in dot notation */
  path: string
  /** Human-readable message */
  message: string
}

export interface ResolvedAgentModeConfig {
  /** The resolved agent mode id */
  agentModeId: string
  /** Fully resolved template data */
  resolved: AgentModeTemplateData
  /** Diagnostics collected during resolution */
  diagnostics: AgentModeDiagnostic[]
}

// ── OOP Template Classes ─────────────────────────────────────────────────

/**
 * Abstract base class for Agent Mode templates.
 * Follows the same OOP pattern as WorkflowActionTemplateBase.
 */
export abstract class AgentModeTemplateBase {
  readonly id: string
  readonly version: string
  readonly name: string
  readonly description: string
  readonly tags: string[]
  readonly kind: AgentModeKind
  readonly origin: AgentModeOrigin
  readonly controlSurface: AgentModeControlSurface
  readonly providerCompatibility: AgentModeProviderCompatibility
  readonly defaultBinding?: AgentModeDefaultBinding
  readonly strategy: AgentModeStrategy
  readonly orchestration?: AgentModeOrchestration
  readonly constraints: AgentModeConstraints
  readonly fieldPolicy: AgentModeFieldPolicyMap
  readonly extendsModeId?: string
  readonly metadata?: Record<string, unknown>

  protected constructor(data: AgentModeTemplateData) {
    this.id = data.id
    this.version = data.version
    this.name = data.name
    this.description = data.description
    this.tags = [...data.tags]
    this.kind = data.kind
    this.origin = data.origin
    this.controlSurface = data.controlSurface
    this.providerCompatibility = {
      providerIds: [...data.providerCompatibility.providerIds],
      nativeAliases: data.providerCompatibility.nativeAliases
        ? { ...data.providerCompatibility.nativeAliases }
        : undefined,
    }
    this.defaultBinding = data.defaultBinding ? { ...data.defaultBinding } : undefined
    this.strategy = { ...data.strategy }
    this.orchestration = data.orchestration ? { ...data.orchestration } : undefined
    this.constraints = {
      forcedTools: copyOptionalArray(data.constraints.forcedTools),
      allowedTools: copyOptionalArray(data.constraints.allowedTools),
      forcedSkills: copyOptionalArray(data.constraints.forcedSkills),
      allowedSkills: copyOptionalArray(data.constraints.allowedSkills),
      forcedMcpServers: copyOptionalArray(data.constraints.forcedMcpServers),
      allowedMcpServers: copyOptionalArray(data.constraints.allowedMcpServers),
    }
    this.fieldPolicy = { ...data.fieldPolicy }
    this.extendsModeId = data.extendsModeId
    this.metadata = data.metadata ? { ...data.metadata } : undefined
  }

  /** Export the template as plain data */
  toData(): AgentModeTemplateData {
    return {
      id: this.id,
      version: this.version,
      name: this.name,
      description: this.description,
      tags: [...this.tags],
      kind: this.kind,
      origin: this.origin,
      controlSurface: this.controlSurface,
      providerCompatibility: {
        providerIds: [...this.providerCompatibility.providerIds],
        nativeAliases: this.providerCompatibility.nativeAliases
          ? { ...this.providerCompatibility.nativeAliases }
          : undefined,
      },
      defaultBinding: this.defaultBinding ? { ...this.defaultBinding } : undefined,
      strategy: { ...this.strategy },
      orchestration: this.orchestration ? { ...this.orchestration } : undefined,
      constraints: {
        forcedTools: copyOptionalArray(this.constraints.forcedTools),
        allowedTools: copyOptionalArray(this.constraints.allowedTools),
        forcedSkills: copyOptionalArray(this.constraints.forcedSkills),
        allowedSkills: copyOptionalArray(this.constraints.allowedSkills),
        forcedMcpServers: copyOptionalArray(this.constraints.forcedMcpServers),
        allowedMcpServers: copyOptionalArray(this.constraints.allowedMcpServers),
      },
      fieldPolicy: { ...this.fieldPolicy },
      extendsModeId: this.extendsModeId,
      metadata: this.metadata ? { ...this.metadata } : undefined,
    }
  }

  /** Create a derived copy with overrides merged (shallow merge per section) */
  withOverrides(overrides: Partial<AgentModeTemplateData>): AgentModeTemplateData {
    return mergeAgentModeTemplateData(this.toData(), overrides)
  }
}

// ── Concrete Template Classes ────────────────────────────────────────────

export class BaseAgentModeTemplate extends AgentModeTemplateBase {
  constructor(data: AgentModeTemplateData) {
    super({ ...data, kind: "base" })
  }
}

export class DerivedAgentModeTemplate extends AgentModeTemplateBase {
  constructor(data: AgentModeTemplateData) {
    super({ ...data, kind: "derived" })
  }
}

export class CustomAgentModeTemplate extends AgentModeTemplateBase {
  constructor(data: AgentModeTemplateData) {
    super({ ...data, kind: "custom" })
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function copyOptionalArray(value: string[] | undefined): string[] | undefined {
  return value ? [...value] : undefined
}

/**
 * Merge two AgentModeTemplateData objects.
 * The override values win per section (shallow merge within each section).
 * Empty string, empty array, null, and undefined do NOT erase inherited
 * values unless the field policy explicitly allows clearing.
 */
export function mergeAgentModeTemplateData(
  base: AgentModeTemplateData,
  overrides: Partial<AgentModeTemplateData>,
): AgentModeTemplateData {
  return {
    id: nonEmpty(overrides.id) ?? base.id,
    version: nonEmpty(overrides.version) ?? base.version,
    name: nonEmpty(overrides.name) ?? base.name,
    description: nonEmpty(overrides.description) ?? base.description,
    tags: mergeStringArray(base.tags, overrides.tags),
    kind: overrides.kind ?? base.kind,
    origin: overrides.origin ?? base.origin,
    controlSurface: overrides.controlSurface ?? base.controlSurface,
    providerCompatibility: mergeProviderCompatibility(
      base.providerCompatibility,
      overrides.providerCompatibility,
    ),
    defaultBinding: overrides.defaultBinding !== undefined
      ? { ...base.defaultBinding, ...stripEmptyValues(overrides.defaultBinding as Record<string, unknown>) as Partial<AgentModeDefaultBinding> }
      : base.defaultBinding,
    strategy: overrides.strategy !== undefined
      ? { ...base.strategy, ...stripEmptyValues(overrides.strategy as Record<string, unknown>) }
      : { ...base.strategy },
    orchestration: overrides.orchestration !== undefined
      ? { ...base.orchestration, ...stripEmptyValues(overrides.orchestration as Record<string, unknown>) }
      : base.orchestration ? { ...base.orchestration } : undefined,
    constraints: mergeConstraints(base.constraints, overrides.constraints ?? {}),
    fieldPolicy: { ...base.fieldPolicy, ...overrides.fieldPolicy },
    extendsModeId: overrides.extendsModeId ?? base.extendsModeId,
    metadata: overrides.metadata !== undefined
      ? { ...base.metadata, ...stripEmptyValues(overrides.metadata as Record<string, unknown>) }
      : base.metadata ? { ...base.metadata } : undefined,
  }
}

function mergeStringArray(base: string[], override: string[] | undefined): string[] {
  if (!override) return [...base]
  if (override.length === 0) return [...base] // empty array does not erase
  return [...override]
}

function mergeProviderCompatibility(
  base: AgentModeProviderCompatibility,
  override: AgentModeProviderCompatibility | undefined,
): AgentModeProviderCompatibility {
  if (!override) return { providerIds: [...base.providerIds], nativeAliases: base.nativeAliases ? { ...base.nativeAliases } : undefined }
  return {
    providerIds: override.providerIds.length > 0 ? [...override.providerIds] : [...base.providerIds],
    nativeAliases: override.nativeAliases !== undefined
      ? { ...base.nativeAliases, ...override.nativeAliases }
      : base.nativeAliases ? { ...base.nativeAliases } : undefined,
  }
}

function mergeConstraints(
  base: AgentModeConstraints,
  override: Partial<AgentModeConstraints>,
): AgentModeConstraints {
  return {
    forcedTools: mergeOptionalStringArray(base.forcedTools, override.forcedTools),
    allowedTools: mergeOptionalStringArray(base.allowedTools, override.allowedTools),
    forcedSkills: mergeOptionalStringArray(base.forcedSkills, override.forcedSkills),
    allowedSkills: mergeOptionalStringArray(base.allowedSkills, override.allowedSkills),
    forcedMcpServers: mergeOptionalStringArray(base.forcedMcpServers, override.forcedMcpServers),
    allowedMcpServers: mergeOptionalStringArray(base.allowedMcpServers, override.allowedMcpServers),
  }
}

function mergeOptionalStringArray(
  base: string[] | undefined,
  override: string[] | undefined,
): string[] | undefined {
  if (override === undefined) return base ? [...base] : undefined
  if (override.length === 0) return base ? [...base] : undefined // empty does not erase
  return [...override]
}

/**
 * Strip null, undefined, and empty-string values from an object.
 * Empty strings are treated the same as null/undefined for merge purposes.
 */
function stripEmptyValues<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0)) {
      result[key] = value
    }
  }
  return result as Partial<T>
}

/** Return the value only if it's a non-empty string, else undefined. */
function nonEmpty(value: string | undefined): string | undefined {
  if (value !== undefined && value.trim().length > 0) return value
  return undefined
}
