import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"

import { moveWithinWorkspace } from "./allocator/migrate.js"

export interface FileManifestEntry {
  path: string
  source?: string
}

export interface PlannerManifest {
  outputDirectory?: string
  files: FileManifestEntry[]
}

const MANIFEST_PATH = ".workflow/planner-manifest.json"

export function plannerManifestPath(workspaceDir: string): string {
  return join(workspaceDir, MANIFEST_PATH)
}

export function parsePlannerManifest(text: string): PlannerManifest | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const jsonBlock = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim()
  const raw = jsonBlock ?? trimmed
  try {
    const parsed = JSON.parse(raw) as PlannerManifest
    if (!Array.isArray(parsed.files)) return null
    return {
      outputDirectory: typeof parsed.outputDirectory === "string" ? parsed.outputDirectory : undefined,
      files: parsed.files.filter((f) => f && typeof f.path === "string"),
    }
  } catch {
    return null
  }
}

export function writePlannerManifestEntity(workspaceDir: string, manifest: PlannerManifest): string {
  const path = plannerManifestPath(workspaceDir)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(manifest, null, 2), "utf-8")
  return MANIFEST_PATH
}

function listWorkspaceFiles(root: string, depth = 0): string[] {
  if (depth > 6) return []
  const out: string[] = []
  let entries: string[]
  try { entries = readdirSync(root) } catch { return out }
  for (const entry of entries) {
    if (entry === ".workflow" || entry === "node_modules") continue
    const full = join(root, entry)
    try {
      const st = statSync(full)
      if (st.isDirectory()) out.push(...listWorkspaceFiles(full, depth + 1))
      else out.push(relative(root, full).replace(/\\/g, "/"))
    } catch { /* skip */ }
  }
  return out
}

/** Hard-move files from workspace root (or explicit source) into manifest paths under outputDir. */
export function transportArtifactsFromManifest(
  workspaceDir: string,
  manifest: PlannerManifest,
  startedAtMs: number,
): { moved: string[]; warnings: string[] } {
  const moved: string[] = []
  const warnings: string[] = []
  const recent = listWorkspaceFiles(workspaceDir).filter((p) => {
    try {
      return statSync(join(workspaceDir, p)).mtimeMs >= startedAtMs - 5000
    } catch { return false }
  })

  for (const entry of manifest.files) {
    const target = entry.path.replace(/\\/g, "/")
    const dest = join(workspaceDir, target)
    if (existsSync(dest)) continue

    const sourceRel = entry.source?.replace(/\\/g, "/")
    let sourceAbs: string | null = null
    if (sourceRel) {
      const candidate = join(workspaceDir, sourceRel)
      if (existsSync(candidate)) sourceAbs = candidate
    }
    if (!sourceAbs) {
      const base = target.split("/").pop()!
      const match = recent.find((p) => p === base || p.endsWith(`/${base}`))
      sourceAbs = match ? join(workspaceDir, match) : null
    }
    if (!sourceAbs || !existsSync(sourceAbs)) {
      warnings.push(`manifest missing source for ${target}`)
      continue
    }
    mkdirSync(dirname(dest), { recursive: true })
    try {
      moveWithinWorkspace(sourceAbs, dest)
      moved.push(`${relative(workspaceDir, sourceAbs)} → ${target}`)
    } catch (err) {
      warnings.push(`manifest move failed for ${target}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { moved, warnings }
}

export function readPlannerManifestEntity(workspaceDir: string): PlannerManifest | null {
  const path = plannerManifestPath(workspaceDir)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PlannerManifest
  } catch {
    return null
  }
}

export const PLANNER_MANIFEST_PROMPT_RULE = `**Planner manifest (mandatory):** Your FIRST output block must be a JSON code fence with:
\`\`\`json
{ "outputDirectory": ".", "files": [{ "path": "relative/output/path.md" }] }
\`\`\`
List every file you will create with exact relative paths. Code will hard-move stray workspace-root files into these paths after your turn.`
