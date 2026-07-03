import type { WorkflowGraph, WorkflowNode } from "../../schema/types.js"
import { mergeContract } from "./archetypes.js"
import type { WorkflowNodeContextMeta } from "./types.js"

export interface ConsumedCatalog {
  keys: Set<string>
  paths: Set<string>
}

function normPath(p: string) {
  return p.replace(/^\/+/, "").replace(/\\/g, "/")
}

export function computeConsumedKeys(graph: WorkflowGraph): ConsumedCatalog {
  const keys = new Set<string>()
  const paths = new Set<string>()
  for (const node of graph.nodes) {
    const meta = node.metadata as WorkflowNodeContextMeta | undefined
    const contract = mergeContract(meta?.archetype, meta?.contract)
    for (const input of contract?.inputs ?? []) {
      const key = input.from.includes(":") ? input.from.split(":")[1]! : input.from
      keys.add(key)
      paths.add(normPath(key))
    }
    for (const rf of meta?.readRunFiles ?? []) paths.add(normPath(rf))
  }
  return { keys, paths }
}

/** True when any downstream node declares it needs this producer output. */
export function missingOutputBlocksRun(
  graph: WorkflowGraph,
  producerNodeId: string,
  outputKey: string,
  outputPath: string,
): boolean {
  const base = normPath(outputPath).split("/").pop() ?? outputPath
  for (const node of graph.nodes) {
    if (node.id === producerNodeId) continue
    const meta = node.metadata as WorkflowNodeContextMeta | undefined
    const contract = mergeContract(meta?.archetype, meta?.contract)
    for (const input of contract?.inputs ?? []) {
      if (input.from === `${producerNodeId}:${outputKey}`) return true
      if (input.from === outputKey) return true
      if (input.required && input.from.endsWith(`:${outputKey}`)) return true
    }
    for (const rf of meta?.readRunFiles ?? []) {
      const n = normPath(rf)
      if (n === normPath(outputPath) || n === base || n.endsWith(`/${base}`)) return true
    }
  }
  return false
}

export function blockingMissing(
  graph: WorkflowGraph,
  producerNodeId: string,
  missing: Array<{ key: string; path: string }>,
): Array<{ key: string; path: string }> {
  return missing.filter((m) => missingOutputBlocksRun(graph, producerNodeId, m.key, m.path))
}
