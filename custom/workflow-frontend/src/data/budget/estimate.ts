import type { BudgetEstimate, CliBudgetPolicy, CliLiveSnapshot, WorkflowNode, WorkflowTemplate } from "../console-model"

const OUTPUT_MULTIPLIER = 3

function estimateNodeTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4) * OUTPUT_MULTIPLIER
}

export function estimateWorkflowBudget(
  template: Pick<WorkflowTemplate, "nodes" | "budgetPolicies">,
  snapshots: CliLiveSnapshot[],
): BudgetEstimate[] {
  const byCli = new Map<string, { tokens: number; hours: number; usd: number; contextRatios: number[]; warnings: string[] }>()

  for (const node of template.nodes) {
    const cliId = node.cliTemplateId
    if (!cliId) continue
    const entry = byCli.get(cliId) ?? { tokens: 0, hours: 0, usd: 0, contextRatios: [], warnings: [] }
    entry.tokens += estimateNodeTokens(node.promptPreview ?? "")
    entry.hours += (node.runtimeOverrides?.timeoutMs ?? 240_000) / 3_600_000
    const snapshot = snapshots.find((s) => s.cliTemplateId === cliId)
    const modelId = node.runtimeOverrides?.model
    const modelCap = snapshot?.models.find((m) => m.id === modelId) ?? snapshot?.models[0]
    if (modelCap?.contextWindow) {
      const promptTokens = Math.ceil((node.promptPreview ?? "").length / 4)
      entry.contextRatios.push(promptTokens / modelCap.contextWindow)
    }
    if (modelCap && !modelCap.contextWindow) {
      entry.warnings.push(`Model ${modelCap.name} has no reported context window`)
    }
    if (modelCap?.costMultiplier) {
      entry.usd += (estimateNodeTokens(node.promptPreview ?? "") / 1000) * 0.002 * modelCap.costMultiplier
    }
    byCli.set(cliId, entry)
  }

  const policies = template.budgetPolicies ?? []
  const results: BudgetEstimate[] = []

  for (const [cliTemplateId, usage] of byCli) {
    const policy = policies.find((p) => p.cliTemplateId === cliTemplateId)
    const snapshot = snapshots.find((s) => s.cliTemplateId === cliTemplateId)
    const warnings = [...usage.warnings]
    let blocked = false
    let blockReason: string | undefined

    const maxContextRatio = usage.contextRatios.length ? Math.max(...usage.contextRatios) : undefined
    const comfortRatio = policy?.minContextComfortRatio ?? 0.7
    if (maxContextRatio !== undefined && maxContextRatio > comfortRatio) {
      warnings.push(`Prompt may exceed ${Math.round(comfortRatio * 100)}% of model context`)
      blocked = true
      blockReason = `Context usage ~${Math.round(maxContextRatio * 100)}% exceeds comfort ratio`
    }

    if (policy?.maxTokensPerRun && usage.tokens > policy.maxTokensPerRun) {
      blocked = true
      blockReason = `Estimated ${usage.tokens} tokens exceeds limit ${policy.maxTokensPerRun}`
    }
    if (policy?.maxUsdPerRun && usage.usd > policy.maxUsdPerRun) {
      blocked = true
      blockReason = `Estimated $${usage.usd.toFixed(2)} exceeds limit $${policy.maxUsdPerRun}`
    }
    if (policy?.maxHoursPerRun && usage.hours > policy.maxHoursPerRun) {
      blocked = true
      blockReason = `Estimated ${usage.hours.toFixed(1)}h exceeds limit ${policy.maxHoursPerRun}h`
    }

    if (snapshot?.quota.windows?.length && policy?.reservePercent) {
      const weekly = snapshot.quota.windows.find((w) => w.kind === "weekly")
      if (weekly?.remainingPercent != null && weekly.remainingPercent < policy.reservePercent) {
        blocked = true
        blockReason = `CLI quota remaining ${weekly.remainingPercent}% below reserve ${policy.reservePercent}%`
      }
    }

    const telemetry = snapshot?.telemetry
    if (telemetry?.available) {
      const monthTokens = telemetry.periods.month?.totalTokens
      const monthCost = telemetry.periods.month?.costUsd
      if (monthTokens != null) {
        warnings.push(`Month-to-date: ${monthTokens.toLocaleString()} tokens (telemetry)`)
        const tokenWindow = snapshot?.quota.windows?.find((w) => w.kind === "session" || w.kind === "billing")
        if (tokenWindow?.remaining != null && usage.tokens > tokenWindow.remaining) {
          blocked = true
          blockReason = `Estimated ${usage.tokens} tokens exceeds remaining ${tokenWindow.remaining}`
        }
      }
      if (monthCost != null) {
        warnings.push(`Month-to-date cost: $${monthCost.toFixed(4)} (telemetry)`)
        if (policy?.maxUsdPerRun && usage.usd > 0 && monthCost + usage.usd > policy.maxUsdPerRun * 4) {
          warnings.push("Run cost plus month-to-date spend may exceed monthly comfort budget")
        }
      }
    }

    results.push({
      cliTemplateId,
      estimatedTokens: usage.tokens,
      estimatedUsd: usage.usd,
      estimatedHours: usage.hours,
      contextUsageRatio: maxContextRatio,
      warnings,
      blocked,
      blockReason,
    })
  }

  return results
}

export function anyBudgetBlocked(estimates: BudgetEstimate[]): BudgetEstimate | undefined {
  return estimates.find((e) => e.blocked)
}

export type { CliBudgetPolicy }
