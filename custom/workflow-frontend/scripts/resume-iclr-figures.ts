/**
 * Resume ICLR figure nodes: inline prompts, materialize fig1 URL, retry failed figure node.
 * Usage: bun run scripts/resume-iclr-figures.ts [runId] [nodeId]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const RUN_ID = process.argv[2] ?? "01KW1N33M2AAD0QVXKQ3SB8R44"
const NODE_ID = process.argv[3] ?? "experiment-figure-render"
const API = process.env.WORKFLOW_API ?? "http://127.0.0.1:3456"
const IMAGE_TIMEOUT_MS = 1_800_000 // 30 min for slow image API
const runtimeDir = join(process.env.USERPROFILE ?? "", ".drawmoon", "runtime", "workflow-runs")
const runPath = join(runtimeDir, `${RUN_ID}.json`)

type RunNode = {
  id: string
  config?: { prompt?: string; cwd?: string; timeoutMs?: number; llmApi?: { timeoutMs?: number } }
  action?: {
    inputs?: { prompt?: string }
    metadata?: { llmApi?: { timeoutMs?: number } }
    execution?: { timeoutMs?: number }
  }
}

function buildFigurePrompt(index: number, spec: string): string {
  return [
    `Render publication figure ${index} for an ICLR paper.`,
    `Save output as: iclr2026/figures/fig${index}.png`,
    "Follow the specification below exactly. Do not invent new figure goals.",
    "No watermarks; readable labels; colorblind-safe palette.",
    "",
    "--- FIGURE SPECIFICATION ---",
    spec.trim(),
  ].join("\n")
}

function patchPrompts(node: RunNode, prompt: string) {
  if (node.config) node.config.prompt = prompt
  if (node.action?.inputs) node.action.inputs.prompt = prompt
}

function patchImageTimeout(node: RunNode) {
  if (node.config) {
    node.config.timeoutMs = IMAGE_TIMEOUT_MS
    if (node.config.llmApi) node.config.llmApi.timeoutMs = IMAGE_TIMEOUT_MS
  }
  if (node.action?.metadata?.llmApi) node.action.metadata.llmApi.timeoutMs = IMAGE_TIMEOUT_MS
  if (node.action) {
    node.action.execution = { ...node.action.execution, timeoutMs: IMAGE_TIMEOUT_MS }
  }
}

const run = JSON.parse(readFileSync(runPath, "utf-8")) as {
  graph: { nodes: RunNode[] }
  nodeResults?: Record<string, { artifacts?: Array<{ name: string; content: string }> }>
}
const ws = run.graph.nodes.find((n) => n.id === "architect-plan")?.config?.cwd
if (!ws) throw new Error("workspace cwd not found on run record")

const fig1 = readFileSync(join(ws, "iclr2026/figures/prompts/fig1-prompt.md"), "utf-8")
const fig2 = readFileSync(join(ws, "iclr2026/figures/prompts/fig2-prompt.md"), "utf-8")

for (const node of run.graph.nodes) {
  if (node.id === "figure-render-1") patchPrompts(node, buildFigurePrompt(1, fig1))
  if (node.id === "experiment-figure-render" || node.id === "figure-render-2") {
    patchPrompts(node, buildFigurePrompt(2, fig2))
    patchImageTimeout(node)
  }
}

// Materialize fig1 if API returned URL only
const fig1Artifacts = run.nodeResults?.["figure-render-1"]?.artifacts ?? []
const fig1Url = fig1Artifacts.find((a) => a.content.startsWith("http"))?.content
if (fig1Url) {
  const dest = join(ws, "iclr2026/figures/fig1.png")
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(fig1Url)
  if (!res.ok) throw new Error(`fig1 download failed: ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`[resume] downloaded fig1 → ${dest}`)
}

writeFileSync(runPath, JSON.stringify(run, null, 2), "utf-8")
console.log(`[resume] patched ${runPath}`)

const retry = await fetch(`${API}/workflow-runs/${RUN_ID}/retry-node`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nodeId: NODE_ID }),
})
if (!retry.ok) {
  console.error(await retry.text())
  process.exit(1)
}
const body = await retry.json() as { run: { id: string; status: string } }
console.log(`[resume] retry ${NODE_ID} → status=${body.run.status}`)
