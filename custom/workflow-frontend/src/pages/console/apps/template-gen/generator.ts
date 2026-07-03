import type { AgentModeTemplate, LlmApiTemplate } from "../../../../data/console-model"
import { listCliTemplates } from "../../../../data/cli-templates"

export { buildTemplateGeneratorPrompt, buildTemplateModifierPrompt } from "./spec"

export function slugifyTemplateId(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return cleaned || `generated-${Date.now()}`
}

export function buildTemplateGeneratorConfig(
  agentMode: AgentModeTemplate,
  llmApi: LlmApiTemplate,
  prompt: string,
) {
  const cli = agentMode.cliTemplateId
    ? listCliTemplates().find((item) => item.id === agentMode.cliTemplateId)
    : undefined
  const provider = cli?.providerId ?? llmApi.provider ?? agentMode.provider
  return {
    provider,
    mode: agentMode.mode,
    cwd: ".",
    prompt,
    contextMode: "fresh" as const,
    maxIterations: Math.min(agentMode.maxIterations ?? 8, 8),
    timeoutMs: agentMode.timeoutMs ?? 600_000,
    allowFileWrites: false, // template-gen LLM must not touch disk; host validates + saves JSON
    model: llmApi.model,
    llmApi: {
      id: llmApi.id,
      endpoint: llmApi.endpoint,
      protocol: llmApi.wireProtocol ?? llmApi.protocol,
      model: llmApi.model,
      apiKeyEnv: llmApi.apiKeyEnv,
      timeoutMs: llmApi.timeoutMs,
      responseFormat: "json",
    },
  }
}

export function extractWorkflowTemplateJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  const tryParse = (value: string) => JSON.parse(value) as Record<string, unknown>
  try {
    return tryParse(trimmed)
  } catch {
    // continue
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return tryParse(fenced[1].trim())
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) return tryParse(trimmed.slice(start, end + 1))
  throw new Error("Agent output does not contain workflow template JSON")
}

export function formatValidationMessage(result: {
  ok: boolean
  errors: string[]
  warnings: string[]
  stats?: { nodeCount: number; edgeCount: number; maxDepth: number }
}) {
  const lines: string[] = []
  if (result.ok) lines.push("Validation passed (0 token).")
  else lines.push("Validation failed:")
  for (const error of result.errors) lines.push(`  • ${error}`)
  if (result.warnings.length) {
    lines.push("Warnings:")
    for (const warning of result.warnings) lines.push(`  • ${warning}`)
  }
  if (result.stats) {
    lines.push(
      `Stats: ${result.stats.nodeCount} nodes, ${result.stats.edgeCount} edges, depth ${result.stats.maxDepth}`,
    )
  }
  return lines.join("\n")
}
