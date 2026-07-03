import { readFileSync } from "node:fs"

import type { Context } from "hono"

import type { WorkflowRunStoreBase } from "./store.js"
import { WorkflowArtifactFileResolver } from "./artifact-file-resolver.js"

function contentTypeFor(filePath: string) {
  if (filePath.endsWith(".pdf")) return "application/pdf"
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8"
  if (filePath.endsWith(".png")) return "image/png"
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg"
  if (filePath.endsWith(".webp")) return "image/webp"
  if (filePath.endsWith(".tex")) return "text/plain; charset=utf-8"
  return "text/markdown; charset=utf-8"
}

export class WorkflowOutputRoute {
  private readonly resolver: WorkflowArtifactFileResolver

  constructor(dataDir: string, store: WorkflowRunStoreBase) {
    this.resolver = new WorkflowArtifactFileResolver(dataDir, (runId) => store.get(runId))
  }

  handle(c: Context) {
    const relative = c.req.path.replace(/^\/workflow-output\//, "")
    const runId = c.req.query("runId")
    const filePath = this.resolver.resolve(relative, typeof runId === "string" ? runId : undefined)
    if (!filePath) return c.json({ error: "File not found" }, 404)
    const body = readFileSync(filePath)
    return c.body(body, 200, { "Content-Type": contentTypeFor(filePath) })
  }
}
