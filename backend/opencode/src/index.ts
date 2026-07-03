#!/usr/bin/env bun
/**
 * Local Agent Runtime – main entry point.
 *
 * Starts the HTTP server that powers workflow agent node execution.
 *
 * Usage:
 *   bun run src/index.ts
 *   bun run src/index.ts --port 3456
 *   (optional) --data-dir must be a subpath of ~/.drawmoon, default ~/.drawmoon/runtime
 */

import { createRuntimeServer } from "./server.js"
import { ensureIsolationSmokeLibrary } from "./drawmoon/isolation-smoke-library.js"
import { ensureSystemWorkflowMcpLibrary } from "./drawmoon/system-library.js"
import { resolveRuntimeDataDir } from "./drawmoon/paths.js"
import { seedRepoWorkflowTemplates } from "./drawmoon/workflow-template-seed.js"

// Parse CLI args
const args = process.argv.slice(2)
const portIndex = args.indexOf("--port")
const dataDirIndex = args.indexOf("--data-dir")
const cacheModeIndex = args.indexOf("--cache-mode")

const portArg = portIndex !== -1 ? args[portIndex + 1] : undefined
const port = portArg ? parseInt(portArg, 10) : 3456
let dataDir: string
try {
  dataDir = resolveRuntimeDataDir(dataDirIndex !== -1 ? args[dataDirIndex + 1] : undefined)
} catch (error) {
  console.error(`[Agent Runtime] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
const cacheModeArg = cacheModeIndex !== -1 ? args[cacheModeIndex + 1] : undefined
const cacheMode = cacheModeArg
  ? cacheModeArg as "off" | "input-only" | "files-aware"
  : undefined

const server = createRuntimeServer({ port, dataDir, cacheMode })
try {
  ensureSystemWorkflowMcpLibrary()
  const manifest = ensureIsolationSmokeLibrary()
  if (manifest.skills.length || manifest.mcp.length) {
    console.log(`[Drawmoon Library] ${manifest.skills.length} skill(s), ${manifest.mcp.length} MCP server(s)`)
  }
  const workflowSeed = seedRepoWorkflowTemplates()
  if (workflowSeed.seeded.length) {
    console.log(`[Drawmoon Workflows] seeded: ${workflowSeed.seeded.join(", ")}`)
  }
  if (workflowSeed.errors.length) {
    console.warn(`[Drawmoon Workflows] seed errors: ${workflowSeed.errors.map((e) => `${e.file}: ${e.message}`).join("; ")}`)
  }
} catch (error) {
  console.warn("[Drawmoon Library] seed skipped:", error instanceof Error ? error.message : String(error))
}
server.start()

console.log(`\n  🚀 Agent Runtime ready at http://localhost:${server.port}`)
  console.log(`  📂 Providers: custom, opencode, codex, openai, kiro, copilot`)
console.log(`  💾 Cache mode: ${cacheMode ?? "input-only"}`)
console.log()
