import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"

import { restoreFromText } from "../context/reconcile.js"
import type { AllocationFile, AllocationPlan } from "./plan-schema.js"
import { normalizeRelativePath } from "./path-utils.js"

export interface MigrateResult {
  moved: string[]
  warnings: string[]
  missing: Array<{ flat: string; dest: string; producer: string }>
}

/** Move file within workspace; rename with copy+unlink fallback for cross-device. */
export function moveWithinWorkspace(sourceAbs: string, destAbs: string, options?: { overwrite?: boolean }): void {
  mkdirSync(dirname(destAbs), { recursive: true })
  if (existsSync(destAbs)) {
    if (!options?.overwrite) {
      throw new Error(`dest exists: ${destAbs}`)
    }
    copyFileSync(sourceAbs, destAbs)
    try { unlinkSync(sourceAbs) } catch { /* flat staging may remain */ }
    return
  }
  try {
    renameSync(sourceAbs, destAbs)
  } catch {
    copyFileSync(sourceAbs, destAbs)
    try { unlinkSync(sourceAbs) } catch { /* source may remain */ }
  }
  if (!existsSync(destAbs)) {
    throw new Error(`move failed: ${destAbs}`)
  }
}

function resolveFlatSource(
  workspaceDir: string,
  flat: string,
  producerNodeId: string,
  nodeText: string,
): string | null {
  const flatNorm = normalizeRelativePath(flat)
  if (!flatNorm) return null

  const flatAbs = join(workspaceDir, flatNorm)
  if (existsSync(flatAbs)) return flatAbs

  const nodeMd = join(workspaceDir, `${producerNodeId}.md`)
  if (existsSync(nodeMd)) return nodeMd

  const restored = restoreFromText(nodeText, flatNorm)
  if (restored) {
    writeFileSync(flatAbs, restored, "utf-8")
    return flatAbs
  }

  return null
}

function migrateOneFile(
  workspaceDir: string,
  entry: AllocationFile,
  nodeText: string,
): { moved?: string; warning?: string; missing?: { flat: string; dest: string; producer: string } } {
  const dest = normalizeRelativePath(entry.dest)
  const flat = normalizeRelativePath(entry.flat)
  if (!dest || !flat) {
    return { warning: `invalid paths for producer ${entry.producer}` }
  }

  const destAbs = join(workspaceDir, dest)
  const sourceAbs = resolveFlatSource(workspaceDir, flat, entry.producer, nodeText)
  if (!sourceAbs) {
    if (existsSync(destAbs)) return {}
    return { missing: { flat: entry.flat, dest: entry.dest, producer: entry.producer } }
  }

  const replacing = existsSync(destAbs)
  if (replacing) {
    const srcSize = statSync(sourceAbs).size
    const destSize = statSync(destAbs).size
    if (srcSize <= destSize) {
      try {
        if (readFileSync(sourceAbs, "utf-8") === readFileSync(destAbs, "utf-8")) {
          try { unlinkSync(sourceAbs) } catch { /* ignore */ }
          return { moved: `${flat} → ${dest} (already up to date)` }
        }
      } catch { /* fall through to overwrite */ }
      if (srcSize < destSize) {
        return { warning: `${flat} not migrated: dest ${dest} is larger (${destSize} vs ${srcSize} bytes)` }
      }
    }
  }

  moveWithinWorkspace(sourceAbs, destAbs, { overwrite: replacing })
  return { moved: replacing ? `${flat} → ${dest} (replaced shell)` : `${flat} → ${dest}` }
}

/** Migrate all plan entries for a given producer node after it completes. */
export function migrateProducerOutputs(
  workspaceDir: string,
  plan: AllocationPlan,
  producerNodeId: string,
  nodeText: string,
): MigrateResult {
  const moved: string[] = []
  const warnings: string[] = []
  const missing: MigrateResult["missing"] = []

  const entries = plan.files.filter((f) => f.producer === producerNodeId)
  for (const entry of entries) {
    const result = migrateOneFile(workspaceDir, entry, nodeText)
    if (result.moved) moved.push(result.moved)
    if (result.warning) warnings.push(result.warning)
    if (result.missing) missing.push(result.missing)
  }

  return { moved, warnings, missing }
}

/** Re-run flat→dest migration for every producer in a plan (repair / idempotent). */
export function remigrateWorkspacePlan(workspaceDir: string, plan: AllocationPlan): MigrateResult {
  const moved: string[] = []
  const warnings: string[] = []
  const missing: MigrateResult["missing"] = []
  const producers = [...new Set(plan.files.map((f) => f.producer))]
  for (const producerNodeId of producers) {
    const result = migrateProducerOutputs(workspaceDir, plan, producerNodeId, "")
    moved.push(...result.moved)
    warnings.push(...result.warnings)
    missing.push(...result.missing)
  }
  return { moved, warnings, missing }
}

/** After all producers complete, verify critical allocation entries exist at dest. */
export function missingCriticalAllocations(
  workspaceDir: string,
  plan: AllocationPlan,
): Array<{ flat: string; dest: string; producer: string }> {
  const missing: Array<{ flat: string; dest: string; producer: string }> = []
  for (const entry of plan.files) {
    const criticality = entry.criticality ?? "critical"
    if (criticality === "optional") continue
    const dest = normalizeRelativePath(entry.dest)
    if (!dest) continue
    if (!existsSync(join(workspaceDir, dest))) {
      missing.push({ flat: entry.flat, dest: entry.dest, producer: entry.producer })
    }
  }
  return missing
}
