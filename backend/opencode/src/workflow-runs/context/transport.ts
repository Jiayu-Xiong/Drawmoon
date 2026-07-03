import type { AgentNodeConfig, SessionState, WorkflowGraph, WorkflowNode } from "../../schema/types.js"
import type { Blackboard } from "./blackboard.js"
import { mergeContract, resolveInteractionIntent } from "./archetypes.js"
import { planNodeDelivery } from "./delivery/strategies.js"
import { readNodeArchetype } from "./write-capability.js"
import type { InteractionIntent, WorkflowNodeContextMeta } from "./types.js"

export interface TransportPrepareResult {
  promptSuffix: string
  edgeContextMode: AgentNodeConfig["contextMode"]
  skipUpstream: boolean
}

function nodeConsumesFiles(node: WorkflowNode): boolean {
  const meta = node.metadata as WorkflowNodeContextMeta | undefined
  const contract = mergeContract(meta?.archetype, meta?.contract)
  return Boolean(contract?.inputs?.length || meta?.readRunFiles?.length)
}

function resolveIntent(node: WorkflowNode): InteractionIntent {
  const meta = node.metadata as WorkflowNodeContextMeta | undefined
  const archetype = readNodeArchetype(node)
  return resolveInteractionIntent(archetype, meta?.intent)
}

function intentToContextMode(intent: InteractionIntent, consumes: boolean): AgentNodeConfig["contextMode"] {
  switch (intent) {
    case "continue":
      return "inherit"
    case "review":
      return "fresh"
    case "handoff":
    default:
      return consumes ? "artifacts" : "fresh"
  }
}

/** @deprecated Use planNodeDelivery — kept for callers that only need prompt suffix text. */
export function prepareContractInputs(
  workspaceDir: string,
  node: WorkflowNode,
  blackboard: Blackboard,
  config?: AgentNodeConfig,
): string {
  if (!config) return ""
  return planNodeDelivery(workspaceDir, node, config, blackboard).promptSuffix
}

export function resolveTransportMode(
  node: WorkflowNode,
  config: AgentNodeConfig,
  graph: WorkflowGraph,
  upstreamSession?: SessionState,
): TransportPrepareResult {
  const meta = node.metadata as WorkflowNodeContextMeta | undefined
  const contract = mergeContract(meta?.archetype, meta?.contract)
  const transport = contract?.transport ?? "auto"
  const consumes = nodeConsumesFiles(node)
  const intent = resolveIntent(node)
  const archetype = readNodeArchetype(node)

  if (archetype === "reviewer" || intent === "review") {
    return { promptSuffix: "", edgeContextMode: "fresh", skipUpstream: true }
  }

  if (intent === "continue" && upstreamSession && !consumes) {
    return { promptSuffix: "", edgeContextMode: "inherit", skipUpstream: false }
  }

  if (intent === "continue" && (transport === "intra" || transport === "auto") && upstreamSession) {
    return { promptSuffix: "", edgeContextMode: "inherit", skipUpstream: false }
  }

  if (intent === "handoff" || transport === "inter" || (transport === "auto" && consumes)) {
    return { promptSuffix: "", edgeContextMode: "artifacts", skipUpstream: false }
  }

  if (!consumes && upstreamSession) {
    return { promptSuffix: "", edgeContextMode: "inherit", skipUpstream: false }
  }

  if (consumes) {
    return { promptSuffix: "", edgeContextMode: intentToContextMode(intent, consumes), skipUpstream: intent === "review" }
  }

  return { promptSuffix: "", edgeContextMode: config.contextMode, skipUpstream: false }
}
