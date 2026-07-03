import { existsSync } from "node:fs"
import { join } from "node:path"

import type { WorkflowNode } from "../../schema/types.js"
import { mergeContract } from "./archetypes.js"
import type { WorkflowNodeContextMeta } from "./types.js"
import { isBinaryArtifactPath, validateBinaryArtifact } from "../binary-artifacts.js"
import { declaredArtifactPath } from "../node-output-files.js"

export function validatePlannerBlocked(text: string): string | null {
  if (/does not expose filesystem|I'm blocked|No files were read or written|spawn task/i.test(text)) {
    return "Agent reported blocked filesystem access; deliverables not created"
  }
  return null
}

export function validateDeclaredOutputs(workspaceDir: string, node: WorkflowNode, text: string): string | null {
  const blocked = validatePlannerBlocked(text)
  if (blocked) return blocked

  const meta = node.metadata as WorkflowNodeContextMeta | undefined
  const contract = mergeContract(meta?.archetype, meta?.contract)
  const critical = (contract?.outputs ?? []).filter((o) => (o.criticality ?? "isolated") === "critical")
  const missingCritical = critical.filter((o) => !existsSync(join(workspaceDir, o.path)))
  if (missingCritical.length) {
    return `Node "${node.id}" missing critical outputs: ${missingCritical.map((o) => o.path).join(", ")}`
  }

  const binaryPaths = new Set<string>()
  for (const out of contract?.outputs ?? []) {
    if (isBinaryArtifactPath(out.path)) binaryPaths.add(out.path)
  }
  const declared = declaredArtifactPath(node)
  if (declared) binaryPaths.add(declared)

  for (const rel of binaryPaths) {
    const abs = join(workspaceDir, rel)
    if (!existsSync(abs)) continue
    const err = validateBinaryArtifact(abs, rel)
    if (err) return `Node "${node.id}" ${err}`
  }

  return null
}
