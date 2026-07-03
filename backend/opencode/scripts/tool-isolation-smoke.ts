import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { drawmoonApiPath, drawmoonLibraryDir } from "../src/drawmoon/paths.js"
import { ensureIsolationSmokeLibrary, evaluateIsolationOutput } from "../src/drawmoon/isolation-smoke-library.js"
import { applyToolConstraintsToOpencodeConfig } from "../src/providers/opencode-constraints.js"
import { resolveAgentModeConfig } from "../src/agent-modes/resolve.js"
import { defaultAgentModes } from "../src/agent-modes/defaults.js"
import { getTemplate } from "../src/workflow-templates/index.js"

type RunResult = {
  status: string
  nodeResults?: Record<string, { text?: string }>
  error?: string | null
}

function ensureDeepseekApiBlock() {
  const apiPath = drawmoonApiPath()
  const current = existsSync(apiPath) ? readFileSync(apiPath, "utf-8") : ""
  if (/api\.deepseek\.com/i.test(current)) return

  const repoApi = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "api")
  if (!existsSync(repoApi)) return
  const repoText = readFileSync(repoApi, "utf-8")
  const blocks = repoText.split(/\r?\n(?=sk-)/)
  const deepseekBlock = blocks.find((block) => /deepseek/i.test(block))
  if (!deepseekBlock?.trim()) return

  mkdirSync(dirname(apiPath), { recursive: true })
  appendFileSync(apiPath, `${current.endsWith("\n") ? "" : "\n\n"}${deepseekBlock.trim()}\n`, "utf-8")
  console.log(`[api] appended DeepSeek block to ${apiPath}`)
}

function ensureProbeLibrary() {
  return ensureIsolationSmokeLibrary({ force: true })
}

function probeNodeConfigs() {
  const entry = getTemplate("opencode-tool-isolation-smoke")
  if (!entry) throw new Error("template missing")
  const manifest = ensureProbeLibrary()

  for (const node of entry.graph.nodes) {
    const agentModeId = node.action?.binding?.agentModeId ?? "opencode-chat"
    const modeConfig = resolveAgentModeConfig({ agentModeId }, { registry: defaultAgentModes })
    const constraints = modeConfig.resolved.constraints ?? node.config.constraints
    const config: Record<string, unknown> = { model: node.config.model }
    applyToolConstraintsToOpencodeConfig(config, constraints, manifest)
    console.log(`\n[config-probe] ${node.id} · agentMode=${agentModeId}`)
    console.log(JSON.stringify({
      skills: config.skills,
      mcp: config.mcp ? Object.keys(config.mcp as Record<string, unknown>) : [],
    }, null, 2))
  }
}

function assertIsolationOutputs(run: RunResult) {
  const outputs = run.nodeResults ?? {}
  const alpha = outputs["node-alpha"]?.text ?? ""
  const beta = outputs["node-beta"]?.text ?? ""
  const alphaEval = evaluateIsolationOutput("alpha", alpha)
  const betaEval = evaluateIsolationOutput("beta", beta)
  const checks: Array<{ label: string; ok: boolean; detail: string }> = [
    { label: "alpha read own skill token (not in prompt)", ok: alphaEval.hasOwnSkillToken, detail: alphaEval.text },
    { label: "alpha called own MCP token (not in prompt)", ok: alphaEval.hasOwnMcpToken, detail: "" },
    { label: "alpha lacks beta skill token (isolation)", ok: alphaEval.lacksForeignSkill, detail: "" },
    { label: "alpha lacks beta MCP token (isolation)", ok: alphaEval.lacksForeignMcp, detail: "" },
    { label: "beta read own skill token (not in prompt)", ok: betaEval.hasOwnSkillToken, detail: betaEval.text },
    { label: "beta called own MCP token (not in prompt)", ok: betaEval.hasOwnMcpToken, detail: "" },
    { label: "beta lacks alpha skill token (isolation)", ok: betaEval.lacksForeignSkill, detail: "" },
    { label: "beta lacks alpha MCP token (isolation)", ok: betaEval.lacksForeignMcp, detail: "" },
  ]

  console.log("\n[assertions]")
  let failed = run.status !== "completed"
  if (failed) console.log(`  FAIL run status = ${run.status}${run.error ? ` (${run.error})` : ""}`)
  for (const check of checks) {
    const mark = check.ok ? "PASS" : "FAIL"
    console.log(`  ${mark} ${check.label}${check.detail ? `: ${check.detail}` : ""}`)
    if (!check.ok) failed = true
  }
  if (failed) {
    throw new Error("tool isolation smoke assertions failed")
  }
  console.log("\n[result] all isolation checks passed")
}

async function runWorkflow() {
  const base = process.env.RUNTIME_URL ?? "http://127.0.0.1:3456"
  const entry = getTemplate("opencode-tool-isolation-smoke")
  if (!entry) throw new Error("template missing")
  const response = await fetch(`${base}/workflow-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      templateId: entry.info.id,
      graph: entry.graph,
      name: "tool-isolation-smoke",
    }),
  })
  if (!response.ok) throw new Error(`start failed: ${response.status} ${await response.text()}`)
  const { run } = await response.json() as { run: { id: string } }
  console.log(`\n[run] started ${run.id}`)
  console.log(`[trace] ${base}/workflow-runs/${run.id}`)
  console.log(`[stream] ${base}/workflow-runs/${run.id}/stream`)

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000))
    const detail = await fetch(`${base}/workflow-runs/${run.id}`)
    if (!detail.ok) continue
    const body = await detail.json() as { run: RunResult }
    const status = body.run.status
    process.stdout.write(`\r[run] ${status}   `)
    if (status === "completed" || status === "failed" || status === "cancelled") {
      console.log("\n")
      if (body.run.error) console.log(`[error] ${body.run.error}`)
      for (const [nodeId, output] of Object.entries(body.run.nodeResults ?? {})) {
        const text = output.text?.trim() ?? "(no text)"
        console.log(`[output] ${nodeId}: ${text.slice(0, 240)}`)
      }
      assertIsolationOutputs(body.run)
      return body.run
    }
  }
  throw new Error("run timed out")
}

async function main() {
  console.log(`[library] ${drawmoonLibraryDir()}`)
  ensureDeepseekApiBlock()
  probeNodeConfigs()

  if (process.argv.includes("--config-only")) return

  try {
    await runWorkflow()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

void main()
