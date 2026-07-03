import type { ToolSource } from "../data/tool-mapping"

const API_BASE = "/api"

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json() as Promise<T>
}

export interface DrawmoonSkillEntry {
  id: string
  name: string
  description?: string
  path: string
  source?: "system" | "user"
}

export interface DrawmoonMcpEntry {
  id: string
  name: string
  description?: string
  path: string
  transport?: string
  source?: "system" | "user"
}

export interface DrawmoonToolEntry {
  id: string
  name: string
  description?: string
  opencodeToolId?: string | null
  kind?: "delegate" | "opencode-plugin" | "spec-only"
  parameters?: ToolParameterDef[]
  inputSchema?: Record<string, unknown>
  handlerCode?: string
  sourceFile?: string
  path: string
  source: "custom"
}

export interface DrawmoonLibraryManifest {
  skills: DrawmoonSkillEntry[]
  mcp: DrawmoonMcpEntry[]
  tools: DrawmoonToolEntry[]
  updatedAt: string
}

export interface DrawmoonRegistryFile<T = unknown> {
  version: 1
  updatedAt: string
  items: T[]
}

export interface DrawmoonRegistrySnapshot {
  cliTemplates: DrawmoonRegistryFile
  agentModeTemplates: DrawmoonRegistryFile
  llmApiTemplates: DrawmoonRegistryFile
}

export function fetchDrawmoonRoot() {
  return json<{ root: string }>("/drawmoon/root")
}

export function fetchDrawmoonRegistry() {
  return json<DrawmoonRegistrySnapshot>("/drawmoon/registry")
}

export function saveDrawmoonRegistryBucket(bucket: "cli-templates" | "agent-mode-templates" | "llm-api-templates", items: unknown[]) {
  return json<DrawmoonRegistryFile>(`/drawmoon/registry/${bucket}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })
}

export function fetchLibraryManifest() {
  return json<DrawmoonLibraryManifest>("/library/manifest")
}

export interface ToolParameterDef {
  name: string
  type?: string
  required?: boolean
  description?: string
}

export interface ToolImplementationSpec {
  runtime: "mcp" | "opencode-vendor" | "static" | "hybrid"
  summary: string
  steps: string[]
  sourceFiles: Array<{ path: string; role: string }>
  handlerCode?: string
  mcpServer?: string
  opencodeBuiltin?: string
  envVars?: string[]
}

export interface CatalogToolRow {
  id: string
  name: string
  description?: string
  descriptionPreview?: string
  systemToolId: string
  opencodeToolId: string | null
  source: ToolSource
  vendorSource?: string
  parameters?: ToolParameterDef[]
  mappedOpencodeParameters?: ToolParameterDef[]
  inputSchema?: Record<string, unknown>
  implementation?: ToolImplementationSpec
  kind?: "delegate" | "opencode-plugin" | "spec-only"
}

export interface ToolCatalogEntry {
  systemToolId: string
  opencodeToolId: string | null
  source: ToolSource
  description?: string
  id?: string
  name?: string
  descriptionPreview?: string
  vendorSource?: string
  parameters?: ToolParameterDef[]
  mappedOpencodeParameters?: ToolParameterDef[]
  inputSchema?: Record<string, unknown>
}

export interface ToolCatalog {
  unifiedSystemTools: CatalogToolRow[]
  opencodeTools: CatalogToolRow[]
  customTools: CatalogToolRow[]
  systemTools: ToolCatalogEntry[]
  opencodeNativeTools: ToolCatalogEntry[]
  workflowIoTools: Array<{
    id: string
    description: string
    inputSchema?: Record<string, unknown>
    parameters?: ToolParameterDef[]
  }>
  agentModeBindings: Array<{
    id: string
    name: string
    mode: string
    tools: ToolCatalogEntry[]
  }>
  systemLibraryIds: { mcp: string[]; skills: string[] }
}

export function fetchToolCatalog() {
  return json<ToolCatalog>("/library/tool-catalog")
}

export function rescanLibraryManifest() {
  return json<DrawmoonLibraryManifest>("/library/rescan", { method: "POST" })
}

export function createLibrarySkill(input: { id?: string; name: string; body: string }) {
  return json<DrawmoonLibraryManifest>("/library/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function createLibraryMcp(input: { id?: string; config: Record<string, unknown> }) {
  return json<DrawmoonLibraryManifest>("/library/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function createLibraryTool(input: {
  id?: string
  name: string
  description?: string
  opencodeToolId?: string | null
  kind?: "delegate" | "opencode-plugin" | "spec-only"
  parameters?: ToolParameterDef[]
  inputSchema?: Record<string, unknown>
  handlerCode?: string
}) {
  return json<DrawmoonLibraryManifest>("/library/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export interface CustomToolSpec {
  kinds: Array<{ id: string; description: string }>
  parameterExample: ToolParameterDef[]
  handlerExample: string
  opencodeToolTemplate: string
}

export function fetchCustomToolSpec() {
  return json<CustomToolSpec>("/library/custom-tool-spec")
}

export function seedToolIsolationSmokeLibrary() {
  return json<DrawmoonLibraryManifest>("/library/seed/tool-isolation-smoke", { method: "POST" })
}

export interface LibraryImportResult {
  manifest: DrawmoonLibraryManifest
  skills: number
  mcp: number
  skipped: string[]
}

export async function importLibraryArchive(file: File): Promise<LibraryImportResult> {
  const form = new FormData()
  form.append("archive", file)
  const response = await fetch(`${API_BASE}/library/import`, { method: "POST", body: form })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json() as Promise<LibraryImportResult>
}

export interface DrawmoonWorkflowTemplateMeta {
  id: string
  name: string
  description?: string
  path: string
  updatedAt: string
}

export interface WorkflowTemplateValidation {
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

export function validateDrawmoonWorkflowTemplate(template: unknown) {
  return json<WorkflowTemplateValidation>("/drawmoon/templates/workflows/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template }),
  })
}

export function saveDrawmoonWorkflowTemplate(template: unknown) {
  return json<{ meta: DrawmoonWorkflowTemplateMeta; template: unknown }>("/drawmoon/templates/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template }),
  })
}
