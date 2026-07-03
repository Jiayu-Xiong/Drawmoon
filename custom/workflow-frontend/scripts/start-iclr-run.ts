/**
 * Start AudioRWKV→ICLR workflow.
 * WORKFLOW_PAPER_CWD=/path/to/paper bun run scripts/start-iclr-run.ts
 */
import { join } from "node:path"
import { loadDrawmoonWorkflowTemplate } from "./load-drawmoon-template"
import { ensureAgentModeTemplatesRegistered } from "../src/data/agent-mode-templates"
import { ensureCliTemplatesRegistered } from "../src/data/cli-templates"
import { ensureLlmApiTemplatesRegistered } from "../src/data/llm-api-templates"
import { workflowToRuntimeGraph } from "../src/pages/console/shared/core"

ensureCliTemplatesRegistered()
ensureAgentModeTemplatesRegistered()
ensureLlmApiTemplatesRegistered()

const API = process.env.WORKFLOW_API ?? "http://127.0.0.1:3456"
const paperCwd = process.env.WORKFLOW_PAPER_CWD ?? join(import.meta.dirname, "../../../..", "paper")

async function preflightPaperInputs() {
  const { existsSync } = await import("node:fs")
  const { resolve } = await import("node:path")
  const src = resolve(paperCwd, "audiorwkv", "PRL", "cas-dc-template.tex")
  if (!existsSync(src)) {
    console.error(`[preflight] missing source: ${src}`)
    console.error(`[preflight] set WORKFLOW_PAPER_CWD=${paperCwd}`)
    process.exit(1)
  }
  console.log(`[preflight] ok source=${src}`)
}

async function main() {
  await preflightPaperInputs()
  const template = loadDrawmoonWorkflowTemplate("audiorwkv-iclr-pyramid")
  const graph = workflowToRuntimeGraph(template)

  const models = Object.fromEntries(
    graph.nodes
      .filter((n) => n.config?.model && n.config?.llmApi)
      .map((n) => [n.id, n.config!.model]),
  )
  console.log(`[start-iclr] paper=${paperCwd} nodes=${graph.nodes.length}`)
  console.log(`[start-iclr] key models:`, {
    "architect-plan": models["architect-plan"],
    "round1-merge": models["round1-merge"],
    "revision-plan": models["revision-plan"],
    "revision-major": models["revision-major"],
    "final-pdf": models["final-pdf"],
  })

  const res = await fetch(`${API}/workflow-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      templateId: template.id,
      name: `ICLR Pyramid ${new Date().toISOString().slice(0, 16)}`,
      graph,
      bypassCache: true,
    }),
  })
  if (!res.ok) {
    console.error(await res.text())
    process.exit(1)
  }
  const body = await res.json() as { run: { id: string; status: string } }
  const runId = body.run.id
  console.log(`[start-iclr] run=${runId} status=${body.run.status}`)
  console.log(`[start-iclr] workspace ~/.drawmoon/workflow/ (audiorwkv linked from ${paperCwd})`)
  console.log(`[start-iclr] open http://127.0.0.1:4322/#detail/run/${encodeURIComponent(runId)}`)

  let offset = 0
  let lastNode = ""
  const poll = setInterval(async () => {
    try {
      const eventsRes = await fetch(`${API}/workflow-runs/${runId}/events`)
      const payload = await eventsRes.json() as { events?: Array<{ type: string; nodeId?: string; error?: string }> }
      const list = payload.events ?? []
      for (; offset < list.length; offset++) {
        const ev = list[offset]!
        if (["node_started", "node_completed", "node_failed", "node_paused", "workflow_paused", "workflow_failed"].includes(ev.type)) {
          const line = `[event] ${ev.type} ${ev.nodeId ?? ""}${ev.error ? ` — ${ev.error}` : ""}`
          console.log(line)
          if (ev.nodeId) lastNode = ev.nodeId
        }
      }
      const runRes = await fetch(`${API}/workflow-runs/${runId}?view=light`)
      const run = (await runRes.json() as { run: { status: string; error?: string; currentNodeIds?: string[] } }).run
      if (run.status === "paused" && run.error === "human-review") {
        console.log("[start-iclr] ✓ human gate — review round1.pdf in UI then continue")
        clearInterval(poll)
      } else if (run.status === "paused" && run.error === "inquiry-pending") {
        console.log("[start-iclr] ✓ planner inquiry — answer questions in UI (no time limit); timer frozen while paused")
        clearInterval(poll)
      } else if (["success", "failed", "cancelled", "completed"].includes(run.status)) {
        console.log(`[start-iclr] done status=${run.status}${run.error ? ` error=${run.error}` : ""}`)
        clearInterval(poll)
      } else if (run.currentNodeIds?.length) {
        const active = run.currentNodeIds.join(",")
        if (active !== lastNode) console.log(`[active] ${active}`)
      }
    } catch (error) {
      console.warn("[poll]", error)
    }
  }, 3000)

  setTimeout(() => clearInterval(poll), 4 * 60 * 60 * 1000)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
