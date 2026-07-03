import { isAbsolute, normalize, resolve } from "node:path"

/** Normalize a relative path to forward slashes; reject escapes and absolute paths. */
export function normalizeRelativePath(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, "/")
  if (!trimmed || trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) return null
  const parts = trimmed.split("/").filter((p) => p.length > 0)
  if (parts.some((p) => p === "..")) return null
  return parts.join("/")
}

export function parentDirsOf(dest: string): string[] {
  const parts = dest.split("/").filter(Boolean)
  if (parts.length <= 1) return []
  const dirs: string[] = []
  for (let i = 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"))
  }
  return dirs
}

export function isUnderWriteRoot(rel: string, writeRoot: string): boolean {
  const root = normalizeRelativePath(writeRoot) ?? "."
  if (root !== "." && rel !== root && !rel.startsWith(`${root}/`)) return false
  return normalizeRelativePath(rel) !== null
}

export function resolveUnderWorkspace(workspaceDir: string, rel: string): string {
  return resolve(workspaceDir, rel.replace(/\\/g, "/"))
}

export function isFlatRootPath(rel: string): boolean {
  const norm = normalizeRelativePath(rel)
  if (!norm) return false
  return !norm.includes("/")
}
