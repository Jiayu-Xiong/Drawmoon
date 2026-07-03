import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { drawmoonNodeTemplatesDir, drawmoonWorkflowTemplatesDir } from "./paths.js"
import { validateWorkflowUiTemplate } from "./template-validator.js"

export interface DrawmoonWorkflowTemplateMeta {
  id: string
  name: string
  description?: string
  path: string
  updatedAt: string
  nodeCount?: number
  edgeCount?: number
}

function safeTemplateId(fileName: string) {
  return fileName.replace(/\.json$/i, "")
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T
  } catch {
    return null
  }
}

export function listDrawmoonWorkflowTemplateMetas(): DrawmoonWorkflowTemplateMeta[] {
  const dir = drawmoonWorkflowTemplatesDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      const path = join(dir, entry)
      const stat = statSync(path)
      const parsed = readJsonFile<{
        id?: string
        name?: string
        description?: string
        nodes?: unknown[]
        edges?: unknown[]
      }>(path)
      const id = parsed?.id?.trim() || safeTemplateId(entry)
      return {
        id,
        name: parsed?.name?.trim() || id,
        description: parsed?.description,
        path,
        updatedAt: stat.mtime.toISOString(),
        nodeCount: Array.isArray(parsed?.nodes) ? parsed.nodes.length : undefined,
        edgeCount: Array.isArray(parsed?.edges) ? parsed.edges.length : undefined,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function readDrawmoonWorkflowTemplate(id: string): Record<string, unknown> | null {
  const direct = join(drawmoonWorkflowTemplatesDir(), `${id}.json`)
  if (existsSync(direct)) return readJsonFile(direct)
  const match = listDrawmoonWorkflowTemplateMetas().find((item) => item.id === id)
  return match ? readJsonFile(match.path) : null
}

function safeWorkflowTemplateFileId(id: string) {
  const cleaned = id.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return cleaned || `generated-${Date.now()}`
}

function assertWritableWorkflowTemplate(template: Record<string, unknown>) {
  const result = validateWorkflowUiTemplate(template)
  if (!result.ok) {
    throw new Error(result.errors.join("; "))
  }
}

export function writeDrawmoonWorkflowTemplate(template: Record<string, unknown>): DrawmoonWorkflowTemplateMeta {
  assertWritableWorkflowTemplate(template)
  const id = safeWorkflowTemplateFileId(String(template.id))
  const normalized: Record<string, unknown> = {
    loopEdges: [],
    branchGroups: [],
    mergeGroups: [],
    sharedSessions: [],
    sessionGroups: {},
    ...template,
    id,
  }
  const path = join(drawmoonWorkflowTemplatesDir(), `${id}.json`)
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8")
  const stat = statSync(path)
  const parsed = readJsonFile<{
    name?: string
    description?: string
    nodes?: unknown[]
    edges?: unknown[]
  }>(path)
  return {
    id,
    name: parsed?.name?.trim() || id,
    description: typeof parsed?.description === "string" ? parsed.description : undefined,
    path,
    updatedAt: stat.mtime.toISOString(),
    nodeCount: Array.isArray(parsed?.nodes) ? parsed.nodes.length : undefined,
    edgeCount: Array.isArray(parsed?.edges) ? parsed.edges.length : undefined,
  }
}

export function listDrawmoonNodeTemplateIds(): string[] {
  const dir = drawmoonNodeTemplatesDir()
  if (!existsSync(dir)) return []
  const ids: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      ids.push(safeTemplateId(entry.name))
      continue
    }
    if (!entry.isDirectory()) continue
    for (const file of readdirSync(join(dir, entry.name))) {
      if (file.endsWith(".json")) ids.push(`${entry.name}/${safeTemplateId(file)}`)
    }
  }
  return ids.sort()
}

export function readDrawmoonNodeTemplate(id: string): Record<string, unknown> | null {
  const direct = join(drawmoonNodeTemplatesDir(), `${id}.json`)
  if (existsSync(direct)) return readJsonFile(direct)
  const nested = join(drawmoonNodeTemplatesDir(), `${id}.json`)
  if (existsSync(nested)) return readJsonFile(nested)
  return null
}
