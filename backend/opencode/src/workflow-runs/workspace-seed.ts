import { existsSync, symlinkSync } from "node:fs"
import { join, resolve } from "node:path"

/** Link or copy a read-only tree into the workflow entity output directory. */
export interface WorkspaceInputMount {
  /** Directory name under the output workspace, e.g. `inputs/foo`. */
  name: string
  /** Absolute path to the source file or directory. */
  source: string
}

export interface WorkspaceSeedOptions {
  /**
   * read-roots — do not create symlinks/copies; callers rely on WORKFLOW_ALLOWED_READ_ROOTS.
   * symlink — optional junction/symlink for OpenCode vendor read under workspace cwd (never copies).
   */
  mode?: "read-roots" | "symlink"
}

export interface WorkspaceSeedResult {
  ok: boolean
  outputDir: string
  error?: string
  skipped?: boolean
}

function resolveSeedMode(options: WorkspaceSeedOptions = {}): "read-roots" | "symlink" {
  if (options.mode) return options.mode
  const env = process.env.WORKFLOW_INPUT_MOUNT_MODE?.trim().toLowerCase()
  if (env === "symlink") return "symlink"
  return "read-roots"
}

function mountSymlink(outputDir: string, mount: WorkspaceInputMount): void {
  const dst = join(outputDir, mount.name)
  const src = resolve(mount.source)
  if (existsSync(dst)) return
  if (!existsSync(src)) {
    throw new Error(`Input mount source missing: ${src} → ${dst}`)
  }
  symlinkSync(src, dst, process.platform === "win32" ? "junction" : "dir")
  console.log(`[workspace-seed] ${dst} → ${src}`)
}

/** Apply template-declared input mounts into the entity output directory. */
export function seedWorkflowWorkspace(
  outputDir: string,
  mounts: WorkspaceInputMount[] = [],
  options: WorkspaceSeedOptions = {},
): WorkspaceSeedResult {
  const out = resolve(outputDir)
  const mode = resolveSeedMode(options)
  if (!mounts.length) return { ok: true, outputDir: out }
  if (mode === "read-roots") {
    console.log(`[workspace-seed] read-roots mode — ${mounts.length} mount(s) readable via WORKFLOW_ALLOWED_READ_ROOTS (no copy)`)
    return { ok: true, outputDir: out, skipped: true }
  }
  try {
    for (const mount of mounts) {
      mountSymlink(out, mount)
    }
    return { ok: true, outputDir: out }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[workspace-seed] symlink mount failed (${message}); reads still allowed via read roots`)
    return { ok: true, outputDir: out, skipped: true }
  }
}
