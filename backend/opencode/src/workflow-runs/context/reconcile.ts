import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"

import type { WorkflowNode } from "../../schema/types.js"
import type { Blackboard } from "./blackboard.js"
import { resolveWorkspaceFile } from "./resolver.js"
import type { NodeContractOutput, OutputCriticality } from "./types.js"
import { mergeContract } from "./archetypes.js"
import type { WorkflowNodeContextMeta } from "./types.js"
import { isBinaryArtifactPath, validateBinaryArtifact } from "../binary-artifacts.js"

export interface ReconcileResult {
  ok: boolean
  missing: Array<{ key: string; path: string }>
  warnings: string[]
}

/** Extract file body from node stdout for zero-token restore. */
export function restoreFromText(nodeText: string, outputPath: string): string | null {
  const trimmed = nodeText.trim()
  if (!trimmed) return null
  const ext = outputPath.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "tex" || ext === "latex") {
    const blocks = [...trimmed.matchAll(/```(?:latex|tex)\s*([\s\S]*?)```/gi)]
    if (blocks.length) return blocks[blocks.length - 1]![1]!.trim()
    return trimmed
  }
  if (ext === "md") return trimmed
  if (ext) {
    const re = new RegExp(`\`\`\`${ext}\\s*([\\s\\S]*?)\`\`\``, "i")
    const m = trimmed.match(re)
    if (m?.[1]) return m[1].trim()
  }
  const anyBlock = trimmed.match(/```[\w]*\s*([\s\S]*?)```/)
  if (anyBlock?.[1]) return anyBlock[1].trim()
  return trimmed
}

function listRecentFiles(root: string, sinceMs: number, depth = 0): string[] {
  if (depth > 6) return []
  const out: string[] = []
  let entries: string[]
  try { entries = readdirSync(root) } catch { return out }
  for (const entry of entries) {
    if (entry === ".workflow") continue
    const full = join(root, entry)
    try {
      const st = statSync(full)
      if (st.isDirectory()) out.push(...listRecentFiles(full, sinceMs, depth + 1))
      else if (st.mtimeMs >= sinceMs) out.push(relative(root, full).replace(/\\/g, "/"))
    } catch { /* skip */ }
  }
  return out
}

function findCandidate(workspaceDir: string, canonical: string, startedAtMs: number): string | null {
  const base = canonical.split("/").pop()
  if (!base) return null
  const direct = resolveWorkspaceFile(workspaceDir, canonical)
  if (direct.exists) return direct.path
  const sibling = resolveWorkspaceFile(workspaceDir, base)
  if (sibling.exists) return sibling.path
  const recent = listRecentFiles(workspaceDir, startedAtMs)
  return recent.find((p) => p.endsWith(`/${base}`) || p === base) ?? null
}

export function saveRawOutput(workspaceDir: string, nodeId: string, text: string) {
  const dir = join(workspaceDir, ".workflow", "raw")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${nodeId}.md`), text, "utf-8")
}

export function readRawOutput(workspaceDir: string, nodeId: string): string | null {
  const path = join(workspaceDir, ".workflow", "raw", `${nodeId}.md`)
  if (!existsSync(path)) return null
  try { return readFileSync(path, "utf-8").trim() } catch { return null }
}

export function reconcileNodeOutputs(
  workspaceDir: string,
  node: WorkflowNode,
  blackboard: Blackboard,
  startedAtMs: number,
  nodeText?: string,
): ReconcileResult {
  const meta = node.metadata as WorkflowNodeContextMeta | undefined
  const contract = mergeContract(meta?.archetype, meta?.contract)
  const outputs = contract?.outputs ?? []
  const warnings: string[] = []
  const missing: Array<{ key: string; path: string }> = []
  const text = nodeText ?? readRawOutput(workspaceDir, node.id) ?? ""

  for (const out of outputs) {
    reconcileOne(workspaceDir, node.id, blackboard, out, startedAtMs, text, warnings, missing)
  }

  if (!outputs.length && meta?.outputFile) {
    reconcileOne(workspaceDir, node.id, blackboard, { key: node.id, path: meta.outputFile, criticality: "isolated" }, startedAtMs, text, warnings, missing)
  }

  return { ok: missing.length === 0, missing, warnings }
}

function reconcileOne(
  workspaceDir: string,
  nodeId: string,
  blackboard: Blackboard,
  out: NodeContractOutput,
  startedAtMs: number,
  nodeText: string,
  warnings: string[],
  missing: Array<{ key: string; path: string }>,
) {
  const canonical = out.path.replace(/\\/g, "/")
  const target = join(workspaceDir, canonical)
  const candidate = findCandidate(workspaceDir, canonical, startedAtMs)

  if (existsSync(target) && candidate && candidate !== canonical) {
    try {
      const candAbs = join(workspaceDir, candidate)
      const srcSize = statSync(candAbs).size
      const destSize = statSync(target).size
      if (srcSize > destSize) {
        copyFileSync(candAbs, target)
        warnings.push(`Replaced shell ${canonical} from ${candidate} (${srcSize}B > ${destSize}B)`)
        blackboard.put({ key: out.key, path: canonical, producerNodeId: nodeId, reconciled: true })
        return
      }
    } catch { /* keep existing dest */ }
  }

  if (existsSync(target)) {
    if (isBinaryArtifactPath(canonical)) {
      const invalid = validateBinaryArtifact(target, canonical)
      if (invalid) {
        missing.push({ key: out.key, path: canonical })
        warnings.push(`Rejected stub binary: ${invalid}`)
        return
      }
    }
    blackboard.put({ key: out.key, path: canonical, producerNodeId: nodeId, reconciled: false })
    return
  }

  if (candidate) {
    if (candidate !== canonical) {
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(join(workspaceDir, candidate), target)
      warnings.push(`Reconciled ${candidate} → ${canonical}`)
    }
    blackboard.put({ key: out.key, path: canonical, producerNodeId: nodeId, reconciled: candidate !== canonical })
    return
  }

  const restored = restoreFromText(nodeText, canonical)
  if (restored && !isBinaryArtifactPath(canonical)) {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, restored, "utf-8")
    warnings.push(`Restored from node text → ${canonical}`)
    blackboard.put({ key: out.key, path: canonical, producerNodeId: nodeId, reconciled: true })
    return
  }

  missing.push({ key: out.key, path: canonical })
}

export function worstCriticality(paths: string[], outputs: NodeContractOutput[]): OutputCriticality {
  let worst: OutputCriticality = "optional"
  for (const path of paths) {
    const spec = outputs.find((o) => o.path === path)
    const c = spec?.criticality ?? "isolated"
    if (c === "critical") return "critical"
    if (c === "isolated") worst = "isolated"
  }
  return worst
}

export function repairStillMissing(
  workspaceDir: string,
  node: WorkflowNode,
  blackboard: Blackboard,
): Array<{ key: string; path: string }> {
  return reconcileNodeOutputs(workspaceDir, node, blackboard, 0).missing
}
