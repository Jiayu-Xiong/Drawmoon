import type { WorkflowGraph, WorkflowNode } from "../../schema/types.js"
import type { Blackboard } from "./blackboard.js"
import { resolveWorkspaceFile } from "./resolver.js"
import { mergeContract } from "./archetypes.js"
import type { WorkflowNodeContextMeta } from "./types.js"

export function nodeInputReady(
  workspaceDir: string,
  node: WorkflowNode,
  blackboard: Blackboard,
): { ready: boolean; reason?: string } {
  const meta = node.metadata as WorkflowNodeContextMeta | undefined
  const contract = mergeContract(meta?.archetype, meta?.contract)

  for (const input of contract?.inputs ?? []) {
    if (!input.required) continue
    const key = input.from.includes(":") ? input.from.split(":")[1]! : input.from
    const path = blackboard.get(key)?.path ?? key
    const resolved = resolveWorkspaceFile(workspaceDir, path, blackboard)
    if (!resolved.exists) {
      return { ready: false, reason: `missing required input: ${key}` }
    }
  }
  return { ready: true }
}

export function collectDownstream(graph: WorkflowGraph, nodeId: string): string[] {
  const out: string[] = []
  const queue = graph.edges.filter((e) => e.from === nodeId).map((e) => e.to)
  while (queue.length) {
    const id = queue.shift()!
    if (out.includes(id)) continue
    out.push(id)
    queue.push(...graph.edges.filter((e) => e.from === id).map((e) => e.to))
  }
  return out
}
