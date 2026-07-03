/**
 * Zero-token workflow UI template validation (no LLM).
 * Used before saving generated templates and via POST /drawmoon/templates/workflows/validate.
 */

export interface TemplateValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  stats: {
    nodeCount: number
    edgeCount: number
    maxDepth: number
    sharedSessionKeys: string[]
  }
}

type UiNode = Record<string, unknown>
type UiEdge = Record<string, unknown>

const CONTEXT_MODES = new Set(["fresh", "inherit", "fork", "summary", "artifacts"])
const ARCHETYPES = new Set(["planner", "worker", "reviser", "merger", "reviewer", "media", "gate", "finalizer"])
const ID_RE = /^[a-z][a-z0-9-]*$/

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function nodeArtifacts(node: UiNode): Array<{ path?: string; label?: string }> {
  return asArray<{ path?: string; label?: string }>(node.artifacts)
}

function outputPath(node: UiNode): string {
  const art = nodeArtifacts(node).find((a) => str(a.path))
  if (art?.path) return str(art.path)
  const modality = str(node.modality)
  if (modality === "image") return `${str(node.id)}.png`
  return `${str(node.id)}.md`
}

function readRunFiles(node: UiNode): string[] {
  const over = node.runtimeOverrides as { readRunFiles?: string[] } | undefined
  return asArray<string>(over?.readRunFiles).map(str).filter(Boolean)
}

function archetype(node: UiNode): string {
  const over = node.runtimeOverrides as { archetype?: string } | undefined
  return str(over?.archetype)
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i
const PDF_EXT = /\.pdf$/i

function inputPaths(node: UiNode): string[] {
  const paths = [...readRunFiles(node)]
  const over = node.runtimeOverrides as { contract?: { inputs?: Array<{ from?: string }> } } | undefined
  for (const input of over?.contract?.inputs ?? []) {
    const from = str(input.from)
    if (from.includes(":")) paths.push(from.split(":").pop() ?? from)
  }
  return paths
}

function delegateSupportsPdf(agentMode: string, executionMode: string): boolean {
  if (executionMode === "llm-api") return false
  if (/copilot/i.test(agentMode)) return false
  return /opencode|kiro|codex/i.test(agentMode) || executionMode === "cli" || !agentMode
}

function delegateSupportsImage(agentMode: string, executionMode: string, modality: string): boolean {
  if (modality === "image" || executionMode === "llm-api") return true
  if (/copilot/i.test(agentMode)) return false
  return /opencode|kiro|codex|direct-api/i.test(agentMode) || executionMode === "cli"
}

function nodeModality(node: UiNode): string {
  return str(node.modality) || "text"
}

function executionWaves(nodeIds: string[], edges: UiEdge[]): string[][] {
  const inDegree = new Map(nodeIds.map((id) => [id, 0]))
  for (const edge of edges) {
    const to = str(edge.to)
    if (to) inDegree.set(to, (inDegree.get(to) ?? 0) + 1)
  }
  const waves: string[][] = []
  let queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0)
  while (queue.length) {
    waves.push(queue)
    const next: string[] = []
    for (const from of queue) {
      for (const edge of edges.filter((e) => str(e.from) === from)) {
        const to = str(edge.to)
        if (!to) continue
        const d = (inDegree.get(to) ?? 0) - 1
        inDegree.set(to, d)
        if (d === 0) next.push(to)
      }
    }
    queue = next
  }
  return waves.length ? waves : [nodeIds]
}

export function validateWorkflowUiTemplate(template: Record<string, unknown>): TemplateValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const id = str(template.id)
  const name = str(template.name)
  if (!id) errors.push("template.id is required")
  if (!name) errors.push("template.name is required")
  if (id && !ID_RE.test(id)) warnings.push(`template.id "${id}" should be kebab-case (a-z, 0-9, hyphen)`)

  const nodes = asArray<UiNode>(template.nodes)
  const edges = asArray<UiEdge>(template.edges)
  const stages = asArray(template.stages)
  const columns = asArray(template.columns)

  if (!nodes.length) errors.push("nodes[] must be non-empty")
  if (!stages.length) errors.push("stages[] must be non-empty")
  if (!columns.length) errors.push("columns[] must be non-empty")

  const nodeIds = new Set<string>()
  const outputsByNode = new Map<string, string[]>()

  for (const node of nodes) {
    const nid = str(node.id)
    if (!nid) {
      errors.push("each node needs id")
      continue
    }
    if (nodeIds.has(nid)) errors.push(`duplicate node id: ${nid}`)
    nodeIds.add(nid)
    if (!str(node.name)) errors.push(`node "${nid}" missing name`)
    if (!str(node.promptPreview)) errors.push(`node "${nid}" missing promptPreview (task intent)`)
    if (!str(node.outputContract)) warnings.push(`node "${nid}" missing outputContract (describe artifact, not repeat prompt)`)
    if (!str(node.executionMode)) warnings.push(`node "${nid}" missing executionMode`)
    const mode = str(node.executionMode)
    if (mode === "llm-api" && !str(node.llmApiTemplateId)) {
      errors.push(`node "${nid}" executionMode llm-api requires llmApiTemplateId`)
    }
    if (mode === "cli" && !str(node.agentModeTemplateId)) {
      warnings.push(`node "${nid}" cli node should set agentModeTemplateId`)
    }
    const arch = archetype(node)
    if (arch && !ARCHETYPES.has(arch)) warnings.push(`node "${nid}" unknown archetype "${arch}"`)
    const out = outputPath(node)
    outputsByNode.set(nid, [out, ...nodeArtifacts(node).map((a) => str(a.path)).filter(Boolean)])
  }

  const nodeById = new Map<string, UiNode>()
  for (const node of nodes) {
    const nid = str(node.id)
    if (nid) nodeById.set(nid, node)
  }

  for (const edge of edges) {
    const from = str(edge.from)
    const to = str(edge.to)
    if (!from || !to) {
      errors.push("edge missing from or to")
      continue
    }
    if (!nodeIds.has(from)) errors.push(`edge from unknown node: ${from}`)
    if (!nodeIds.has(to)) errors.push(`edge to unknown node: ${to}`)
    const cm = str(edge.contextMode ?? edge.annotation)
    if (cm && !CONTEXT_MODES.has(cm)) warnings.push(`edge ${from}→${to} contextMode "${cm}" unknown`)
    if (cm === "fork") warnings.push(`edge ${from}→${to}: avoid fork; use inherit+shared session or artifacts+readRunFiles`)
    if (cm === "inherit") {
      const fromNode = nodeById.get(from)
      const toNode = nodeById.get(to)
      const fromArch = archetype(fromNode ?? {})
      const toArch = archetype(toNode ?? {})
      const fromMod = nodeModality(fromNode ?? {})
      const toMod = nodeModality(toNode ?? {})
      if (fromArch === "reviewer" || toArch === "reviewer") {
        errors.push(`edge ${from}→${to}: reviewers must not inherit author context; use review intent with artifacts/fresh`)
      }
      if (fromMod === "image" || toMod === "image") {
        errors.push(`edge ${from}→${to}: image nodes must not inherit text context; use handoff with readRunFiles only`)
      }
    }
  }

  const waves = executionWaves([...nodeIds], edges)
  const scheduled = new Set(waves.flat())
  if (scheduled.size !== nodeIds.size) errors.push("graph has a cycle or disconnected nodes unreachable from roots")

  const allOutputPaths = new Set<string>()
  for (const paths of outputsByNode.values()) paths.forEach((p) => allOutputPaths.add(p))

  const sharedKeys = new Set<string>()
  for (const node of nodes) {
    const nid = str(node.id)
    const arch = archetype(node)
    const session = node.session as { policy?: string; sessionKey?: string; bindsToNodeId?: string } | undefined
    if (session?.policy === "shared" && session.sessionKey) sharedKeys.add(session.sessionKey)
    if (session?.policy === "shared" && (arch === "reviewer" || nodeModality(node) === "image")) {
      errors.push(`node "${nid}" must not use shared session (reviewer/image isolation)`)
    }
    if (session?.bindsToNodeId && !nodeIds.has(session.bindsToNodeId)) {
      errors.push(`node "${nid}" bindsToNodeId unknown: ${session.bindsToNodeId}`)
    }
    for (const rf of readRunFiles(node)) {
      const base = rf.split("/").pop() ?? rf
      const known = [...allOutputPaths].some((p) => p === rf || p.endsWith(`/${base}`) || p === base)
      if (!known) warnings.push(`node "${nid}" readRunFiles "${rf}" not produced by any upstream artifact path`)
    }

    const agentMode = str(node.agentModeTemplateId)
    const execMode = str(node.executionMode)
    const mod = nodeModality(node)
    for (const p of inputPaths(node)) {
      if (PDF_EXT.test(p) && !delegateSupportsPdf(agentMode, execMode)) {
        warnings.push(`node "${nid}" PDF input "${p}" may not be readable by delegate ${agentMode || execMode}`)
      }
      if (IMAGE_EXT.test(p) && !delegateSupportsImage(agentMode, execMode, mod)) {
        warnings.push(`node "${nid}" image input "${p}" may not be readable by delegate ${agentMode || execMode}`)
      }
    }
  }

  const sharedSessions = asArray<{ key?: string; nodeIds?: string[] }>(template.sharedSessions)
  for (const key of sharedKeys) {
    const decl = sharedSessions.find((s) => str(s.key) === key)
    if (!decl) warnings.push(`shared sessionKey "${key}" not listed in sharedSessions[]`)
  }

  const roots = nodes.filter((n) => !edges.some((e) => str(e.to) === str(n.id)))
  if (roots.length !== 1) warnings.push(`expected exactly one root node (no incoming edges), found ${roots.length}`)

  const firstRoot = str(roots[0]?.id)
  if (firstRoot) {
    const over = roots[0]?.runtimeOverrides as { contextMode?: string } | undefined
    if (over?.contextMode && over.contextMode !== "fresh") {
      warnings.push(`root node "${firstRoot}" should use runtimeOverrides.contextMode "fresh"`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      maxDepth: waves.length,
      sharedSessionKeys: [...sharedKeys],
    },
  }
}
