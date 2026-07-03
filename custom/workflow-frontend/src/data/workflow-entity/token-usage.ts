import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../api"

import type { TokenUsageSnapshot, WorkflowTemplate } from "../console-model"



function estimateTokens(text: string) {

  return Math.ceil(text.length / 4)

}



type NodeUsage = NonNullable<RuntimeWorkflowRunRecord["nodeResults"][string]["usage"]>



function sumNodeUsages(usages: NodeUsage[]): TokenUsageSnapshot | undefined {

  if (!usages.length) return undefined

  const total = usages.reduce(

    (acc, usage) => ({

      inputTokens: acc.inputTokens + usage.inputTokens,

      outputTokens: acc.outputTokens + usage.outputTokens,

      cacheReadTokens: acc.cacheReadTokens + usage.cacheReadTokens,

      cacheWriteTokens: acc.cacheWriteTokens + usage.cacheWriteTokens,

      reasoningTokens: (acc.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0),

      totalTokens: acc.totalTokens + usage.totalTokens,

      costUsd: (acc.costUsd ?? 0) + (usage.costUsd ?? 0),

    }),

    {

      inputTokens: 0,

      outputTokens: 0,

      cacheReadTokens: 0,

      cacheWriteTokens: 0,

      reasoningTokens: 0,

      totalTokens: 0,

      costUsd: 0,

    },

  )

  if (!total.totalTokens) return undefined

  return {

    ...total,

    source: "run-results",

    updatedAt: undefined,

  }

}



export function tokenUsageFromOpencodeTelemetry(telemetry?: {

  available?: boolean

  periods?: {

    today?: {

      totalTokens?: number

      inputTokens?: number

      outputTokens?: number

      cacheReadTokens?: number

      cacheWriteTokens?: number

      reasoningTokens?: number

      costUsd?: number

    }

    month?: {

      totalTokens?: number

      inputTokens?: number

      outputTokens?: number

      cacheReadTokens?: number

      cacheWriteTokens?: number

      reasoningTokens?: number

      costUsd?: number

    }

  }

  lastActivityAt?: string | null

}): TokenUsageSnapshot | undefined {

  if (!telemetry?.available) return undefined

  const period = telemetry.periods?.today ?? telemetry.periods?.month

  if (!period?.totalTokens) return undefined

  return {

    totalTokens: period.totalTokens,

    inputTokens: period.inputTokens ?? 0,

    outputTokens: period.outputTokens ?? 0,

    cacheReadTokens: period.cacheReadTokens ?? 0,

    cacheWriteTokens: period.cacheWriteTokens ?? 0,

    reasoningTokens: period.reasoningTokens,

    costUsd: period.costUsd,

    source: "opencode-telemetry",

    updatedAt: telemetry.lastActivityAt ?? undefined,

  }

}



export function tokenUsageFromRun(

  run: RuntimeWorkflowRunRecord,

  template: WorkflowTemplate,

): TokenUsageSnapshot | undefined {

  const reported = run.history?.usage

  if (reported) {

    return {

      totalTokens: reported.totalTokens,

      inputTokens: reported.inputTokens,

      outputTokens: reported.outputTokens,

      cacheReadTokens: reported.cacheReadTokens,

      cacheWriteTokens: reported.cacheWriteTokens,

      reasoningTokens: reported.reasoningTokens,

      costUsd: reported.costUsd,

      quotaPercentUsed: reported.quotaPercentUsed,

      source: reported.source === "opencode-telemetry" || reported.source === "estimated" ? reported.source : "run-results",

      updatedAt: run.updatedAt,

    }

  }



  const nodeUsages = Object.values(run.nodeResults ?? {})

    .map((result) => result.usage)

    .filter((usage): usage is NodeUsage => Boolean(usage?.totalTokens))

  const fromNodeResults = sumNodeUsages(nodeUsages)

  if (fromNodeResults) {

    return { ...fromNodeResults, updatedAt: run.updatedAt }

  }



  const outputs = Object.values(run.history?.nodeOutputs ?? {})

  const nodeResults = Object.values(run.nodeResults ?? {})

  if (!outputs.length && !nodeResults.length) return undefined



  let inputTokens = 0

  let outputTokens = 0

  let totalTokens = 0



  for (const [nodeId, result] of Object.entries(run.nodeResults ?? {})) {

    const text = result.text ?? ""

    const summary = result.summary ?? ""

    const out = estimateTokens(text || summary)

    const prompt = template.nodes.find((n) => n.id === nodeId)?.promptPreview ?? ""

    const inp = estimateTokens(prompt)

    inputTokens += inp

    outputTokens += out

    totalTokens += inp + out

  }



  if (!totalTokens && outputs.length) {

    outputTokens = outputs.reduce((sum, text) => sum + estimateTokens(text), 0)

    totalTokens = outputTokens

  }



  if (!totalTokens) return undefined



  return {

    totalTokens,

    inputTokens,

    outputTokens,

    cacheReadTokens: 0,

    cacheWriteTokens: 0,

    source: "estimated",

    updatedAt: run.updatedAt,

  }

}



let cachedOpencodeTelemetry: Parameters<typeof tokenUsageFromOpencodeTelemetry>[0]



export function setOpencodeTelemetryCache(telemetry: Parameters<typeof tokenUsageFromOpencodeTelemetry>[0]) {

  cachedOpencodeTelemetry = telemetry

}



export function resolveEntityTokenUsage(

  run: RuntimeWorkflowRunRecord,

  template: WorkflowTemplate,

): TokenUsageSnapshot | undefined {

  const fromRun = tokenUsageFromRun(run, template)

  if (fromRun && fromRun.source !== "estimated") return fromRun

  if (fromRun?.source === "estimated" && fromRun.totalTokens > 0) return fromRun



  const usesOpencode = template.nodes.some((node) => node.cliTemplateId === "opencode-cli" || node.agentModeTemplateId?.startsWith("opencode"))

  if (!usesOpencode) return fromRun



  const telemetry = tokenUsageFromOpencodeTelemetry(cachedOpencodeTelemetry)

  if (fromRun && telemetry) {

    return {

      ...fromRun,

      cacheReadTokens: fromRun.cacheReadTokens || telemetry.cacheReadTokens,

      cacheWriteTokens: fromRun.cacheWriteTokens || telemetry.cacheWriteTokens,

      reasoningTokens: fromRun.reasoningTokens ?? telemetry.reasoningTokens,

      costUsd: fromRun.costUsd ?? telemetry.costUsd,

      source: "estimated",

      updatedAt: fromRun.updatedAt ?? telemetry.updatedAt,

    }

  }

  return fromRun ?? telemetry

}

