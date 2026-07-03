import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { drawmoonWorkflowTemplatesDir } from "./paths.js"
import { rebindWorkflowTemplateJson } from "./rebind-workflow-template.js"
import { validateWorkflowUiTemplate } from "./template-validator.js"

export interface RebindWorkflowTemplatesResult {
  updated: string[]
  skipped: Array<{ file: string; reason: string }>
}

export function rebindAllDrawmoonWorkflowTemplates(): RebindWorkflowTemplatesResult {
  const dir = drawmoonWorkflowTemplatesDir()
  const result: RebindWorkflowTemplatesResult = { updated: [], skipped: [] }
  if (!existsSync(dir)) return result

  for (const entry of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const path = join(dir, entry)
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
      const rebound = rebindWorkflowTemplateJson(raw)
      const validation = validateWorkflowUiTemplate(rebound)
      if (!validation.ok) {
        result.skipped.push({ file: entry, reason: validation.errors.join("; ") })
        continue
      }
      writeFileSync(path, `${JSON.stringify(rebound, null, 2)}\n`, "utf-8")
      result.updated.push(typeof rebound.id === "string" ? rebound.id : entry.replace(/\.json$/i, ""))
    } catch (err) {
      result.skipped.push({ file: entry, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return result
}
