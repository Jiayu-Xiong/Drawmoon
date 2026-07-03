import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

import type { WorkflowNode } from "../schema/types.js"
import { readNodeArchetype } from "./context/write-capability.js"

const DEFAULT_SUBMIT_ARTIFACTS = [
  "iclr2026/build/round1.pdf",
  "iclr2026/figures/fig1.png",
  "iclr2026/figures/fig2.png",
]

export function gateRequiredArtifacts(node: WorkflowNode): string[] {
  if (readNodeArchetype(node) !== "gate") return []
  const fromMeta = (node.metadata as { gateRequiredArtifacts?: string[] } | undefined)?.gateRequiredArtifacts
  if (fromMeta?.length) return fromMeta
  return DEFAULT_SUBMIT_ARTIFACTS
}

export function missingGateArtifacts(workspaceDir: string, node: WorkflowNode): string[] {
  const required = gateRequiredArtifacts(node)
  const root = resolve(workspaceDir)
  return required.filter((rel) => !existsSync(join(root, rel.replace(/\\/g, "/"))))
}
