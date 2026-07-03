import type { AgentNodeOutput, TokenUsage } from "../../schema/types.js"
import type { WorkflowRunUsageSummary } from "../types.js"

export function summarizeUsageFromResults(results: Record<string, AgentNodeOutput>): WorkflowRunUsageSummary | undefined {
  const byNode: Record<string, TokenUsage> = {}
  const total: WorkflowRunUsageSummary = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    quotaPercentUsed: 0,
    source: "run-results",
    byNode,
  }
  let hasUsage = false
  for (const [nodeId, result] of Object.entries(results)) {
    if (!result.usage) continue
    hasUsage = true
    byNode[nodeId] = result.usage
    total.inputTokens += result.usage.inputTokens
    total.outputTokens += result.usage.outputTokens
    total.cacheReadTokens += result.usage.cacheReadTokens
    total.cacheWriteTokens += result.usage.cacheWriteTokens
    total.reasoningTokens = (total.reasoningTokens ?? 0) + (result.usage.reasoningTokens ?? 0)
    total.totalTokens += result.usage.totalTokens
    total.costUsd = (total.costUsd ?? 0) + (result.usage.costUsd ?? 0)
    total.quotaPercentUsed = Math.max(total.quotaPercentUsed ?? 0, result.usage.quotaPercentUsed ?? 0)
  }
  return hasUsage ? total : undefined
}

export function artifactRefsFromOutput(workspaceKey: string, nodeId: string, result: AgentNodeOutput) {
  return (result.artifacts ?? []).filter((artifact) => artifact.isReference).map((artifact, index) => ({
    nodeId,
    label: artifact.name || `${nodeId}-${index + 1}`,
    kind: artifact.mime.startsWith("text/markdown") ? "markdown" as const
      : artifact.mime.startsWith("application/pdf") ? "pdf" as const
        : artifact.mime.startsWith("image/") ? "image" as const
          : "other" as const,
    path: artifact.content.startsWith("/workflow-output/")
      ? artifact.content.replace(/^\/workflow-output\/(?:workflow\/[^/]+\/|runs\/[^/]+\/)?/, "")
      : artifact.content,
    href: artifact.content.startsWith("/") ? artifact.content : `/workflow-output/workflow/${workspaceKey}/${artifact.content.replace(/^\.?\//, "")}`,
  }))
}
