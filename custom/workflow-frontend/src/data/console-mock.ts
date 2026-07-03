import { backendOpencodeDir } from "../lib/repo-paths"
import type {
  AgentDefinition,
  BackendProvider,
  SystemSnapshot,
  WorkflowEntity,
} from "./console-model"
import { ensureTemplateBootstrap, getBootstrappedWorkflowTemplates, resolveDefaultWorkflowTemplate } from "./bootstrap-templates"
import { agentModeTemplates } from "./agent-mode-templates"
import { cliTemplates } from "./cli-templates"
import { llmApiTemplates } from "./llm-api-templates"
import {
  bootstrapWorkflowEntities,
  listWorkflowEntities,
} from "./workflow-entity"

export { llmApiTemplates } from "./llm-api-templates"
export { agentModeTemplates } from "./agent-mode-templates"
export { cliTemplates } from "./cli-templates"

export const backendProviders: BackendProvider[] = [
  { id: "kuaipao", name: "Kuaipao", status: "online", endpoint: "https://kuaipao.pro/v1", version: "v1", path: "KUAIPAO_API_KEY", protocol: "openai-compatible", binding: "bound" },
]

export const agents: AgentDefinition[] = [
  { id: "agent-intake", name: "Intake Analyst", role: "input normalizer", model: "opencode/default", tools: ["read_file", "write_file"], outputKinds: ["markdown", "json"] },
  { id: "agent-paper", name: "Paper Writer", role: "latex section writer", model: "opencode/default", tools: ["read_file", "latex_patch"], outputKinds: ["latex", "markdown"] },
  { id: "agent-research", name: "Research Mapper", role: "related work researcher", model: "custom/research", tools: ["search_index", "bibtex_write"], outputKinds: ["markdown", "latex"] },
  { id: "agent-figure", name: "Figure Producer", role: "image and figure prompt worker", model: "custom/vision", tools: ["figure_prompt", "image_render", "write_file"], outputKinds: ["image", "markdown"] },
  { id: "agent-layout", name: "Layout Auditor", role: "pdf layout checker", model: "custom/layout", tools: ["latex_build", "pdf_audit"], outputKinds: ["pdf", "json"] },
  { id: "agent-reviewer", name: "Objective Reviewer", role: "review agent", model: "opencode/reviewer", tools: ["read_file", "review_json"], outputKinds: ["json", "markdown"] },
  { id: "agent-editor", name: "Revision Editor", role: "objective revision agent", model: "opencode/editor", tools: ["latex_patch", "review_union"], outputKinds: ["latex", "pdf"] },
  { id: "agent-codex", name: "Codex CLI", role: "local codex executor", model: "codex/configured", tools: ["codex_exec", "read_file", "edit_file"], outputKinds: ["markdown", "json", "directory"] },
  { id: "agent-copilot", name: "Copilot CLI", role: "local copilot chat", model: "copilot/selected-model", tools: ["copilot_chat"], outputKinds: ["markdown", "json"] },
  { id: "agent-kiro-cli", name: "Kiro CLI", role: "kiro cli executor", model: "kiro/configured", tools: ["kiro_model_list", "kiro_usage", "kiro_pricing"], outputKinds: ["json", "markdown"] },
  { id: "agent-kuaipao", name: "Kuaipao LLM", role: "kuaipao http llm", model: "kuaipao/openai-chat", tools: ["http_llm_call"], outputKinds: ["markdown", "json"] },
]

ensureTemplateBootstrap()

function resolvePaperTemplateSnapshot(): WorkflowTemplate {
  return resolveDefaultWorkflowTemplate()
}

export const paperTemplate: WorkflowTemplate = new Proxy({} as WorkflowTemplate, {
  get(_target, prop, receiver) {
    const current = resolvePaperTemplateSnapshot()
    const value = Reflect.get(current as object, prop, current)
    return typeof value === "function" ? value.bind(current) : value
  },
})
export const templates = getBootstrappedWorkflowTemplates()

/** No seeded mock instances — runtime API is the sole source for workflow runs. */
bootstrapWorkflowEntities([])

export function getWorkflowEntities() {
  return listWorkflowEntities()
}

export const workflowEntities = getWorkflowEntities()

export const systemSnapshot: SystemSnapshot = {
  status: "partial",
  lastUpdated: "2026-06-05 00:02:18",
  cli: {
    version: "workflow-runtime 0.1.0",
    uptime: "2h 18m",
    path: backendOpencodeDir(),
    available: true,
  },
  apiBinding: {
    endpoint: "http://localhost:3456/api",
    protocol: "http + ndjson",
    status: "degraded",
  },
  runtime: {
    name: "backend-opencode",
    pid: 3456,
    startedAt: "2026-06-04 21:44:00",
  },
  resources: [
    { name: "CPU", value: "31%", samples: [18, 24, 21, 37, 31, 29, 33, 31] },
    { name: "Memory", value: "8.4 GB", samples: [44, 45, 47, 48, 49, 49, 50, 51] },
    { name: "GPU", value: "idle", samples: [2, 3, 2, 5, 3, 2, 3, 2] },
    { name: "Disk", value: "12 MB/s", samples: [12, 10, 11, 18, 17, 9, 7, 12] },
    { name: "Network I/O", value: "quiet", samples: [3, 4, 3, 5, 2, 3, 3, 2] },
  ],
  quota: {
    summary: "API quota data from provider endpoints.",
    probes: [
      { name: "deepseek api", status: "degraded", detail: "DEEPSEEK_API_KEY required" },
      { name: "runtime health", status: "online", detail: "backend-opencode running" },
    ],
  },
  modelContext: [
    { provider: "opencode", model: "configured default", context: "from provider metadata", source: "local config" },
    { provider: "copilot", model: "not queried", context: "not queried", source: "prompt probes disabled" },
    { provider: "codex", model: "configured default", context: "not reported", source: "config only" },
    { provider: "deepseek", model: "deepseek-chat", context: "OpenAI-compatible endpoint", source: "env: DEEPSEEK_API_KEY" },
  ],
  taskQueue: workflowEntities.map((entity) => ({ id: entity.id, workflow: entity.name, state: entity.status })),
  events: [
    { time: "00:01:59", source: "runtime", level: "info", message: "Snapshot collected." },
    { time: "00:01:20", source: "provider", level: "warn", message: "DeepSeek API key not configured." },
    { time: "00:00:42", source: "queue", level: "info", message: `${workflowEntities.length} workflow entities visible.` },
  ],
}
