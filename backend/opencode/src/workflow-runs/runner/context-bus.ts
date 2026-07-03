import type { AgentNodeConfig } from "../../schema/types.js"
import type { WorkflowGraph, WorkflowNode } from "../../schema/types.js"
import { Blackboard, enrichNodeWithContext } from "../context/index.js"

/** Enrich node prompt with contract inputs / legacy readRunFiles via blackboard resolver. */
export function enrichNodeConfig(
  node: WorkflowNode,
  config: AgentNodeConfig,
  outputDir: string,
  graph?: WorkflowGraph,
  upstreamSession?: import("../../schema/types.js").SessionState,
  runId?: string,
): AgentNodeConfig {
  const blackboard = new Blackboard(outputDir)
  return enrichNodeWithContext(node, config, outputDir, blackboard, graph, upstreamSession, runId)
}
