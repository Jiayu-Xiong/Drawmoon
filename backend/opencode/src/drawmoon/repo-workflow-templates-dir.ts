import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/** Repo-bundled workflow JSON: xy/templates/workflow/ (not ~/.drawmoon). */
export function repoWorkflowTemplatesDir(): string {
  const here = fileURLToPath(new URL(".", import.meta.url))
  return join(here, "../../../..", "templates", "workflow")
}

export function repoWorkflowTemplatesDirExists(): boolean {
  return existsSync(repoWorkflowTemplatesDir())
}
