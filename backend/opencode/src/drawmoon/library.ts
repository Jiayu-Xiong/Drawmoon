import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { SYSTEM_LIBRARY_MCP_IDS, SYSTEM_PROBE_MCP_IDS, SYSTEM_PROBE_SKILL_IDS } from "./library-sources.js"

import { drawmoonLibraryDir, drawmoonMcpDir, drawmoonSkillsDir, drawmoonToolsDir } from "./paths.js"
import type { ToolParameterSpec } from "../cli-probes/opencode-tool-parameters.js"
import { generateOpencodeToolSource, type CustomToolKind } from "./custom-tool-file.js"

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
  kind?: CustomToolKind
  parameters?: ToolParameterSpec[]
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

const MANIFEST = "manifest.json"

function manifestPath() {
  return join(drawmoonLibraryDir(), MANIFEST)
}

function defaultManifest(): DrawmoonLibraryManifest {
  return { skills: [], mcp: [], tools: [], updatedAt: new Date().toISOString() }
}

export function readLibraryManifest(): DrawmoonLibraryManifest {
  const path = manifestPath()
  if (!existsSync(path)) {
    const manifest = defaultManifest()
    writeFileSync(path, JSON.stringify(manifest, null, 2), "utf-8")
    return manifest
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as DrawmoonLibraryManifest
    return { ...defaultManifest(), ...parsed, tools: parsed.tools ?? [] }
  } catch {
    return defaultManifest()
  }
}

export function writeLibraryManifest(manifest: DrawmoonLibraryManifest) {
  writeFileSync(manifestPath(), JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2), "utf-8")
}

/** Scan disk and rebuild manifest from skill folders (SKILL.md) and mcp JSON files */
export function scanLibraryManifest(): DrawmoonLibraryManifest {
  const skillsDir = drawmoonSkillsDir()
  const mcpDir = drawmoonMcpDir()
  const toolsDir = drawmoonToolsDir()
  const skills: DrawmoonSkillEntry[] = []
  const mcp: DrawmoonMcpEntry[] = []
  const tools: DrawmoonToolEntry[] = []

  for (const entry of readdirSync(skillsDir)) {
    const entryPath = join(skillsDir, entry)
    const skillMd = join(entryPath, "SKILL.md")
    if (statSync(entryPath).isDirectory() && existsSync(skillMd)) {
      const text = readFileSync(skillMd, "utf-8")
      const frontmatterName = text.match(/^---[\s\S]*?\nname:\s*["']?([^"'\n]+)["']?/m)?.[1]?.trim()
      const title = frontmatterName ?? text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? entry
      skills.push({
        id: entry,
        name: title,
        description: text.match(/^description:\s*(.+)$/m)?.[1]?.trim()
          ?? text.split("\n").find((line) => line.trim() && !line.startsWith("#") && !line.startsWith("---"))?.trim(),
        path: entryPath,
        source: SYSTEM_PROBE_SKILL_IDS.has(entry) ? "system" : "user",
      })
      continue
    }

    if (!entry.endsWith(".md")) continue
    const id = entry.replace(/\.md$/i, "")
    const path = join(skillsDir, entry)
    const text = readFileSync(path, "utf-8")
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? id
    skills.push({
      id,
      name: title,
      description: text.split("\n").find((line) => line.trim() && !line.startsWith("#"))?.trim(),
      path,
      source: SYSTEM_PROBE_SKILL_IDS.has(id) ? "system" : "user",
    })
  }

  for (const file of readdirSync(mcpDir)) {
    if (!file.endsWith(".json")) continue
    const id = file.replace(/\.json$/i, "")
    const path = join(mcpDir, file)
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
      mcp.push({
        id,
        name: typeof parsed.name === "string" ? parsed.name : id,
        description: typeof parsed.description === "string" ? parsed.description : undefined,
        transport: typeof parsed.transport === "string" ? parsed.transport : undefined,
        path,
        source: SYSTEM_LIBRARY_MCP_IDS.has(id) || SYSTEM_PROBE_MCP_IDS.has(id) ? "system" : "user",
      })
    } catch {
      mcp.push({ id, name: id, path, source: SYSTEM_LIBRARY_MCP_IDS.has(id) || SYSTEM_PROBE_MCP_IDS.has(id) ? "system" : "user" })
    }
  }

  if (existsSync(toolsDir)) {
    for (const file of readdirSync(toolsDir)) {
      if (!file.endsWith(".json")) continue
      const id = file.replace(/\.json$/i, "")
      const path = join(toolsDir, file)
      try {
        const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
        tools.push({
          id: typeof parsed.id === "string" ? parsed.id : id,
          name: typeof parsed.name === "string" ? parsed.name : id,
          description: typeof parsed.description === "string" ? parsed.description : undefined,
          opencodeToolId: typeof parsed.opencodeToolId === "string"
            ? parsed.opencodeToolId
            : parsed.opencodeToolId === null ? null : undefined,
          kind: parsed.kind === "delegate" || parsed.kind === "opencode-plugin" || parsed.kind === "spec-only"
            ? parsed.kind
            : undefined,
          parameters: Array.isArray(parsed.parameters) ? parsed.parameters as ToolParameterSpec[] : undefined,
          inputSchema: typeof parsed.inputSchema === "object" && parsed.inputSchema ? parsed.inputSchema as Record<string, unknown> : undefined,
          handlerCode: typeof parsed.handlerCode === "string" ? parsed.handlerCode : undefined,
          sourceFile: existsSync(join(toolsDir, `${id}.ts`)) ? join(toolsDir, `${id}.ts`) : undefined,
          path,
          source: "custom",
        })
      } catch {
        tools.push({ id, name: id, path, source: "custom" })
      }
    }
  }

  const manifest: DrawmoonLibraryManifest = {
    skills: skills.sort((a, b) => a.id.localeCompare(b.id)),
    mcp: mcp.sort((a, b) => a.id.localeCompare(b.id)),
    tools: tools.sort((a, b) => a.id.localeCompare(b.id)),
    updatedAt: new Date().toISOString(),
  }
  writeLibraryManifest(manifest)
  return manifest
}

export function upsertSkill(id: string, name: string, body: string) {
  const safe = id.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || `skill-${Date.now()}`
  const path = join(drawmoonSkillsDir(), `${safe}.md`)
  const content = body.startsWith("#") ? body : `# ${name}\n\n${body}`
  writeFileSync(path, content, "utf-8")
  return scanLibraryManifest()
}

export function upsertMcpServer(id: string, config: Record<string, unknown>) {
  const safe = id.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || `mcp-${Date.now()}`
  const path = join(drawmoonMcpDir(), `${safe}.json`)
  writeFileSync(path, JSON.stringify({ id: safe, ...config }, null, 2), "utf-8")
  return scanLibraryManifest()
}

export function upsertCustomTool(input: {
  id?: string
  name: string
  description?: string
  opencodeToolId?: string | null
  kind?: CustomToolKind
  parameters?: ToolParameterSpec[]
  inputSchema?: Record<string, unknown>
  handlerCode?: string
}) {
  const safe = (input.id ?? input.name).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || `tool-${Date.now()}`
  const jsonPath = join(drawmoonToolsDir(), `${safe}.json`)
  const tsPath = join(drawmoonToolsDir(), `${safe}.ts`)

  const kind: CustomToolKind = input.kind
    ?? (input.handlerCode?.trim() ? "opencode-plugin" : input.opencodeToolId ? "delegate" : "spec-only")

  const payload: Record<string, unknown> = {
    id: safe,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    opencodeToolId: input.opencodeToolId ?? null,
    kind,
  }
  if (input.parameters?.length) payload.parameters = input.parameters
  if (input.inputSchema) payload.inputSchema = input.inputSchema
  if (input.handlerCode?.trim()) payload.handlerCode = input.handlerCode.trim()

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf-8")

  if (kind === "opencode-plugin" && input.handlerCode?.trim()) {
    const parameters = input.parameters?.length
      ? input.parameters
      : [{ name: "input", type: "string", required: true, description: "Tool input" }]
    const source = generateOpencodeToolSource({
      description: input.description?.trim() || input.name.trim(),
      parameters,
      handlerCode: input.handlerCode.trim(),
    })
    writeFileSync(tsPath, source, "utf-8")
  }

  return scanLibraryManifest()
}
