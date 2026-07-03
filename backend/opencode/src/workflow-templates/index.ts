import type { WorkflowGraph } from "../schema/types.js"
import { kiroChatThreeNodeGraph, kiroChatThreeNodeTemplate } from "./kiro-chat-three-node.js"
import { kiroXuanhuanNovel4chGraph, kiroXuanhuanNovel4chTemplate } from "./kiro-xuanhuan-novel-4ch.js"
import { opencodeKuaipaoChatThreeNodeGraph, opencodeKuaipaoChatThreeNodeTemplate } from "./opencode-kuaipao-chat-three-node.js"
import { opencodeToolIsolationSmokeGraph, opencodeToolIsolationSmokeTemplate } from "./opencode-tool-isolation-smoke.js"
import { opencodeXuanhuanNovel4chImageGraph, opencodeXuanhuanNovel4chImageTemplate } from "./opencode-xuanhuan-novel-4ch-image.js"

export interface WorkflowTemplateInfo {
  id: string
  version: string
  name: string
  defaultLabel: string
  labels: string[]
  description?: string
  nodeCount: number
  edgeCount: number
}

export interface WorkflowTemplateEntry {
  info: WorkflowTemplateInfo
  graph: WorkflowGraph
}

function describe(graph: WorkflowGraph): Omit<WorkflowTemplateInfo, "id" | "version" | "name" | "defaultLabel" | "labels"> {
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  }
}

const registry = new Map<string, WorkflowTemplateEntry>()

function register(entry: WorkflowTemplateEntry): void {
  registry.set(entry.info.id, entry)
}

// ── Register built-in templates ──────────────────────────────────────
register({
  info: {
    ...kiroChatThreeNodeTemplate,
    description: "Three-node KIRO chat workflow with shared runtime session history.",
    ...describe(kiroChatThreeNodeGraph),
  },
  graph: kiroChatThreeNodeGraph,
})

register({
  info: {
    ...opencodeKuaipaoChatThreeNodeTemplate,
    description: "Three-node official OpenCode chat workflow using the kuaipao OpenAI-compatible API.",
    ...describe(opencodeKuaipaoChatThreeNodeGraph),
  },
  graph: opencodeKuaipaoChatThreeNodeGraph,
})

register({
  info: {
    ...opencodeToolIsolationSmokeTemplate,
    description: "Two-node smoke test for per-node skill/MCP isolation with DeepSeek via OpenCode.",
    ...describe(opencodeToolIsolationSmokeGraph),
  },
  graph: opencodeToolIsolationSmokeGraph,
})

register({
  info: {
    ...opencodeXuanhuanNovel4chImageTemplate,
    description: "OpenCode chat with kuaipao cover image generation: plan → 4 chapters parallel → merge → cover image.",
    ...describe(opencodeXuanhuanNovel4chImageGraph),
  },
  graph: opencodeXuanhuanNovel4chImageGraph,
})

register({
  info: {
    ...kiroXuanhuanNovel4chTemplate,
    description: "Plan a 4-chapter xuanhuan novel, generate chapters, merge, review, and output final draft via KIRO CLI.",
    ...describe(kiroXuanhuanNovel4chGraph),
  },
  graph: kiroXuanhuanNovel4chGraph,
})

// ── Public API ────────────────────────────────────────────────────────

export function listTemplates(): WorkflowTemplateInfo[] {
  return Array.from(registry.values()).map((entry) => entry.info)
}

export function getTemplate(id: string): WorkflowTemplateEntry | undefined {
  return registry.get(id)
}

export function resolveTemplateGraph(id: string): WorkflowGraph | undefined {
  return registry.get(id)?.graph
}
