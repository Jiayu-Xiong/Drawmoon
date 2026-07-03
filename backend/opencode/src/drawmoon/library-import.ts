import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, posix } from "node:path"
import { unzipSync } from "fflate"

import { drawmoonMcpDir, drawmoonSkillsDir } from "./paths.js"
import { scanLibraryManifest, type DrawmoonLibraryManifest } from "./library.js"

export interface LibraryImportResult {
  manifest: DrawmoonLibraryManifest
  skills: number
  mcp: number
  skipped: string[]
}

function safeEntryPath(raw: string): string | null {
  const normalized = posix.normalize(raw.replace(/\\/g, "/")).replace(/^(\.\/)+/, "")
  if (!normalized || normalized.startsWith("..") || normalized.includes("/../")) return null
  return normalized
}

function writeSkillFile(relPath: string, content: Uint8Array) {
  const safe = safeEntryPath(relPath)
  if (!safe) return false
  const base = safe.replace(/^skills\//i, "")
  const dest = base.includes("/")
    ? join(drawmoonSkillsDir(), base)
    : join(drawmoonSkillsDir(), base.endsWith(".md") ? base : `${base}.md`)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content)
  return true
}

function writeMcpFile(relPath: string, content: Uint8Array) {
  const safe = safeEntryPath(relPath)
  if (!safe) return false
  const base = safe.replace(/^(mcp\/)?/i, "")
  if (!base.endsWith(".json")) return false
  const dest = join(drawmoonMcpDir(), base.replace(/^mcp\//i, ""))
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content)
  return true
}

/** Import a zip archive of skills (folders with SKILL.md or *.md) and MCP JSON configs. */
export function importLibraryZip(buffer: Uint8Array): LibraryImportResult {
  const entries = unzipSync(buffer)
  let skills = 0
  let mcp = 0
  const skipped: string[] = []

  for (const [rawPath, data] of Object.entries(entries)) {
    if (rawPath.endsWith("/")) continue
    const path = safeEntryPath(rawPath)
    if (!path) {
      skipped.push(rawPath)
      continue
    }

    const lower = path.toLowerCase()
    if (lower.endsWith("skill.md") || (lower.startsWith("skills/") && lower.endsWith(".md"))) {
      if (writeSkillFile(path, data)) skills += 1
      else skipped.push(rawPath)
      continue
    }
    if (lower.endsWith(".json") && (lower.startsWith("mcp/") || lower.includes("/mcp/"))) {
      if (writeMcpFile(path, data)) mcp += 1
      else skipped.push(rawPath)
      continue
    }
    if (lower.endsWith(".json") && !path.includes("/")) {
      if (writeMcpFile(`mcp/${path}`, data)) mcp += 1
      else skipped.push(rawPath)
      continue
    }
    skipped.push(rawPath)
  }

  if (!existsSync(drawmoonSkillsDir())) mkdirSync(drawmoonSkillsDir(), { recursive: true })
  if (!existsSync(drawmoonMcpDir())) mkdirSync(drawmoonMcpDir(), { recursive: true })

  return { manifest: scanLibraryManifest(), skills, mcp, skipped }
}
