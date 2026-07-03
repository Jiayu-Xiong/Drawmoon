/**
 * Core type definitions for the workflow local agent system.
 *
 * These types define the contracts between the workflow frontend,
 * the local agent runtime, and the provider adapters.
 */

import type { z } from "zod"

// ── Provider Types ──────────────────────────────────────────────────────

export type ProviderId = "opencode" | "codex" | "reasonix" | "copilot" | "custom" | "openai" | "kiro"

export interface ProviderInfo {
  id: ProviderId
  name: string
  version: string | null
  available: boolean
  path: string | null
  capabilities: ProviderCapabilities
}

export interface ProviderCapabilities {
  /** Whether the provider supports non-interactive execution */
  nonInteractive: boolean
  /** Whether the provider supports session resume */
  sessionResume: boolean
  /** Whether the provider supports streaming output */
  streaming: boolean
  /** Whether the provider supports cancellation */
  cancellation: boolean
  /** Whether the provider can read/write files */
  fileOps: boolean
  /** Whether the provider supports forking sessions */
  fork: boolean
  /** Maximum allowed iterations (0 = unlimited) */
  maxIterations: number
  /** Supported context modes */
  contextModes: ContextMode[]
  /** Input delivery modalities for cross-node handoff */
  inputModalities?: {
    filesByPath: boolean
    images: boolean
    pdf: boolean
    attachmentChannel: "none" | "path" | "base64"
  }
  /** Extra provider-specific metadata */
  metadata: Record<string, unknown>
}

// ── Context Modes ────────────────────────────────────────────────────────

export type ContextMode = "fresh" | "inherit" | "fork" | "summary" | "artifacts"

export type SessionPolicy = ContextMode | "shared"

// ── Agent Mode ───────────────────────────────────────────────────────────

export type AgentMode = "chat" | "agent" | "build" | "plan" | "review"
export type NodeModality = "text" | "image" | "audio"

// ── Node Config ──────────────────────────────────────────────────────────

export interface AgentNodeConfig {
  /** Provider identifier */
  provider: ProviderId
  /** Agent mode */
  mode: AgentMode
  /** Working directory for execution */
  cwd: string
  /** Main prompt text */
  prompt: string
  /** Path to system prompt file (optional) */
  systemPromptFile?: string
  /** Path to build prompt file (optional) */
  buildPromptFile?: string
  /** Path to planner prompt file (optional) */
  plannerFile?: string
  /** Paths to subagent config files (optional) */
  subagentFiles?: string[]
  /** Glob patterns for context files (optional) */
  contextFiles?: string[]
  /** Glob patterns for cache key files (optional) */
  cacheFiles?: string[]
  /** Maximum iterations before forced stop */
  maxIterations?: number
  /** Timeout in milliseconds */
  timeoutMs?: number
  /** Whether the agent is allowed to write files */
  allowFileWrites?: boolean
  /** Context inheritance mode */
  contextMode: ContextMode
  /** Session resolution policy. Defaults to contextMode when omitted. */
  sessionPolicy?: SessionPolicy
  /** Workflow-local shared session key for sessionPolicy="shared". */
  sessionKey?: string
  /** Existing persisted runtime session id to resume explicitly. */
  sessionId?: string
  /** Custom CLI command (for "custom" provider) */
  customCommand?: string
  /** Custom CLI arguments template (for "custom" provider) */
  customArgs?: string[]
  /** Model name override (for "openai" provider) */
  model?: string
  /** Runtime LLM API binding selected by the workflow node. */
  llmApi?: {
    id?: string
    endpoint?: string
    protocol?: string
    model?: string
    apiKeyEnv?: string
    timeoutMs?: number
  }
  /** Expected node modality. Non-text modalities must run through API/tool providers. */
  modality?: NodeModality
  /** Skill/MCP/tool constraints passed to runtime action.constraints */
  constraints?: {
    forcedSkills?: string[]
    allowedSkills?: string[]
    forcedMcpServers?: string[]
    allowedMcpServers?: string[]
    forcedTools?: string[]
    allowedTools?: string[]
  }
  /** Whole-run read whitelist (absolute paths); injected into workflow-io MCP. */
  readRoots?: string[]
  /** When true, workflow-io write_file only allows root-level paths (no subdirs). */
  flatWriteOnly?: boolean
  /** Capability-aware input attachments planned by the delivery layer */
  inputAttachments?: NodeInputAttachment[]
}

// ── Node Output ──────────────────────────────────────────────────────────

export interface AgentNodeOutput {
  /** Main output text */
  text: string
  /** Native session ID if provider supports resume */
  sessionId?: string
  /** Runtime-managed workflow session ID used for this node */
  runtimeSessionId?: string
  /** Summarised output for downstream inheritance */
  summary?: string
  /** Git diff if file changes were detected */
  diff?: string
  /** Collected artifacts */
  artifacts?: Artifact[]
  /** Unique trace identifier */
  traceId: string
  /** Cache information */
  cache: CacheInfo
  /** Execution metadata */
  metadata: RunMetadata
  /** Normalized token/quota usage when the provider reports it. */
  usage?: TokenUsage
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens?: number
  totalTokens: number
  costUsd?: number
  quotaPercentUsed?: number
  source?: "run-results" | "opencode-telemetry" | "estimated"
}

export interface Artifact {
  /** Artifact name/path */
  name: string
  /** MIME type */
  mime: string
  /** Artifact content or reference */
  content: string
  /** Whether this is a reference (URI) or inline content */
  isReference: boolean
}

/** Typed input attachment planned for delegate delivery (path reference or base64 image). */
export interface NodeInputAttachment {
  kind: "path" | "image"
  key: string
  path?: string
  base64?: string
  mimeType?: string
}

export interface RunMetadata {
  /** Start timestamp (ISO 8601) */
  startedAt: string
  /** End timestamp (ISO 8601) */
  finishedAt: string
  /** Wall-clock duration in milliseconds */
  durationMs: number
  /** Exit code of the CLI process */
  exitCode: number | null
  /** Whether the run was cancelled */
  cancelled: boolean
  /** Whether the run timed out */
  timedOut: boolean
  /** Number of iterations used */
  iterations: number
  /** Provider that executed this node */
  provider: ProviderId
  /** Provider version at time of execution */
  providerVersion: string | null
}

// ── Cache ────────────────────────────────────────────────────────────────

export type CacheMode = "off" | "input-only" | "files-aware"

export interface CacheInfo {
  /** Whether this result is a cache hit */
  hit: boolean
  /** Cache mode used */
  mode: CacheMode
  /** Cache key for this run */
  key: string
  /** Whether the cache was explicitly bypassed */
  bypassed: boolean
  /** When this cache entry was created (ISO 8601) */
  createdAt: string | null
}

export interface CacheEntry {
  key: string
  output: AgentNodeOutput
  configHash: string
  fileHashes: Record<string, string>
  createdAt: string
}

// ── Session ──────────────────────────────────────────────────────────────

export interface SessionState {
  /** Unique session identifier */
  id: string
  /** Provider session ID if native resume is supported */
  providerSessionId?: string
  /** Current context mode */
  contextMode: ContextMode
  /** Collected messages */
  messages: SessionMessage[]
  /** Summary for downstream inheritance */
  summary?: string
  /** Artifacts accumulated in this session */
  artifacts: Artifact[]
  /** Git diff accumulated */
  diff?: string
  /** Parent session ID if forked or inherited */
  parentId?: string
  /** Workflow-local shared session key */
  sessionKey?: string
  /** Trace linkage */
  traceId: string
  /** When the session was created (ISO 8601) */
  createdAt: string
  /** When the session was last updated (ISO 8601) */
  updatedAt: string
}

export interface SessionMessage {
  role: "user" | "assistant" | "system"
  content: string
  timestamp: string
}

// ── Run Events (streaming) ───────────────────────────────────────────────

export type RunEvent =
  | { type: "start"; runId: string; nodeId: string; timestamp: string }
  | { type: "stdout"; runId: string; data: string; timestamp: string }
  | { type: "stderr"; runId: string; data: string; timestamp: string }
  | { type: "progress"; runId: string; message: string; timestamp: string }
  | { type: "artifact"; runId: string; artifact: Artifact; timestamp: string }
  | { type: "diff"; runId: string; diff: string; timestamp: string }
  | { type: "cache"; runId: string; info: CacheInfo; timestamp: string }
  | { type: "session"; runId: string; sessionId: string; policy: SessionPolicy; sessionKey?: string; timestamp: string }
  | { type: "error"; runId: string; error: string; timestamp: string }
  | { type: "complete"; runId: string; result: AgentNodeOutput; timestamp: string }
  | { type: "cancelled"; runId: string; timestamp: string }

// ── Workflow Graph ───────────────────────────────────────────────────────

export interface WorkflowNode {
  /** Unique node identifier */
  id: string
  /** Human-readable label */
  label: string
  /** Node configuration */
  config: AgentNodeConfig
  /** Optional normalized workflow action payload */
  action?: unknown
  /** Position on canvas (for UI) */
  position?: { x: number; y: number }
  /** Runner/template metadata (output files, read lists, etc.) */
  metadata?: Record<string, unknown>
}

export interface WorkflowEdge {
  /** Source node ID */
  from: string
  /** Target node ID */
  to: string
  /** Context mode for this edge */
  contextMode: ContextMode
}

export interface WorkflowInputMountSpec {
  /** Name under the entity output directory. */
  name: string
  /** Path relative to readDirectory (or absolute). */
  path: string
}

export interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** Template-configured read root. Entity output dir is always allocated at runtime. */
  readDirectory?: string
  /** Additional absolute read roots allowed for this workflow (whole-run whitelist). */
  readRoots?: string[]
  /** Read-only trees to link into the entity output dir before nodes run. */
  inputMounts?: WorkflowInputMountSpec[]
  /** Optional workflow-level timeout */
  timeoutMs?: number
  /** Optional initial shared session ids keyed by workflow-local session key */
  sessionGroups?: Record<string, string>
}

export interface WorkflowRun {
  id: string
  graph: WorkflowGraph
  status: "pending" | "running" | "completed" | "cancelled" | "failed"
  nodeResults: Record<string, AgentNodeOutput>
  startedAt: string | null
  finishedAt: string | null
}

// ── Trace ────────────────────────────────────────────────────────────────

export interface TraceRecord {
  id: string
  workflowId?: string
  nodeId: string
  config: AgentNodeConfig
  events: RunEvent[]
  result: AgentNodeOutput | null
  startedAt: string
  finishedAt: string | null
}

// ── Provider Adapter Interface ───────────────────────────────────────────

export interface AgentRunSpec {
  config: AgentNodeConfig
  session?: SessionState
  cwd: string
  signal?: AbortSignal
}

export interface PreparedRun {
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  timeoutMs: number
  /** When set, prompt is sent via stdin instead of CLI args (avoids length limits). */
  stdin?: string
  /** Optional API fallback used when a CLI strategy cannot spawn in the host OS. */
  llmApiFallback?: {
    protocol: string
    endpoint: string
    model: string
    apiKey?: string
    apiKeyEnv?: string
    timeoutMs?: number
    responseFormat?: "markdown" | "json" | "text"
    provider: ProviderId
  }
}

export interface AgentProviderAdapter {
  id: ProviderId
  /** Detect whether this provider is available on the system */
  detect(): Promise<ProviderInfo>
  /** Prepare a concrete CLI command from a run spec */
  prepare(input: AgentRunSpec): Promise<PreparedRun>
  /** Execute the prepared run and yield events */
  execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent>
  /** Parse collected events into a final result */
  parse(events: RunEvent[]): Promise<AgentNodeOutput>
  /** Declared capabilities */
  capabilities: ProviderCapabilities
  /** Optional: custom provider commands for data queries (model list, pricing, etc.) */
  commands?: ProviderCommandBinding[]
  /** Optional: execute a bound command directly */
  runCommand?(commandId: string): AsyncIterable<CommandOutputChunk>
  /** Optional: provider-specific non-token status probe */
  getStatus?(): Promise<unknown>
}

// ── Provider Command Binding ─────────────────────────────────────────────

export type CommandOutputStyle = "text" | "json" | "table" | "key-value" | "code"

export interface CommandColumn {
  key: string
  label: string
  width?: string
  align?: "left" | "right" | "center"
}

export interface ProviderCommandBinding {
  /** Unique command id within the provider */
  id: string
  /** Human-readable label */
  label: string
  /** Short description */
  description: string
  /** CLI command to execute */
  command: string
  /** CLI arguments */
  args: string[]
  /** Shell: cmd.exe on Windows, otherwise auto */
  shell?: string
  /** How the raw output should be displayed */
  outputStyle: CommandOutputStyle
  /** Columns for table display (only for "table" style) */
  columns?: CommandColumn[]
  /** JMESPath or simple key path to extract from JSON output */
  jsonPath?: string
  /** Whether this command consumes API tokens */
  consumesTokens: boolean
  /** Icon emoji for the command */
  icon?: string
  /** Category grouping */
  category?: string
}

export interface CommandOutputChunk {
  type: "stdout" | "stderr" | "complete" | "error"
  data: string
  timestamp: string
}

export interface CommandRunResult {
  commandId: string
  providerId: string
  label: string
  raw: string
  parsed: unknown
  displayStyle: CommandOutputStyle
  columns?: CommandColumn[]
  exitCode: number | null
  durationMs: number
  timestamp: string
}
