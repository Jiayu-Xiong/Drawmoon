import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { scanLibraryManifest, type DrawmoonLibraryManifest } from "./library.js"
import { drawmoonMcpDir } from "./paths.js"
import { SYSTEM_MCP_IO, SYSTEM_MCP_WEB } from "../workflow-runs/context/types.js"

const ioScript = fileURLToPath(new URL("../../scripts/mcp-workflow-io.ts", import.meta.url))
const webScript = fileURLToPath(new URL("../../scripts/mcp-workflow-web.ts", import.meta.url))

function writeMcp(id: string, body: Record<string, unknown>) {
  mkdirSync(drawmoonMcpDir(), { recursive: true })
  writeFileSync(join(drawmoonMcpDir(), `${id}.json`), JSON.stringify(body, null, 2), "utf-8")
}

export function ensureSystemWorkflowMcpLibrary(options?: { force?: boolean }): DrawmoonLibraryManifest {
  const ioPath = join(drawmoonMcpDir(), `${SYSTEM_MCP_IO}.json`)
  const webPath = join(drawmoonMcpDir(), `${SYSTEM_MCP_WEB}.json`)
  const needs = options?.force || !existsSync(ioPath) || !existsSync(webPath)

  if (needs) {
    writeMcp(SYSTEM_MCP_IO, {
      name: SYSTEM_MCP_IO,
      description: "Workflow workspace filesystem IO (read/write/list/copy). WORKFLOW_WORKSPACE_ROOT set per run.",
      type: "local",
      command: [process.execPath, ioScript],
      environment: {},
    })
    writeMcp(SYSTEM_MCP_WEB, {
      name: SYSTEM_MCP_WEB,
      description: "Workflow HTTP fetch (webfetch).",
      type: "local",
      command: [process.execPath, webScript],
      environment: {},
    })
  }

  return scanLibraryManifest()
}
