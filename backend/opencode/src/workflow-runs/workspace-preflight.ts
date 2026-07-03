import { existsSync } from "node:fs"
import { resolve } from "node:path"

import type { WorkspaceInputMount } from "./workspace-seed.js"

export interface WorkflowDirs {
  outputDir: string
  readDir: string | null
  mounts?: WorkspaceInputMount[]
}

export interface WorkspacePreflightResult {
  ok: boolean
  error?: string
  dirs: WorkflowDirs
}

/** Fail before any LLM call if configured read/output dirs are unusable. */
export function validateWorkflowDirs(dirs: WorkflowDirs): WorkspacePreflightResult {
  const outputDir = resolve(dirs.outputDir)
  if (!existsSync(outputDir)) {
    return { ok: false, error: `Output directory missing: ${outputDir}`, dirs: { outputDir, readDir: dirs.readDir } }
  }
  const readDir = dirs.readDir?.trim() ? resolve(dirs.readDir) : null
  if (readDir && !existsSync(readDir)) {
    return { ok: false, error: `Read directory missing: ${readDir}`, dirs: { outputDir, readDir } }
  }
  for (const mount of dirs.mounts ?? []) {
    const src = resolve(mount.source)
    if (!existsSync(src)) {
      return {
        ok: false,
        error: `Input mount source missing: ${src} (mount "${mount.name}")`,
        dirs: { outputDir, readDir },
      }
    }
  }
  return { ok: true, dirs: { outputDir, readDir } }
}
