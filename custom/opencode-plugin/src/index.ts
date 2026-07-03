/**
 * OpenCode Workflow Plugin Bridge
 *
 * A thin plugin that bridges opencode with the custom workflow system.
 *
 * Responsibilities:
 * - Register an opencode command to open the workflow frontend
 * - Detect and connect to the sidecar runtime server
 * - Pass project root and session metadata to the workflow runtime
 *
 * Usage in opencode config:
 * ```json
 * {
 *   "plugin": ["@opencode-ai/custom-workflow-plugin"]
 * }
 * ```
 */

import type { Plugin, Hooks } from "@opencode-ai/plugin"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const RUNTIME_DEFAULT_PORT = 3456
const FRONTEND_DEFAULT_PORT = 4322

let runtimeProcess: ChildProcess | null = null

/**
 * Launch the local agent runtime as a sidecar process.
 */
async function launchRuntime(projectDir: string, port: number): Promise<{ port: number; process: ChildProcess }> {
  // Look for the runtime entry in known locations
  const candidates = [
    resolve(projectDir, "backend/opencode/src/index.ts"),
    resolve(projectDir, "node_modules/@opencode-ai/backend-opencode/src/index.ts"),
  ]

  let runtimePath = candidates.find((p) => existsSync(p))
  if (!runtimePath) {
    throw new Error(
      "Local agent runtime not found. Ensure backend/opencode exists in the project.",
    )
  }

  const proc = spawn("bun", ["run", runtimePath, "--port", String(port)], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  })

  proc.stdout?.on("data", (data: Buffer) => {
    console.log(`[workflow-runtime] ${data.toString().trim()}`)
  })

  proc.stderr?.on("data", (data: Buffer) => {
    console.error(`[workflow-runtime:err] ${data.toString().trim()}`)
  })

  proc.on("exit", (code) => {
    console.log(`[workflow-runtime] exited with code ${code}`)
    runtimeProcess = null
  })

  runtimeProcess = proc

  // Wait a moment for the server to start
  await new Promise((resolve) => setTimeout(resolve, 1500))

  return { port, process: proc }
}

/**
 * Open the workflow frontend URL.
 */
function openFrontend(port: number): string {
  return `http://localhost:${FRONTEND_DEFAULT_PORT}`
}

/**
 * Kill the sidecar runtime process.
 */
async function stopRuntime(): Promise<void> {
  if (runtimeProcess) {
    runtimeProcess.kill("SIGTERM")
    // Give it a moment to shut down gracefully
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (runtimeProcess && !runtimeProcess.killed) {
      runtimeProcess.kill("SIGKILL")
    }
    runtimeProcess = null
  }
}

/**
 * The workflow plugin entry point.
 *
 * This is an opencode plugin that bridges to the custom workflow system.
 */
export const WorkflowPlugin: Plugin = async (ctx) => {
  const projectDir = ctx.directory

  // Attempt to auto-launch the runtime on startup
  let runtimePort = RUNTIME_DEFAULT_PORT

  try {
    const runtime = await launchRuntime(projectDir, runtimePort)
    runtimePort = runtime.port
    console.log(`[workflow-plugin] Runtime started on port ${runtimePort}`)
  } catch (err) {
    console.warn(`[workflow-plugin] Could not auto-start runtime: ${err}`)
    console.warn(`[workflow-plugin] Make sure the runtime is running manually on port ${RUNTIME_DEFAULT_PORT}`)
  }

  const hooks: Hooks = {
    /**
     * Clean up the runtime on plugin dispose.
     */
    async dispose() {
      await stopRuntime()
    },
  }

  return hooks
}

export default WorkflowPlugin
