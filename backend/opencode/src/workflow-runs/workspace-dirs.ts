import { existsSync } from "node:fs"
import { join, resolve, isAbsolute } from "node:path"

import type { WorkflowGraph } from "../schema/types.js"
import { xyMonorepoRoot } from "../lib/monorepo-paths.js"
import type { WorkflowRunStartOptions } from "./types.js"
import type { WorkspaceInputMount } from "./workspace-seed.js"
import { parseWorkspaceKeyFromPath } from "./workspace-paths.js"

export interface WorkflowInputMountSpec {
  name: string
  /** Path relative to readDirectory, or absolute. */
  path: string
}

export interface ResolvedWorkflowDirs {
  outputDir: string
  readDir: string | null
  /** Whole-run read whitelist (absolute paths). */
  readRoots: string[]
  mounts: WorkspaceInputMount[]
}

/** Repo-local paper tree used when graph/options/env do not set readDirectory. */
export function resolveDefaultPaperReadDirectory(): string | null {
  const env = process.env.WORKFLOW_PAPER_CWD?.trim()
  if (env) return resolve(env)
  const fallback = resolve(xyMonorepoRoot(), "paper")
  return existsSync(fallback) ? fallback : null
}

/**
 * Ensure templates with inputMounts get a readDirectory + readRoots without frontend changes.
 * Mount sources are whitelisted for workflow-io / MCP reads in place (no copy into workspace).
 */
export function enrichWorkflowGraphReadAccess(graph: WorkflowGraph): WorkflowGraph {
  if (!graph.readDirectory?.trim()) {
    const readDir = resolveDefaultPaperReadDirectory()
    if (readDir) graph.readDirectory = readDir
  }
  const readDir = resolveReadDirectory(graph, {})
  const mounts = resolveInputMounts(readDir, graph.inputMounts)
  const roots = new Set((graph.readRoots ?? []).map((entry) => resolve(entry.trim())).filter(Boolean))
  if (mounts.length) {
    for (const mount of mounts) roots.add(resolve(mount.source))
  } else if (readDir) {
    roots.add(resolve(readDir))
  }
  if (roots.size) graph.readRoots = [...roots]
  return graph
}

export function resolveReadRoots(
  graph: WorkflowGraph,
  options: WorkflowRunStartOptions,
  readDir: string | null,
  mounts: WorkspaceInputMount[] = [],
): string[] {
  const roots = new Set<string>()
  for (const entry of graph.readRoots ?? []) {
    const trimmed = entry.trim()
    if (trimmed) roots.add(resolve(trimmed))
  }
  for (const entry of options.readRoots ?? []) {
    const trimmed = entry.trim()
    if (trimmed) roots.add(resolve(trimmed))
  }
  if (mounts.length) {
    for (const mount of mounts) roots.add(resolve(mount.source))
  } else if (readDir) {
    roots.add(resolve(readDir))
  }
  return [...roots]
}

export function resolveReadDirectory(
  graph: WorkflowGraph,
  options: WorkflowRunStartOptions,
): string | null {
  const fromGraph = graph.readDirectory?.trim()
  if (fromGraph) return resolve(fromGraph)
  const fromOpt = options.readDirectory?.trim()
  if (fromOpt) return resolve(fromOpt)
  const legacy = options.workingDirectory?.trim()
  if (legacy && !parseWorkspaceKeyFromPath(legacy) && !legacy.replace(/\\/g, "/").startsWith("workflow/")) {
    return resolve(legacy)
  }
  return resolveDefaultPaperReadDirectory()
}

export function resolveInputMounts(
  readDir: string | null,
  specs: WorkflowInputMountSpec[] | undefined,
): WorkspaceInputMount[] {
  if (!readDir || !specs?.length) return []
  const root = resolve(readDir)
  return specs.map((spec) => ({
    name: spec.name,
    source: isAbsolute(spec.path) ? resolve(spec.path) : join(root, spec.path),
  }))
}

export function resolveWorkflowDirs(
  graph: WorkflowGraph,
  options: WorkflowRunStartOptions,
  outputDir: string,
): ResolvedWorkflowDirs {
  const readDir = resolveReadDirectory(graph, options)
  const mounts = resolveInputMounts(readDir, graph.inputMounts)
  const readRoots = resolveReadRoots(graph, options, readDir, mounts)
  return { outputDir: resolve(outputDir), readDir, readRoots, mounts }
}
