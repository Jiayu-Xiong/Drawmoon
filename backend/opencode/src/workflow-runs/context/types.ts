/** Workflow node context contract types (backend-only). */

export type NodeArchetype =
  | "planner"
  | "worker"
  | "reviser"
  | "merger"
  | "reviewer"
  | "media"
  | "gate"
  | "finalizer"

export type InputTransportMode = "reference" | "summary" | "inline"
export type OutputCriticality = "critical" | "isolated" | "optional"
export type ContextTransport = "intra" | "inter" | "auto"

/** High-level interaction intent — collapses policy/contextMode/transport for templates. */
export type InteractionIntent = "continue" | "handoff" | "review"

export type InputDescriptorKind = "text" | "markdown" | "image" | "pdf" | "binary"

export interface NodeContractInput {
  key: string
  from: string
  mode?: InputTransportMode
  /** Heading name or regex source for inline slices */
  slice?: string
  required?: boolean
}

export interface NodeContractOutput {
  key: string
  path: string
  criticality?: OutputCriticality
}

export interface NodeContract {
  inputs?: NodeContractInput[]
  outputs?: NodeContractOutput[]
  transport?: ContextTransport
}

export interface WorkflowNodeContextMeta {
  archetype?: NodeArchetype
  contract?: NodeContract
  readRunFiles?: string[]
  outputFile?: string
  /** Explicit interaction intent; derived from archetype when omitted. */
  intent?: InteractionIntent
  /** IO planner: phase-1 writes questions file, pauses, then continues after reply file. */
  plannerInquiry?: boolean
  inquiryQuestionsFile?: string
  inquiryReplyFile?: string
  gateRequiredArtifacts?: string[]
}

export const SYSTEM_MCP_IO = "workflow-io"
export const SYSTEM_MCP_WEB = "workflow-web"
