/**
 * Start ICML→TMM run and verify NDJSON stream emits stdout chunks.
 */
import { join } from "node:path"
import { loadDrawmoonWorkflowTemplate } from "./load-drawmoon-template"
import { workflowToRuntimeGraph } from "../src/pages/console/shared/core"

const API = process.env.WORKFLOW_API ?? "http://127.0.0.1:3456"
const paperCwd = process.env.WORKFLOW_PAPER_CWD ?? join(import.meta.dirname, "../../../..", "paper")

async function cancelActiveRuns() {
  const listRes = await fetch(`${API}/workflow-runs`)
  if (!listRes.ok) return
  const { runs } = (await listRes.json()) as { runs?: Array<{ id: string; status: string }> }
  for (const run of runs ?? []) {
    if (["queued", "running", "paused"].includes(run.status)) {
      console.log(`[cleanup] cancel ${run.id} (${run.status})`)
      await fetch(`${API}/workflow-runs/${run.id}/cancel`, { method: "POST" })
    }
  }
}

async function main() {
  await cancelActiveRuns()

  const template = loadDrawmoonWorkflowTemplate("icml-to-tmm-sinkhorn")
  template.workingDirectory = paperCwd
  const graph = workflowToRuntimeGraph(template)

  const res = await fetch(`${API}/workflow-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId: template.id,
      name: `ICML→TMM stream-verify ${new Date().toISOString().slice(0, 16)}`,
      graph,
      bypassCache: true,
    }),
  })
  if (!res.ok) {
    console.error(await res.text())
    process.exit(1)
  }
  const { run } = (await res.json()) as { run: { id: string } }
  const runId = run.id
  console.log(`[verify] run=${runId}`)
  console.log(`[verify] UI http://127.0.0.1:4322/#detail/run/${encodeURIComponent(runId)}`)

  let stdoutEvents = 0
  let stdoutChars = 0
  let firstNodeId: string | null = null
  let firstStdoutMs = 0
  const t0 = Date.now()

  const streamRes = await fetch(`${API}/workflow-runs/${runId}/stream`)
  if (!streamRes.body) {
    console.error("[verify] no stream body")
    process.exit(1)
  }
  const reader = streamRes.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""

  const finish = (code: number, message: string) => {
    console.log(message)
    process.exit(code)
  }

  const timeout = setTimeout(() => {
    finish(stdoutEvents > 0 ? 0 : 1, `[verify] timeout 120s stdoutEvents=${stdoutEvents} chars=${stdoutChars}`)
  }, 120_000)

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      const ev = JSON.parse(line) as {
        type: string
        nodeId?: string
        data?: string
        error?: string
      }

      if (ev.type === "node_started" && !firstNodeId) {
        firstNodeId = ev.nodeId ?? null
        console.log(`[event] node_started ${ev.nodeId ?? ""}`)
      }
      if (ev.type === "stdout") {
        stdoutEvents++
        stdoutChars += ev.data?.length ?? 0
        if (!firstStdoutMs) firstStdoutMs = Date.now() - t0
        if (stdoutEvents <= 5) {
          const sample = String(ev.data ?? "")
            .replace(/\s+/g, " ")
            .slice(0, 100)
          console.log(`[stdout#${stdoutEvents}] node=${ev.nodeId ?? "?"} +${ev.data?.length ?? 0}ch: ${sample}`)
        } else if (stdoutEvents === 6) {
          console.log("[stdout] ... more chunks incoming")
        }
      }
      if (
        ["node_completed", "node_failed", "workflow_completed", "workflow_failed", "workflow_cancelled", "workflow_paused"].includes(
          ev.type,
        )
      ) {
        console.log(`[event] ${ev.type} ${ev.nodeId ?? ""}${ev.error ? ` — ${ev.error}` : ""}`)
      }
      if (ev.type === "node_completed" && ev.nodeId === firstNodeId) {
        clearTimeout(timeout)
        finish(
          stdoutEvents > 0 ? 0 : 1,
          `[verify] first node done in ${Date.now() - t0}ms; stdoutEvents=${stdoutEvents} chars=${stdoutChars} firstStdoutMs=${firstStdoutMs}`,
        )
      }
      if (ev.type === "node_failed" && ev.nodeId === firstNodeId) {
        clearTimeout(timeout)
        finish(1, `[verify] FAIL first node: ${ev.error ?? "unknown"}`)
      }
    }
  }

  clearTimeout(timeout)
  finish(stdoutEvents > 0 ? 0 : 1, `[verify] stream ended stdoutEvents=${stdoutEvents}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
