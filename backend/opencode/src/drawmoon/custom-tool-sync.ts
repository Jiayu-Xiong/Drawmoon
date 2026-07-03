import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

import { readLibraryManifest } from "./library.js"
import { drawmoonToolsDir } from "./paths.js"

/** Copy drawmoon custom tool .ts files into workspace .opencode/tools/ for OpenCode runtime. */
export function syncDrawmoonCustomToolsToWorkspace(workspaceDir: string, toolIds?: string[]) {
  const allow = toolIds ? new Set(toolIds) : null
  const manifest = readLibraryManifest()
  const destDir = join(workspaceDir, ".opencode", "tools")
  mkdirSync(destDir, { recursive: true })
  let copied = 0
  for (const tool of manifest.tools) {
    if (allow && !allow.has(tool.id)) continue
    const src = join(drawmoonToolsDir(), `${tool.id}.ts`)
    if (!existsSync(src)) continue
    copyFileSync(src, join(destDir, `${tool.id}.ts`))
    copied++
  }
  return copied
}

export function listCustomToolIdsInWorkspace(workspaceDir: string): string[] {
  const dir = join(workspaceDir, ".opencode", "tools")
  if (!existsSync(dir)) return []
  return readLibraryManifest().tools
    .filter((tool) => existsSync(join(dir, `${tool.id}.ts`)))
    .map((tool) => tool.id)
}
