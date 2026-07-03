import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

import { xyMonorepoRoot } from "../lib/monorepo-paths.js"
import type { WorkflowGraph } from "../schema/types.js"
import {
  enrichWorkflowGraphReadAccess,
  resolveDefaultPaperReadDirectory,
  resolveInputMounts,
  resolveReadDirectory,
  resolveWorkflowDirs,
} from "./workspace-dirs.js"

const paperRoot = resolve(xyMonorepoRoot(), "paper")
const audiorwkvTex = join(paperRoot, "audiorwkv", "PRL", "cas-dc-template.tex")

function minimalGraph(overrides: Partial<WorkflowGraph> = {}): WorkflowGraph {
  return {
    nodes: [],
    edges: [],
    inputMounts: [{ name: "audiorwkv", path: "audiorwkv" }],
    ...overrides,
  }
}

describe("resolveDefaultPaperReadDirectory", () => {
  test("falls back to repo paper/ when env unset", () => {
    const prev = process.env.WORKFLOW_PAPER_CWD
    delete process.env.WORKFLOW_PAPER_CWD
    try {
      const dir = resolveDefaultPaperReadDirectory()
      if (existsSync(paperRoot)) {
        expect(dir).toBe(paperRoot)
      }
    } finally {
      if (prev) process.env.WORKFLOW_PAPER_CWD = prev
    }
  })
})

describe("enrichWorkflowGraphReadAccess", () => {
  test("adds mount-scoped readRoots only (not sibling paper trees)", () => {
    if (!existsSync(paperRoot)) return
    const graph = minimalGraph()
    enrichWorkflowGraphReadAccess(graph)
    expect(graph.readDirectory).toBe(paperRoot)
    expect(graph.readRoots).toContain(join(paperRoot, "audiorwkv"))
    expect(graph.readRoots).not.toContain(paperRoot)
  })

  test("resolveWorkflowDirs exposes audiorwkv source mount", () => {
    if (!existsSync(audiorwkvTex)) return
    const graph = minimalGraph()
    enrichWorkflowGraphReadAccess(graph)
    const dirs = resolveWorkflowDirs(graph, {}, join(paperRoot, "..", "workflow", "test-run"))
    expect(dirs.readDir).toBe(paperRoot)
    expect(dirs.mounts).toEqual([{
      name: "audiorwkv",
      source: join(paperRoot, "audiorwkv"),
    }])
    expect(dirs.readRoots).toContain(join(paperRoot, "audiorwkv"))
    expect(dirs.readRoots).not.toContain(paperRoot)
  })

  test("resolveReadDirectory honors explicit graph override", () => {
    const custom = "D:\\custom\\paper"
    const graph = minimalGraph({ readDirectory: custom })
    expect(resolveReadDirectory(graph, {})).toBe(resolve(custom))
  })
})

describe("resolveInputMounts", () => {
  test("resolves relative mount path under readDirectory", () => {
    const mounts = resolveInputMounts(paperRoot, [{ name: "audiorwkv", path: "audiorwkv" }])
    expect(mounts[0]?.source).toBe(join(paperRoot, "audiorwkv"))
  })

  test("returns empty when readDirectory missing", () => {
    expect(resolveInputMounts(null, [{ name: "audiorwkv", path: "audiorwkv" }])).toEqual([])
  })
})
