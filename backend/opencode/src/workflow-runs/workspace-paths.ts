import { existsSync, mkdirSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"

import { drawmoonRoot, drawmoonWorkflowDir } from "../drawmoon/paths.js"

const WORKSPACE_PREFIX = "workflow/"

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "run"
}

/** Unique folder name under ~/.drawmoon/workflow/ */
export function allocateWorkflowWorkspaceKey(templateId: string, runId: string) {
  const base = slugify(templateId || "workflow")
  const suffix = runId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase() || "run"
  let key = `${base}-${suffix}`
  let index = 1
  while (existsSync(join(drawmoonWorkflowDir(), key))) {
    key = `${base}-${suffix}-${index}`
    index += 1
  }
  return key
}

export function workflowWorkspaceAbsPath(workspaceKey: string) {
  return join(drawmoonWorkflowDir(), workspaceKey)
}

export function workflowWorkspaceRelativePath(workspaceKey: string, fileName = "") {
  const base = `${WORKSPACE_PREFIX}${workspaceKey}`
  if (!fileName) return base
  return `${base}/${fileName.replace(/^\/+/, "")}`
}

export function ensureWorkflowWorkspace(workspaceKey: string) {
  const dir = workflowWorkspaceAbsPath(workspaceKey)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function resolveWorkflowWorkspace(record: {
  id: string
  history: { workingDirectoryKey?: string; workingDirectory?: string }
}) {
  const key = record.history.workingDirectoryKey
  if (key) return workflowWorkspaceAbsPath(key)

  const stored = record.history.workingDirectory?.trim()
  if (!stored) return null

  if (isAbsolute(stored)) return stored

  const normalized = stored.replace(/\\/g, "/").replace(/^\/+/, "")
  if (normalized.startsWith(WORKSPACE_PREFIX) || normalized.startsWith("workflow/")) {
    return join(drawmoonRoot(), normalized)
  }
  return resolve(stored)
}

export function workflowArtifactHref(workspaceKey: string, fileName: string) {
  const clean = fileName.replace(/^\/+/, "").replace(/^workflow\/[^/]+\//, "")
  return `/workflow-output/${workflowWorkspaceRelativePath(workspaceKey, clean)}`
}

export function parseWorkspaceKeyFromPath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "")
  const match = normalized.match(/^workflow\/([^/]+)(?:\/|$)/)
  return match?.[1] ?? null
}
