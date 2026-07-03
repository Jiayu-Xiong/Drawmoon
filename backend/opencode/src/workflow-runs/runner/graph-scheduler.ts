import type { AgentNodeConfig, AgentNodeOutput, ProviderId, SessionState, WorkflowGraph, WorkflowNode } from "../../schema/types.js"
import type { WorkflowRunNodeState } from "../types.js"
import { toContextMode } from "./coercion.js"

export function allUpstreamCompleted(
  graph: WorkflowGraph,
  nodeId: string,
  nodeStates: Record<string, WorkflowRunNodeState | undefined>,
): boolean {
  const incoming = graph.edges.filter((edge) => edge.to === nodeId)
  if (!incoming.length) return true
  return incoming.every((edge) => nodeStates[edge.from]?.status === "completed")
}

export function executionWaves(graph: WorkflowGraph): WorkflowNode[][] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const inDegree = new Map<string, number>()
  for (const node of graph.nodes) inDegree.set(node.id, 0)
  for (const edge of graph.edges) inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)

  const waves: WorkflowNode[][] = []
  let queue = graph.nodes.filter((node) => (inDegree.get(node.id) ?? 0) === 0)
  while (queue.length) {
    waves.push(queue)
    const next: WorkflowNode[] = []
    for (const node of queue) {
      for (const edge of graph.edges.filter((item) => item.from === node.id)) {
        const degree = (inDegree.get(edge.to) ?? 0) - 1
        inDegree.set(edge.to, degree)
        if (degree === 0) {
          const target = nodesById.get(edge.to)
          if (target) next.push(target)
        }
      }
    }
    queue = next
  }
  return waves.length ? waves : [graph.nodes]
}

export function resolveUpstream(
  graph: WorkflowGraph,
  node: WorkflowNode,
  nodeResults: Map<string, AgentNodeOutput>,
  nodeSessions: Map<string, SessionState>,
) {
  const readRunFiles = (node.metadata as { readRunFiles?: string[] } | undefined)?.readRunFiles
  const incoming = graph.edges.filter((edge) => edge.to === node.id)
  if (!incoming.length) {
    return { upstreamOutput: undefined, upstreamSession: undefined, edgeContextMode: node.config.contextMode }
  }
  if (readRunFiles?.length) {
    return { upstreamOutput: undefined, upstreamSession: undefined, edgeContextMode: "fresh" as const }
  }
  if (incoming.length === 1) {
    const edge = incoming[0]!
    return {
      upstreamOutput: nodeResults.get(edge.from),
      upstreamSession: nodeSessions.get(edge.from),
      edgeContextMode: toContextMode(edge.contextMode ?? node.config.contextMode),
    }
  }
  const edgeMode = toContextMode(incoming[0]?.contextMode ?? "summary")
  const labels = incoming.map((edge) => graph.nodes.find((item) => item.id === edge.from)?.label ?? edge.from)
  const artifacts = incoming.flatMap((edge) => nodeResults.get(edge.from)?.artifacts ?? [])
  const summaries = incoming
    .map((edge) => nodeResults.get(edge.from)?.summary?.trim())
    .filter((value): value is string => Boolean(value))
  const merged: AgentNodeOutput = {
    text: "",
    summary: summaries.length ? summaries.join(" | ") : labels.join(" | "),
    traceId: incoming.map((edge) => nodeResults.get(edge.from)?.traceId).filter(Boolean).join(","),
    cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
    metadata: {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      exitCode: 0,
      cancelled: false,
      timedOut: false,
      iterations: 1,
      provider: node.config.provider,
      providerVersion: null,
    },
    artifacts,
  }
  return {
    upstreamOutput: merged,
    upstreamSession: undefined,
    edgeContextMode: edgeMode,
  }
}

export function orderNodes(graph: WorkflowGraph): WorkflowNode[] {
  const inDegree = new Map<string, number>()
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  for (const node of graph.nodes) inDegree.set(node.id, 0)
  for (const edge of graph.edges) inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)

  const queue = graph.nodes.filter((node) => (inDegree.get(node.id) ?? 0) === 0)
  const ordered: WorkflowNode[] = []
  while (queue.length > 0) {
    const node = queue.shift()!
    ordered.push(node)
    for (const edge of graph.edges.filter((item) => item.from === node.id)) {
      const next = (inDegree.get(edge.to) ?? 0) - 1
      inDegree.set(edge.to, next)
      if (next === 0) {
        const target = nodesById.get(edge.to)
        if (target) queue.push(target)
      }
    }
  }
  return ordered.length === graph.nodes.length ? ordered : graph.nodes
}
