import type { LocalCliInfo } from "../api"
import { startCliInfoRefresh } from "../api/runtime-api"
import type { WorkflowNode, WorkflowTemplate } from "./console-model"
import { readExecutorId, readLlmId } from "./executor-binding-ids"
import { cliProviderForAgentMode, isDirectLlmAgentMode, resolveExecutorBinding, resolveModelSource } from "./node-executor-binding"
import { getAgentModeTemplate, getCliTemplate, getLlmApiTemplate } from "./template-registry"
import { listLlmApiOptionsForNode } from "./node-llm-binding"
import { listLlmApiTemplates } from "./llm-api-templates"

export type BindingIssueKind =
  | "missing-executor"
  | "missing-cli"
  | "cli-offline"
  | "missing-llm"
  | "missing-skill"
  | "missing-mcp"
  | "probe-pending"
  | "probe-failed"

export interface BindingIssue {
  kind: BindingIssueKind
  message: string
}

export interface NodeBindingHealth {
  nodeId: string
  ok: boolean
  issues: BindingIssue[]
}

const probeCache = new Map<string, Promise<boolean>>()
const probeResults = new Map<string, boolean>()

function collectToolIds(node: WorkflowNode): { skills: string[]; mcp: string[] } {
  const tc = node.toolConstraints
  const skills = [...(tc?.forcedSkills ?? []), ...(tc?.allowedSkills ?? [])]
  const mcp = [...(tc?.forcedMcpServers ?? []), ...(tc?.allowedMcpServers ?? [])]
  return { skills: [...new Set(skills)], mcp: [...new Set(mcp)] }
}

function syncIssues(
  node: WorkflowNode,
  template: WorkflowTemplate,
  library?: { skills: Set<string>; mcp: Set<string> },
): BindingIssue[] {
  const issues: BindingIssue[] = []
  const executionMode = node.executionMode ?? "agent-mode"
  if (executionMode === "human-gate" || executionMode === "inquiry" || executionMode === "tool") return issues

  const executorId = readExecutorId(node)
  if (!executorId) {
    issues.push({ kind: "missing-executor", message: "Agent mode ID missing" })
    return issues
  }

  const mode = getAgentModeTemplate(executorId)
  if (!mode) {
    issues.push({ kind: "missing-executor", message: `Agent mode not found: ${executorId}` })
    return issues
  }

  const modelSource = resolveModelSource(node, template, mode)
  if (modelSource === "llm-api") {
    const llmId = readLlmId(node) ?? template.defaultLlmApiTemplateId
    if (!llmId || !getLlmApiTemplate(llmId)) {
      const allowed = listLlmApiOptionsForNode(node, template, listLlmApiTemplates())
      if (!allowed.some((a) => a.id === llmId)) {
        issues.push({ kind: "missing-llm", message: llmId ? `LLM API not found: ${llmId}` : "LLM API ID missing" })
      }
    }
    const cliId = mode.cliTemplateId
    if (cliId && !getCliTemplate(cliId) && !isDirectLlmAgentMode(executorId)) {
      issues.push({ kind: "missing-cli", message: `CLI template not found: ${cliId}` })
    }
  } else if (modelSource === "cli-native") {
    const binding = resolveExecutorBinding(node, template)
    const cliId = binding.cliTemplateId ?? mode.cliTemplateId
    if (!cliId || !getCliTemplate(cliId)) {
      issues.push({ kind: "missing-cli", message: cliId ? `CLI template not found: ${cliId}` : "CLI template ID missing" })
    }
  }

  if (library) {
    const { skills, mcp } = collectToolIds(node)
    for (const id of skills) {
      if (!library.skills.has(id)) issues.push({ kind: "missing-skill", message: `Skill not in library: ${id}` })
    }
    for (const id of mcp) {
      if (!library.mcp.has(id)) issues.push({ kind: "missing-mcp", message: `MCP not in library: ${id}` })
    }
  }

  return issues
}

function cliAccessible(executorId: string, cliInfo?: LocalCliInfo | null): BindingIssue | null {
  const provider = cliProviderForAgentMode(executorId)
  if (!provider || provider === "direct-api") return null
  const mode = getAgentModeTemplate(executorId)
  const cliId = mode?.cliTemplateId
  const cli = cliId ? getCliTemplate(cliId) : undefined
  if (!cli?.startupCommand) return null
  const live = cliInfo?.liveSnapshots?.find((s) => s.cliTemplateId === cliId || s.providerId === provider)
  if (!live) return { kind: "probe-pending", message: `CLI status unknown: ${cli.name}` }
  if (live.status === "offline") return { kind: "cli-offline", message: `${cli.name} offline` }
  return null
}

/** One async probe per agent mode ID (no auto-refresh on editor open — call probeAgentModes explicitly). */
export async function probeAgentMode(executorId: string, cliInfo?: LocalCliInfo | null): Promise<boolean> {
  if (probeResults.has(executorId)) return probeResults.get(executorId)!
  const existing = probeCache.get(executorId)
  if (existing) return existing

  const promise = (async () => {
    const provider = cliProviderForAgentMode(executorId)
    if (!provider || provider === "direct-api") {
      probeResults.set(executorId, true)
      return true
    }
    const mode = getAgentModeTemplate(executorId)
    if (!mode?.cliTemplateId) {
      probeResults.set(executorId, true)
      return true
    }
    const cli = getCliTemplate(mode.cliTemplateId)
    if (!cli?.startupCommand?.trim()) {
      probeResults.set(executorId, true)
      return true
    }
  const offline = cliAccessible(executorId, cliInfo)
    if (offline?.kind === "cli-offline") {
      probeResults.set(executorId, false)
      return false
    }
    try {
      await startCliInfoRefresh(provider as "opencode" | "kiro" | "codex" | "copilot")
    } catch {
      probeResults.set(executorId, false)
      return false
    }
    probeResults.set(executorId, true)
    return true
  })()

  probeCache.set(executorId, promise)
  return promise
}

export async function probeAgentModes(
  executorIds: Iterable<string>,
  cliInfo?: LocalCliInfo | null,
): Promise<Map<string, boolean>> {
  const unique = [...new Set(executorIds)]
  const results = new Map<string, boolean>()
  await Promise.all(unique.map(async (id) => {
    results.set(id, await probeAgentMode(id, cliInfo))
  }))
  return results
}

export function clearBindingProbeCache() {
  probeCache.clear()
  probeResults.clear()
}

export function assessNodeBinding(
  node: WorkflowNode,
  template: WorkflowTemplate,
  options?: {
    library?: { skills: Set<string>; mcp: Set<string> }
    cliInfo?: LocalCliInfo | null
    probeResults?: Map<string, boolean>
  },
): NodeBindingHealth {
  const issues = syncIssues(node, template, options?.library)
  const executorId = readExecutorId(node)
  if (executorId) {
    const cliIssue = cliAccessible(executorId, options?.cliInfo)
    if (cliIssue) issues.push(cliIssue)
    const probed = options?.probeResults?.get(executorId)
    if (probed === false) issues.push({ kind: "probe-failed", message: `CLI probe failed: ${executorId}` })
    if (probed === undefined && cliIssue?.kind === "probe-pending") {
      /* keep probe-pending */
    }
  }
  return { nodeId: node.id, ok: issues.length === 0, issues }
}

export function assessTemplateBindings(
  template: WorkflowTemplate,
  options?: Parameters<typeof assessNodeBinding>[2],
): NodeBindingHealth[] {
  return template.nodes.map((node) => assessNodeBinding(node, template, options))
}

export function templateBindingsReady(
  template: WorkflowTemplate,
  options?: Parameters<typeof assessNodeBinding>[2],
): boolean {
  return assessTemplateBindings(template, options).every((h) => h.ok)
}

export function involvedExecutorIds(template: WorkflowTemplate): string[] {
  const ids = new Set<string>()
  for (const node of template.nodes) {
    const id = readExecutorId(node)
    if (id) ids.add(id)
  }
  return [...ids]
}
