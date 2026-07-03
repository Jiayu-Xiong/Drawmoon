/**
 * Start ICML→TMM workflow from frontend package (has Solid deps resolved).
 * WORKFLOW_PAPER_CWD=C:\path\to\paper bun run scripts/start-tmm-run.ts
 */
import { join } from "node:path"
import { loadDrawmoonWorkflowTemplate } from "./load-drawmoon-template"
import { workflowToRuntimeGraph } from "../src/pages/console/shared/core"

const API = process.env.WORKFLOW_API ?? "http://127.0.0.1:3456"
const paperCwd = process.env.WORKFLOW_PAPER_CWD ?? join(import.meta.dirname, "../../../..", "paper")

async function main() {
  const template = loadDrawmoonWorkflowTemplate("icml-to-tmm-sinkhorn")
  template.workingDirectory = paperCwd
  const graph = workflowToRuntimeGraph(template)

  console.log(`[start-tmm] cwd=${paperCwd} nodes=${graph.nodes.length} human-gate=${graph.nodes.some((n) => n.action?.kind === "human-gate")}`)

  const res = await fetch(`${API}/workflow-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId: template.id,
      name: `ICML→TMM ${new Date().toISOString().slice(0, 16)}`,
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
  console.log(`[start-tmm] run=${runId} status=${body.run.status}`)
  console.log(`[start-tmm] open http://127.0.0.1:4322/#detail/run/${encodeURIComponent(runId)}`)

  let offset = 0
  const poll = setInterval(async () => {
    try {
      const eventsRes = await fetch(`${API}/workflow-runs/${runId}/events`)
      const payload = await eventsRes.json() as { events?: Array<{ type: string; nodeId?: string }> }
      const list = payload.events ?? []
      for (; offset < list.length; offset++) {
        const ev = list[offset]!
        if (["node_started", "node_completed", "node_failed", "node_paused", "workflow_paused"].includes(ev.type)) {
          console.log(`[event] ${ev.type} ${ev.nodeId ?? ""}`)
        }
      }
      const runRes = await fetch(`${API}/workflow-runs/${runId}?view=light`)
      const run = (await runRes.json() as { run: { status: string; error?: string } }).run
      if (run.status === "paused" && run.error === "human-review") {
        console.log("[start-tmm] ✓ human gate paused — click 送审并继续 in UI")
        clearInterval(poll)
      } else if (["success", "failed", "cancelled"].includes(run.status)) {
        console.log(`[start-tmm] done status=${run.status}`)
        clearInterval(poll)
      }
    } catch (error) {
      console.warn("[poll]", error)
    }
  }, 2500)

  setTimeout(() => clearInterval(poll), 60 * 60 * 1000)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
