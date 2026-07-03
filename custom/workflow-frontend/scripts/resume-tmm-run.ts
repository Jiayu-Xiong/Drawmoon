/**
 * Resume a failed ICML→TMM run from a specific node (skips completed nodes).
 * Patches stored graph prompt for round1-merge before retry.
 * Usage: bun ./scripts/resume-tmm-run.ts <runId> [nodeId]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { loadDrawmoonWorkflowTemplate } from "./load-drawmoon-template"

const API = process.env.WORKFLOW_API ?? "http://127.0.0.1:3456"
const runId = process.argv[2]
const nodeId = process.argv[3] ?? "figure-render-1"

const round1MergePrompt = loadDrawmoonWorkflowTemplate("icml-to-tmm-sinkhorn")
  .nodes.find((node) => node.id === "round1-merge")?.promptPreview ?? ""

if (!runId) {
  console.error("Usage: bun ./scripts/resume-tmm-run.ts <runId> [nodeId]")
  process.exit(1)
}

const RUNS_DIR = join(homedir(), ".drawmoon", "runtime", "workflow-runs")
const WORKFLOW_ROOT = join(homedir(), ".drawmoon")

function patchStoredGraph(targetNodeId: string) {
  const runPath = join(RUNS_DIR, `${runId}.json`)
  const run = JSON.parse(readFileSync(runPath, "utf-8")) as {
    graph: { nodes: Array<{
      id: string
      config?: { prompt?: string }
      metadata?: { readRunFiles?: string[] }
      action?: { inputs?: { prompt?: string }; metadata?: { readRunFiles?: string[] } }
    }> }
    history?: { workingDirectory?: string }
    nodeStates?: Record<string, { id: string; status: string; startedAt: string | null; finishedAt: string | null }>
    nodeResults?: Record<string, unknown>
    completedNodeIds?: string[]
    currentNodeIds?: string[]
    status?: string
    error?: string | null
  }

  const node = run.graph.nodes.find((item) => item.id === targetNodeId)
  if (!node) throw new Error(`Node ${targetNodeId} not found in stored graph`)

  if (targetNodeId === "round1-merge") {
    node.config = { ...node.config, prompt: round1MergePrompt }
    node.metadata = { ...node.metadata, readRunFiles: ["journal-architecture.md"] }
    if (node.action) {
      node.action.inputs = { ...node.action.inputs, prompt: round1MergePrompt }
      node.action.metadata = { ...node.action.metadata, readRunFiles: ["journal-architecture.md"] }
    }

    const wsRel = run.history?.workingDirectory?.trim()
    if (wsRel) {
      const ws = join(WORKFLOW_ROOT, wsRel)
      mkdirSync(join(ws, "tmm", "figures"), { recursive: true })
      const fig1Src = ["figure-render-1.png", "figure-render-1-1.png"].find((name) => existsSync(join(ws, name)))
      const fig2Src = ["figure-render-2.png", "figure-render-2-1.png"].find((name) => existsSync(join(ws, name)))
      if (fig1Src) copyFileSync(join(ws, fig1Src), join(ws, "tmm", "figures", "fig1.png"))
      if (fig2Src) copyFileSync(join(ws, fig2Src), join(ws, "tmm", "figures", "fig2.png"))
      console.log(`[resume] staged figures: fig1<=${fig1Src ?? "missing"} fig2<=${fig2Src ?? "missing"}`)
    }

    run.nodeStates = run.nodeStates ?? {}
    run.nodeStates["submit-review-gate"] = {
      id: "submit-review-gate",
      status: "waiting",
      startedAt: null,
      finishedAt: null,
    }
    if (run.nodeResults) delete run.nodeResults["submit-review-gate"]
    if (run.completedNodeIds) {
      run.completedNodeIds = run.completedNodeIds.filter((id) => id !== "submit-review-gate")
    }
    run.currentNodeIds = []
    run.status = "paused"
    run.error = null
  }

  writeFileSync(runPath, JSON.stringify(run, null, 2), "utf-8")
  console.log(`[resume] patched stored graph for ${targetNodeId}`)
}

async function main() {
  if (nodeId === "round1-merge") {
    patchStoredGraph(nodeId)
  }

  const runRes = await fetch(`${API}/workflow-runs/${encodeURIComponent(runId)}?view=light`)
  if (!runRes.ok) {
    console.error(await runRes.text())
    process.exit(1)
  }
  const { run } = (await runRes.json()) as { run: { status: string; name?: string } }
  console.log(`[resume] run=${runId} was=${run.status} from=${nodeId}`)

  const res = await fetch(`${API}/workflow-runs/${encodeURIComponent(runId)}/retry-node`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeId }),
  })
  if (!res.ok) {
    console.error(await res.text())
    process.exit(1)
  }
  const body = (await res.json()) as { run: { id: string; status: string } }
  console.log(`[resume] status=${body.run.status}`)
  console.log(`[resume] UI http://127.0.0.1:4322/#detail/run/${encodeURIComponent(runId)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
