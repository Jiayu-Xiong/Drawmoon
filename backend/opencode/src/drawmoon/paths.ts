import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve, sep } from "node:path"

export function drawmoonRoot() {
  const dir = join(homedir(), ".drawmoon")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonApiPath() {
  return join(drawmoonRoot(), "api")
}

export function drawmoonRuntimeDir() {
  const dir = join(drawmoonRoot(), "runtime")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Runtime data (runs, sessions, cache) must live under ~/.drawmoon — never repo ./data. */
export function resolveRuntimeDataDir(requested?: string): string {
  const defaultDir = drawmoonRuntimeDir()
  if (!requested?.trim()) return defaultDir
  const abs = resolve(requested.trim())
  const root = resolve(drawmoonRoot())
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(
      `data-dir must be under ~/.drawmoon (got ${requested}; use ${defaultDir})`,
    )
  }
  return abs
}

export function drawmoonWorkflowOutputDir() {
  const dir = join(drawmoonRoot(), "workflow-output")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Per-run workspace roots: ~/.drawmoon/workflow/{key}/ */
export function drawmoonWorkflowDir() {
  const dir = join(drawmoonRoot(), "workflow")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonRegistryDir() {
  const dir = join(drawmoonRoot(), "registry")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonLibraryDir() {
  const dir = join(drawmoonRoot(), "library")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonSkillsDir() {
  const dir = join(drawmoonLibraryDir(), "skills")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonMcpDir() {
  const dir = join(drawmoonLibraryDir(), "mcp")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonToolsDir() {
  const dir = join(drawmoonLibraryDir(), "tools")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonTemplatesDir() {
  const dir = join(drawmoonRoot(), "templates")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonWorkflowTemplatesDir() {
  const dir = join(drawmoonTemplatesDir(), "workflows")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonNodeTemplatesDir() {
  const dir = join(drawmoonTemplatesDir(), "nodes")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function drawmoonProfilesDir() {
  const dir = join(drawmoonTemplatesDir(), "profiles")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
