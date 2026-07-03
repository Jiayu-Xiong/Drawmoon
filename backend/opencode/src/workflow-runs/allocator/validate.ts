import type { WorkflowGraph } from "../../schema/types.js"
import type { AllocationPlan } from "./plan-schema.js"
import { normalizeRelativePath, parentDirsOf, isFlatRootPath } from "./path-utils.js"

export interface ValidationResult {
  ok: boolean
  errors: string[]
  /** Folders from plan plus any parent dirs implied by dest paths. */
  effectiveFolders: string[]
}

export function validateAllocationPlan(plan: AllocationPlan, graph: WorkflowGraph): ValidationResult {
  const errors: string[] = []
  const nodeIds = new Set(graph.nodes.map((n) => n.id))

  const writeRoot = normalizeRelativePath(plan.writeRoot ?? ".")
  if (writeRoot !== ".") {
    errors.push(`writeRoot must be "." (got "${plan.writeRoot}")`)
  }

  const destSet = new Set<string>()
  const flatSet = new Set<string>()

  for (const file of plan.files ?? []) {
    const dest = normalizeRelativePath(file.dest)
    const flat = normalizeRelativePath(file.flat)
    if (!dest) {
      errors.push(`invalid dest path: "${file.dest}"`)
      continue
    }
    if (!flat) {
      errors.push(`invalid flat path: "${file.flat}"`)
      continue
    }
    if (!isFlatRootPath(flat)) {
      errors.push(`flat must be a root-level filename (no subdirs): "${file.flat}"`)
    }
    if (destSet.has(dest)) errors.push(`duplicate dest: "${dest}"`)
    else destSet.add(dest)
    if (flatSet.has(flat)) errors.push(`duplicate flat: "${flat}"`)
    else flatSet.add(flat)
    if (!nodeIds.has(file.producer)) {
      errors.push(`unknown producer node: "${file.producer}"`)
    }
  }

  const folderSet = new Set<string>()
  for (const folder of plan.folders ?? []) {
    const norm = normalizeRelativePath(folder)
    if (!norm) {
      errors.push(`invalid folder: "${folder}"`)
      continue
    }
    folderSet.add(norm)
  }

  for (const dest of destSet) {
    for (const parent of parentDirsOf(dest)) {
      folderSet.add(parent)
    }
  }

  const declaredFolders = new Set(
    (plan.folders ?? []).map((f) => normalizeRelativePath(f)).filter((f): f is string => Boolean(f)),
  )
  for (const needed of folderSet) {
    if (!declaredFolders.has(needed) && !(plan.folders ?? []).some((f) => normalizeRelativePath(f) === needed)) {
      // Auto-supplement is allowed; effectiveFolders includes implied parents
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    effectiveFolders: [...folderSet].sort(),
  }
}
