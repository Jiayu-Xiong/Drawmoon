import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../../../api"
import type { ContextMode, NodeState, WorkflowEdge, WorkflowTemplate } from "../../../../data/console-model"
import { resolveNodeLlmBinding } from "../../../../data/node-llm-binding"
import { getAgentModeTemplate } from "../../../../data/template-registry"
import { resolveNodeToolConstraints } from "../../../../data/tool-constraints"
import type { TokenUsageByNodeEntry } from "../../../../components/TokenUsageByNodeTable"
import type { WorkflowInstanceItem } from "./instance-utils"
import { isImageArtifact, isPreviewableArtifact, type DisplayArtifact } from "./workflow-artifact-preview"

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

function withRunId(href: string, runId: string) {
  if (!runId || /[?&]runId=/.test(href)) return href
  const separator = href.includes("?") ? "&" : "?"
  return `${href}${separator}runId=${encodeURIComponent(runId)}`
}

function artifactDepth(href: string) {
  return href.split("/").filter(Boolean).length
}

function canonicalTemplatePaths(template: WorkflowTemplate | undefined, nodeId: string) {
  const uiNode = template?.nodes.find((node) => node.id === nodeId)
  const byBase = new Map<string, string>()
  for (const artifact of uiNode?.artifacts ?? []) {
    const path = (artifact.path ?? artifact.href ?? "").replace(/\\/g, "/")
    if (!path) continue
    const base = path.split("/").pop() ?? path
    const existing = byBase.get(base)
    if (!existing || path.length > existing.length) byBase.set(base, path)
  }
  return byBase
}

function remapArtifactRef(
  run: RuntimeWorkflowRunRecord,
  nodeId: string,
  ref: string,
  label?: string,
  kind?: string,
  template?: WorkflowTemplate,
): DisplayArtifact | null {
  const trimmed = ref.trim()
  if (!trimmed) return null
  const pathPart = trimmed.startsWith("/workflow-output/")
    ? trimmed.replace(/^\/workflow-output\/(?:workflow\/[^/]+\/|runs\/[^/]+\/)?/, "")
    : trimmed.replace(/^\.?\//, "").replace(/\\/g, "/")
  const base = pathPart.split("/").pop() ?? pathPart
  const canonical = canonicalTemplatePaths(template, nodeId).get(base)
  const preferred = canonical && artifactDepth(canonical) > artifactDepth(pathPart) ? canonical : pathPart
  return artifactFromRef(run, nodeId, preferred, label ?? base, kind)
}

function artifactFromRef(
  run: RuntimeWorkflowRunRecord,
  nodeId: string,
  ref: string,
  label?: string,
  kind?: string,
): DisplayArtifact | null {
  const trimmed = ref.trim()
  if (!trimmed) return null
  const resolved = trimmed.startsWith("/")
    ? trimmed
    : resolveArtifactHref(run, trimmed)
  const href = withRunId(resolved, run.id)
  const name = label ?? trimmed.split("/").pop() ?? trimmed
  const resolvedKind = kind
    ?? (isImageArtifact({ href, kind: "", label: name }) ? "image" : name.split(".").pop() ?? "other")
  return { label: name, href, kind: resolvedKind, nodeId }
}

export function resolveArtifactHref(run: RuntimeWorkflowRunRecord, relativePath: string): string {
  const clean = relativePath.replace(/^\.?\//, "").replace(/\\/g, "/")
  if (clean.startsWith("workflow/")) {
    return `/workflow-output/${clean}`
  }
  const workspaceKey = run.history?.workingDirectoryKey
  if (workspaceKey) {
    const fileName = clean.replace(/^workflow\/[^/]+\//, "")
    return `/workflow-output/workflow/${workspaceKey}/${fileName}`
  }
  return `/workflow-output/runs/${run.id}/${clean}`
}

export function resolvePlannerInquiryDisplay(
  run: RuntimeWorkflowRunRecord | null | undefined,
  template: WorkflowTemplate | undefined,
  activeNodeId: string | null,
): { href: string; markdown?: string; fileName: string } | null {
  if (!run || !activeNodeId) return null
  const uiNode = template?.nodes.find((node) => node.id === activeNodeId)
  const questionsFile = uiNode?.runtimeOverrides?.inquiryQuestionsFile?.trim() || "planner-inquiry-questions.md"
  const href = withRunId(resolveArtifactHref(run, questionsFile), run.id)
  const metaText = run.nodeResults?.[activeNodeId]?.metadata?.inquiryQuestionsText
  if (typeof metaText === "string" && metaText.trim()) {
    return { href, markdown: metaText.trim(), fileName: questionsFile }
  }
  return { href, fileName: questionsFile }
}

export function contextModeLabel(mode: string | undefined, t: TranslateFn) {
  const key = mode ?? "inherit"
  const map: Record<string, string> = {
    fork: "context.fork",
    artifacts: "context.artifacts",
    summary: "context.summary",
    inherit: "context.inherit",
    fresh: "context.fresh",
  }
  return t(map[key] ?? key)
}

export function contextModeDetail(mode: string | undefined, t: TranslateFn) {
  const key = mode ?? "inherit"
  const map: Record<string, string> = {
    fork: "context.forkDetail",
    artifacts: "context.artifactsDetail",
    summary: "context.summaryDetail",
    inherit: "context.inheritDetail",
    fresh: "context.freshDetail",
  }
  return t(map[key] ?? "run.contextDefault")
}

export function artifactsForNode(
  run: RuntimeWorkflowRunRecord,
  nodeId: string,
  template?: WorkflowTemplate,
): DisplayArtifact[] {
  const items: DisplayArtifact[] = []
  const uiNode = template?.nodes.find((node) => node.id === nodeId)

  for (const artifact of uiNode?.artifacts ?? []) {
    const ref = artifact.path ?? artifact.href ?? ""
    const mapped = remapArtifactRef(run, nodeId, ref, artifact.label, artifact.kind, template)
    if (mapped) items.push(mapped)
  }

  for (const item of run.history?.artifacts ?? []) {
    if (item.nodeId !== nodeId) continue
    const mapped = remapArtifactRef(run, nodeId, item.href || item.path, item.label, item.kind, template)
    if (mapped) items.push(mapped)
  }

  const result = run.nodeResults?.[nodeId]
  for (const artifact of result?.artifacts ?? []) {
    const mapped = remapArtifactRef(
      run,
      nodeId,
      String(artifact.content ?? artifact.name ?? ""),
      String(artifact.name ?? ""),
      String(artifact.mime ?? "").startsWith("image/") ? "image" : undefined,
      template,
    )
    if (mapped) items.push(mapped)
  }

  const rtNode = run.graph.nodes.find((node) => node.id === nodeId)
  const meta = (rtNode?.action as { metadata?: { outputFile?: string } } | undefined)?.metadata
    ?? (rtNode?.config as { metadata?: { outputFile?: string } } | undefined)?.metadata
  const templateBases = new Set([...canonicalTemplatePaths(template, nodeId).keys()])
  const outputFile = result?.metadata?.outputFile ?? meta?.outputFile
  if (outputFile) {
    const base = outputFile.split("/").pop() ?? outputFile
    if (!templateBases.has(base)) {
      const mapped = remapArtifactRef(run, nodeId, outputFile, outputFile, "markdown", template)
      if (mapped) items.push(mapped)
    }
  }

  if ((uiNode?.executionMode === "human-gate" || uiNode?.executionMode === "inquiry") && template) {
    for (const edge of template.edges.filter((item) => item.to === nodeId)) {
      for (const upstream of artifactsForNode(run, edge.from, template)) {
        items.push(upstream)
      }
    }
  }

  const byHref = new Map<string, DisplayArtifact>()
  for (const item of items) {
    const existing = byHref.get(item.href)
    if (!existing || artifactDepth(item.href) > artifactDepth(existing.href)) {
      byHref.set(item.href, item)
    }
  }
  return [...byHref.values()].sort((a, b) => artifactDepth(b.href) - artifactDepth(a.href))
}

export function allRunArtifacts(run: RuntimeWorkflowRunRecord): DisplayArtifact[] {
  const items: DisplayArtifact[] = []
  const seen = new Set<string>()
  const push = (item: DisplayArtifact | null) => {
    if (!item || seen.has(item.href)) return
    seen.add(item.href)
    items.push(item)
  }
  for (const item of run.history?.artifacts ?? []) {
    push(artifactFromRef(run, item.nodeId, item.href || item.path, item.label, item.kind))
  }
  for (const [nodeId, result] of Object.entries(run.nodeResults ?? {})) {
    for (const artifact of result.artifacts ?? []) {
      push(artifactFromRef(
        run,
        nodeId,
        String(artifact.content ?? ""),
        String(artifact.name ?? ""),
        String(artifact.mime ?? "").startsWith("image/") ? "image" : undefined,
      ))
    }
    const outputFile = result.metadata?.outputFile
    if (outputFile) push(artifactFromRef(run, nodeId, outputFile, outputFile, "markdown"))
  }
  return items
}

export function finalOutputCaption(
  run: RuntimeWorkflowRunRecord | null,
  template: WorkflowTemplate,
  t: TranslateFn,
) {
  const completed = run?.completedNodeIds ?? []
  const lastId = completed[completed.length - 1]
  const label = template.nodes.find((node) => node.id === lastId)?.name
    ?? run?.graph.nodes.find((node) => node.id === lastId)?.label
    ?? lastId
    ?? t("run.lastNode")
  return {
    title: t("run.lastNodeReceipt", { label }),
    hint: t("run.lastNodeReceiptHint"),
  }
}

export function formatNodeStatus(status: string) {
  if (status === "completed") return "completed"
  if (status === "running") return "running"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "cancelled"
  if (status === "waiting") return "waiting"
  if (status === "paused") return "paused"
  return status
}

export function mapRuntimeNodeState(status?: string): NodeState {
  if (status === "running") return "running"
  if (status === "completed" || status === "success") return "done"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "failed"
  if (status === "waiting") return "waiting"
  if (status === "queued" || status === "pending") return "queued"
  if (status === "paused") return "paused"
  return "waiting"
}

export function resolveEffectiveNodeStatus(
  nodeId: string,
  run: RuntimeWorkflowRunRecord | null | undefined,
): string {
  if (!run) return "waiting"
  const direct = run.nodeStates?.[nodeId]?.status
  if (direct && direct !== "waiting") return direct
  if (run.completedNodeIds?.includes(nodeId)) return "completed"
  if (run.failedNodeIds?.includes(nodeId)) return "failed"
  if (run.currentNodeIds?.includes(nodeId)) return "running"
  if (run.nodeResults?.[nodeId]) return "completed"
  if (run.history?.nodeOutputs?.[nodeId]?.trim()) return "completed"
  if (direct === "paused") return "paused"
  if (direct) return direct
  const inGraph = run.graph?.nodes?.some((node) => node.id === nodeId)
  if (inGraph && (run.status === "completed" || run.status === "success")) {
    const total = run.graph?.nodes?.length ?? 0
    const done = run.completedNodeIds?.length ?? 0
    if (total > 0 && done >= total) return "completed"
  }
  return "waiting"
}

export type EdgeFlowState = "done" | "active" | "waiting"

export function edgeFlowState(fromStatus?: string, toStatus?: string): EdgeFlowState {
  if (fromStatus === "completed") {
    if (toStatus === "running") return "active"
    if (toStatus === "completed" || toStatus === "failed" || toStatus === "cancelled") return "done"
    return "done"
  }
  if (fromStatus === "running" && toStatus === "running") return "active"
  return "waiting"
}

const EDGE_FLOW_COLORS: Record<EdgeFlowState, string> = {
  done: "#4a9a4d",
  active: "#d4921a",
  waiting: "rgba(109, 127, 138, 0.42)",
}

export function mergeRuntimeRunDetail(
  prev: RuntimeWorkflowRunRecord | undefined,
  next: RuntimeWorkflowRunRecord,
): RuntimeWorkflowRunRecord {
  if (!prev || prev.id !== next.id) return next
  const prevHistory = prev.history
  const nextHistory = next.history
  const history = nextHistory && (
    (nextHistory.artifacts?.length ?? 0) > 0
    || Object.keys(nextHistory.nodeOutputs ?? {}).length > 0
    || nextHistory.finalOutput
    || nextHistory.usage?.totalTokens
  ) ? nextHistory : prevHistory ?? nextHistory

  return {
    ...next,
    graph: (next.graph?.nodes?.length ?? 0) > 0 ? next.graph : prev.graph ?? next.graph,
    nodeStates: { ...prev.nodeStates, ...next.nodeStates },
    nodeResults: { ...prev.nodeResults, ...next.nodeResults },
    nodeSessions: { ...prev.nodeSessions, ...next.nodeSessions },
    currentNodeIds: next.currentNodeIds?.length ? next.currentNodeIds : prev.currentNodeIds,
    completedNodeIds: next.completedNodeIds?.length ? next.completedNodeIds : prev.completedNodeIds,
    failedNodeIds: next.failedNodeIds?.length ? next.failedNodeIds : prev.failedNodeIds,
    history,
  }
}

export function lifecycleNodeStatus(event: { type: string; status?: string }): string | undefined {
  if (event.status) return event.status
  if (event.type === "node_started") return "running"
  if (event.type === "node_completed") return "completed"
  if (event.type === "node_failed") return "failed"
  if (event.type === "node_cancelled") return "cancelled"
  if (event.type === "node_paused") return "paused"
  return undefined
}

export function canvasRunFromListItem(
  item: WorkflowInstanceItem,
  template: WorkflowTemplate,
): RuntimeWorkflowRunRecord {
  const usage = item.tokenUsage
  const stateIds = Object.keys(item.nodeStates ?? {})
  const templateIds = new Set(template.nodes.map((node) => node.id))
  const graphFromStates = stateIds.length > 0 && stateIds.some((id) => !templateIds.has(id))
    ? {
      nodes: stateIds.map((id) => ({
        id,
        label: template.nodes.find((node) => node.id === id)?.name ?? id,
        config: { prompt: template.nodes.find((node) => node.id === id)?.promptPreview ?? "" },
      })),
      edges: template.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        contextMode: edge.contextMode,
      })),
    }
    : {
      nodes: template.nodes.map((node) => ({
        id: node.id,
        label: node.name,
        config: { prompt: node.promptPreview },
      })),
      edges: template.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        contextMode: edge.contextMode,
      })),
    }

  return {
    id: item.id,
    templateId: item.templateId,
    defaultLabel: item.labels[0] ?? item.templateId,
    labels: item.labels,
    name: item.name,
    status: item.status,
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    updatedAt: item.updatedAt,
    finishedAt: item.finishedAt,
    progress: {
      totalNodes: item.totalNodes,
      completedNodes: item.completedNodes,
      failedNodes: 0,
      runningNodes: item.status === "running" ? 1 : 0,
      waitingNodes: Math.max(0, item.totalNodes - item.completedNodes),
      percent: item.progressPercent,
    },
    currentNodeIds: item.currentNodeIds ?? [],
    completedNodeIds: [],
    failedNodeIds: [],
    nodeStates: item.nodeStates ?? {},
    nodeResults: {},
    nodeSessions: {},
    sessionGroups: {},
    graph: graphFromStates,
    history: {
      selectedAgentModes: {},
      usage: usage ? {
        totalTokens: usage.totalTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        reasoningTokens: usage.reasoningTokens,
        byNode: {},
      } : undefined,
    },
    latestEvent: null,
    error: null,
  }
}

export function templateWithRuntimeState(
  template: WorkflowTemplate,
  run: RuntimeWorkflowRunRecord | null,
): WorkflowTemplate {
  if (!run) return template
  const runtimeEdges = (run.graph as { edges?: Array<{ from: string; to: string; contextMode?: ContextMode }> }).edges
  const edgeByKey = new Map((runtimeEdges ?? []).map((e) => [`${e.from}->${e.to}`, e]))
  return {
    ...template,
    nodes: template.nodes.map((node) => ({
      ...node,
      state: mapRuntimeNodeState(resolveEffectiveNodeStatus(node.id, run)),
    })),
    edges: template.edges.map((edge) => {
      const rt = edgeByKey.get(`${edge.from}->${edge.to}`)
      const fromStatus = resolveEffectiveNodeStatus(edge.from, run)
      const toStatus = resolveEffectiveNodeStatus(edge.to, run)
      const flow = edgeFlowState(fromStatus, toStatus)
      return {
        ...edge,
        ...(rt?.contextMode ? { contextMode: rt.contextMode } : {}),
        color: EDGE_FLOW_COLORS[flow],
        annotation: flow === "active" ? "active" : flow === "done" ? "done" : edge.annotation,
      }
    }),
  }
}

export interface EdgeFlowInfo {
  edge: WorkflowEdge
  fromLabel: string
  toLabel: string
  contextMode: string
  contextDetail: string
  sourcePrompt: string
  targetPrompt: string
  sourceOutputPreview: string
  readRunFiles: string[]
  sessionNote: string
  cacheNote: string
}

export function resolveEdgeFlow(
  edge: WorkflowEdge,
  template: WorkflowTemplate,
  run: RuntimeWorkflowRunRecord | null,
  t: TranslateFn,
): EdgeFlowInfo {
  const fromNode = template.nodes.find((n) => n.id === edge.from)
  const toNode = template.nodes.find((n) => n.id === edge.to)
  const runtimeFrom = run?.graph.nodes.find((n) => n.id === edge.from)
  const runtimeTo = run?.graph.nodes.find((n) => n.id === edge.to)
  const mode = edge.contextMode ?? "inherit"
  const sourceOut = run?.history?.nodeOutputs?.[edge.from] ?? run?.nodeResults?.[edge.from]?.text ?? ""
  const meta = (runtimeTo?.action as { metadata?: { readRunFiles?: string[] }; session?: { policy?: string; sessionKey?: string } } | undefined)?.metadata
    ?? (runtimeTo?.config as { metadata?: { readRunFiles?: string[] } } | undefined)?.metadata
  const session = (runtimeTo?.action as { session?: { policy?: string; sessionKey?: string } } | undefined)?.session
    ?? {
      policy: (runtimeTo?.config as { sessionPolicy?: string; sessionKey?: string } | undefined)?.sessionPolicy,
      sessionKey: (runtimeTo?.config as { sessionKey?: string } | undefined)?.sessionKey,
    }
  const readRunFiles = meta?.readRunFiles ?? []
  const targetUsage = run?.history?.usage?.byNode?.[edge.to]
  const cacheRead = targetUsage?.cacheReadTokens ?? 0
  let cacheNote = ""
  if (mode === "fork" && cacheRead > 0) {
    cacheNote = t("run.cacheForkHit", {
      session: session?.sessionKey ?? "shared",
      tokens: cacheRead.toLocaleString(),
    })
  } else if (mode === "fork") {
    cacheNote = t("run.cacheForkPending")
  }

  let sessionNote = ""
  if (session?.policy === "shared") sessionNote = `Shared session · ${session.sessionKey ?? "—"}`
  else if (session?.policy === "fork") sessionNote = `Fork from upstream · ${session.sessionKey ?? "planner session"}`
  else if (session?.policy === "fresh") sessionNote = t("run.sessionFresh")

  return {
    edge,
    fromLabel: fromNode?.name ?? edge.from,
    toLabel: toNode?.name ?? edge.to,
    contextMode: contextModeLabel(mode, t),
    contextDetail: contextModeDetail(mode, t),
    sourcePrompt: String(runtimeFrom?.config?.prompt ?? fromNode?.promptPreview ?? ""),
    targetPrompt: String(runtimeTo?.config?.prompt ?? toNode?.promptPreview ?? ""),
    sourceOutputPreview: sourceOut.slice(0, 1200),
    readRunFiles,
    sessionNote,
    cacheNote,
  }
}

export function resolveNodeDetail(
  nodeId: string,
  template: WorkflowTemplate,
  run: RuntimeWorkflowRunRecord | null,
  liveText?: string,
) {
  const uiNode = template.nodes.find((n) => n.id === nodeId)
  const rtNode = run?.graph?.nodes?.find((n) => n.id === nodeId)
  const state = run?.nodeStates?.[nodeId]
  const status = resolveEffectiveNodeStatus(nodeId, run)
  const persisted = run?.history?.nodeOutputs?.[nodeId]
    ?? run?.nodeResults?.[nodeId]?.text
    ?? run?.nodeResults?.[nodeId]?.summary
    ?? ""
  const output = persisted || (status === "running" ? liveText ?? "" : "")
  const meta = (rtNode?.action as { metadata?: { readRunFiles?: string[]; outputFile?: string } } | undefined)?.metadata
  const sessionId = state?.sessionId ?? run?.nodeSessions?.[nodeId]
  const artifacts = run ? artifactsForNode(run, nodeId, template) : []
  const primaryMarkdown = artifacts.find((item) => /\.(md|markdown|tex)($|\?)/i.test(item.href) || item.kind === "markdown")
  const primaryImage = artifacts.find((item) => isImageArtifact(item))
  const isLive = Boolean(status === "running" && !persisted)
  const isPending = (status === "waiting" || status === "queued" || status === "pending") && !isLive
  const hasRichOutput = !isPending && Boolean(
    output.trim()
    || primaryMarkdown
    || primaryImage
    || isLive
    || artifacts.some(isPreviewableArtifact),
  )
  const agentMode = uiNode?.agentModeTemplateId ? getAgentModeTemplate(uiNode.agentModeTemplateId) : undefined
  const toolConstraints = uiNode ? resolveNodeToolConstraints(uiNode, agentMode) : {}
  const llmBinding = uiNode ? resolveNodeLlmBinding(uiNode, template) : undefined
  const promptBias = uiNode?.promptOverrides?.userPromptBias?.trim() || uiNode?.biasPrompt?.trim() || ""
  const contextFiles = uiNode?.runtimeOverrides?.contextFiles ?? agentMode?.contextFiles ?? []
  return {
    id: nodeId,
    label: uiNode?.name ?? rtNode?.label ?? nodeId,
    status,
    prompt: String(rtNode?.config?.prompt ?? uiNode?.promptPreview ?? ""),
    output,
    isLive,
    readRunFiles: meta?.readRunFiles ?? uiNode?.runtimeOverrides?.readRunFiles ?? [],
    outputFile: meta?.outputFile ?? run?.nodeResults?.[nodeId]?.metadata?.outputFile,
    sessionId,
    error: state?.error,
    artifacts,
    primaryMarkdown,
    primaryImage,
    hasRichOutput,
    agentModeId: uiNode?.agentModeTemplateId,
    agentModeName: agentMode?.name,
    model: llmBinding?.effectiveModel || (rtNode?.config as { model?: string } | undefined)?.model || agentMode?.model,
    llmApiId: llmBinding?.usesExternalLlm ? uiNode?.llmApiTemplateId : undefined,
    llmApiName: llmBinding?.usesExternalLlm ? llmBinding?.api?.name : undefined,
    llmBindingMismatch: llmBinding?.mismatch ?? false,
    contextMode: uiNode?.runtimeOverrides?.contextMode ?? agentMode?.contextMode,
    promptBias,
    forcedSkills: toolConstraints.forcedSkills ?? [],
    allowedSkills: toolConstraints.allowedSkills ?? [],
    forcedMcpServers: toolConstraints.forcedMcpServers ?? [],
    contextFiles,
  }
}

export function runtimeDetailContentVersion(run: RuntimeWorkflowRunRecord): string {
  const nodeStates = Object.entries(run.nodeStates ?? {})
    .map(([id, state]) => `${id}:${state.status}:${state.error ?? ""}`)
    .sort()
    .join("|")
  const nodeOutputs = Object.keys(run.history?.nodeOutputs ?? {}).sort().join("|")
  const artifacts = (run.history?.artifacts ?? [])
    .map((item) => `${item.nodeId ?? ""}:${item.href ?? item.path ?? ""}`)
    .sort()
    .join("|")
  const nodeResults = Object.keys(run.nodeResults ?? {}).sort().join("|")
  return [
    run.status,
    run.updatedAt,
    run.error ?? "",
    (run.currentNodeIds ?? []).join(","),
    String(run.progress?.percent ?? ""),
    String(run.progress?.completedNodes ?? ""),
    run.history?.workingDirectoryKey ?? "",
    nodeStates,
    nodeOutputs,
    artifacts,
    nodeResults,
  ].join("§")
}

export function runDetailIsComplete(run: RuntimeWorkflowRunRecord | null | undefined) {
  if (!run) return false
  const terminal = run.status === "completed" || run.status === "success" || run.status === "failed" || run.status === "cancelled"
  const hasGraph = (run.graph?.nodes?.length ?? 0) > 0
  const hasNodeStates = Object.keys(run.nodeStates ?? {}).length > 0
  if (terminal) {
    const hasOutputs = Object.keys(run.history?.nodeOutputs ?? {}).length > 0
      || Object.keys(run.nodeResults ?? {}).length > 0
      || (run.history?.artifacts ?? []).length > 0
    return hasGraph && hasNodeStates && hasOutputs
  }
  if ((run.history?.artifacts ?? []).length > 0) return true
  if (Object.keys(run.nodeResults ?? {}).length > 0) return true
  if (hasNodeStates && run.status !== "queued") return true
  return false
}

export function liveTokenSnapshot(run: RuntimeWorkflowRunRecord | null, byNode: TokenUsageByNodeEntry[]) {
  const usage = run?.history?.usage
  return {
    total: usage?.totalTokens ?? 0,
    input: usage?.inputTokens ?? 0,
    output: usage?.outputTokens ?? 0,
    cacheRead: usage?.cacheReadTokens ?? 0,
    cacheWrite: usage?.cacheWriteTokens ?? 0,
    nodeCount: byNode.length,
  }
}
