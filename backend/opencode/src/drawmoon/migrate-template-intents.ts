/**
 * Migrate workflow UI templates to InteractionIntent + custom-io-planner + typed handoff.
 * Zero-token; run on import/seed and via scripts/migrate-repo-templates.ts.
 */

import type { InteractionIntent } from "../workflow-runs/context/types.js"

type UiNode = Record<string, unknown>
type UiEdge = Record<string, unknown>
type UiTemplate = Record<string, unknown>

const ARCHETYPES = new Set([
  "planner", "worker", "reviser", "merger", "reviewer", "media", "gate", "finalizer",
])

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function inferArchetype(node: UiNode): string {
  const over = node.runtimeOverrides as { archetype?: string } | undefined
  if (over?.archetype && ARCHETYPES.has(over.archetype)) return over.archetype
  const exec = str(node.executionMode)
  if (exec === "human-gate" || exec === "inquiry") return "gate"
  const id = str(node.id).toLowerCase()
  if ((id.includes("review") || id.includes("reviewer")) && !id.includes("gate") && !id.includes("intersection")) {
    if (id.includes("revision") || id.includes("revise")) return "reviser"
    return "reviewer"
  }
  if (id.includes("merge") || id.includes("compile") || id.includes("final")) return "merger"
  if (id.includes("gate") || id.includes("inquiry")) return "gate"
  if (id.includes("figure") && str(node.modality) === "image") return "media"
  if (id.includes("architect") || id.includes("scaffold") || id.includes("intake") || id.includes("requirements")) return "planner"
  if (id.includes("section") || id.includes("worker")) return "worker"
  if (id.includes("revis")) return "reviser"
  return ""
}

function deriveIntent(node: UiNode, archetype: string): InteractionIntent {
  const over = node.runtimeOverrides as { intent?: string; contextMode?: string; readRunFiles?: string[] } | undefined
  const explicit = str(over?.intent)
  if (explicit === "continue" || explicit === "handoff" || explicit === "review") return explicit

  const session = node.session as { policy?: string } | undefined
  if (archetype === "reviewer") return "review"
  if (archetype === "reviser") return "continue"
  if (session?.policy === "shared") return "continue"
  if (over?.contextMode === "inherit" && !over?.readRunFiles?.length) return "continue"
  return "handoff"
}

function intentToNodeContextMode(intent: InteractionIntent, hasReadFiles: boolean): string {
  if (intent === "review") return "fresh"
  if (intent === "continue") return "inherit"
  if (hasReadFiles) return "fresh"
  return "artifacts"
}

function intentToEdgeContextMode(intent: InteractionIntent): string {
  if (intent === "continue") return "inherit"
  if (intent === "review") return "artifacts"
  return "artifacts"
}

function isIoPlannerNode(node: UiNode): boolean {
  const id = str(node.id).toLowerCase()
  const over = node.runtimeOverrides as { plannerInquiry?: boolean } | undefined
  if (over?.plannerInquiry) return true
  return id.includes("architect") || id.includes("scaffold") || id.includes("intake") || id.includes("requirements")
}

function shouldForceReviewerAgentMode(node: UiNode, archetype: string, intent: InteractionIntent, agentMode: string): boolean {
  const id = str(node.id).toLowerCase()
  if (id.includes("intersection")) return false
  if (agentMode.includes("planner") && !agentMode.includes("reviewer")) return false
  if (intent !== "review" && archetype !== "reviewer") return false
  return !agentMode.includes("reviewer") && !agentMode.includes("kiro-cli-review")
}

function isReviewerNode(node: UiNode): boolean {
  const arch = inferArchetype(node)
  if (arch === "reviewer") return true
  const id = str(node.id).toLowerCase()
  return id.includes("review") && !id.includes("intersection") && !id.includes("gate")
}

function isImageNode(node: UiNode): boolean {
  return str(node.modality) === "image" || inferArchetype(node) === "media"
}

function migrateNode(node: UiNode): void {
  const archetype = inferArchetype(node)
  const intent = deriveIntent(node, archetype)
  const over = (node.runtimeOverrides ?? {}) as Record<string, unknown>
  const readRunFiles = asArray<string>(over.readRunFiles).filter(Boolean)

  if (archetype && !over.archetype) over.archetype = archetype
  over.intent = intent
  over.contextMode = intentToNodeContextMode(intent, readRunFiles.length > 0)

  const agentMode = str(node.agentModeTemplateId)
  if (archetype === "planner" && isIoPlannerNode(node)) {
    if (!agentMode || agentMode === "opencode-paper-planner" || agentMode === "opencode-plan") {
      node.agentModeTemplateId = "custom-io-planner"
    }
  }
  if (shouldForceReviewerAgentMode(node, archetype, intent, agentMode)) {
    node.agentModeTemplateId = "opencode-paper-reviewer"
    const session = node.session as { policy?: string } | undefined
    if (session?.policy === "shared") {
      node.session = { ...session, policy: "fresh" }
    }
  }

  node.runtimeOverrides = over
}

function migrateEdge(edge: UiEdge, nodeById: Map<string, UiNode>): void {
  const from = str(edge.from)
  const to = str(edge.to)
  const fromNode = nodeById.get(from)
  const toNode = nodeById.get(to)
  if (!toNode) return

  const toArch = inferArchetype(toNode)
  const toIntent = deriveIntent(toNode, toArch)
  const fromArch = fromNode ? inferArchetype(fromNode) : ""
  const fromMod = fromNode ? str(fromNode.modality) || "text" : "text"
  const toMod = str(toNode.modality) || "text"

  let cm = str(edge.contextMode ?? edge.annotation)

  if (toArch === "reviewer" || toIntent === "review") {
    cm = "artifacts"
  } else if (fromMod === "image" || toMod === "image") {
    cm = "artifacts"
  } else if (fromArch === "reviewer" || (fromNode && isReviewerNode(fromNode))) {
    cm = "artifacts"
  } else if (toIntent === "continue") {
    cm = "inherit"
  } else if (toIntent === "handoff") {
    cm = "artifacts"
  } else if (cm === "fork" || cm === "summary") {
    cm = "artifacts"
  }

  edge.contextMode = cm
  edge.annotation = cm
}

export function migrateWorkflowTemplateIntents(template: UiTemplate): UiTemplate {
  const out = structuredClone(template) as UiTemplate
  const nodes = asArray<UiNode>(out.nodes)
  const edges = asArray<UiEdge>(out.edges)

  for (const node of nodes) migrateNode(node)

  const nodeById = new Map(nodes.map((n) => [str(n.id), n]).filter(([id]) => id))
  for (const edge of edges) migrateEdge(edge, nodeById)

  const sharedSessions = asArray<{ key?: string; nodeIds?: string[] }>(out.sharedSessions)
  out.sharedSessions = sharedSessions
    .map((s) => ({
      ...s,
      nodeIds: (s.nodeIds ?? []).filter((nid) => {
        const node = nodeById.get(nid)
        if (!node) return false
        const arch = inferArchetype(node)
        return arch !== "reviewer" && !isImageNode(node) && deriveIntent(node, arch) === "continue"
      }),
    }))
    .filter((s) => (s.nodeIds?.length ?? 0) > 0)

  out.nodes = nodes
  out.edges = edges

  const plannerIds = new Set(
    nodes.filter((n) => inferArchetype(n) === "planner").map((n) => str(n.agentModeTemplateId)).filter(Boolean),
  )
  if (plannerIds.has("custom-io-planner") && !asArray<string>(out.agentModeTemplateIds).includes("custom-io-planner")) {
    out.agentModeTemplateIds = [...new Set([...asArray<string>(out.agentModeTemplateIds), "custom-io-planner"])]
  }
  if (str(out.defaultAgentModeTemplateId) === "opencode-paper-planner") {
    out.defaultAgentModeTemplateId = "custom-io-planner"
  }

  return out
}
