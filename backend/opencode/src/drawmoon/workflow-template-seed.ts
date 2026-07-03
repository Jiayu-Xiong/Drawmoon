import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { drawmoonWorkflowTemplatesDir } from "./paths.js"
import { repoWorkflowTemplatesDir } from "./repo-workflow-templates-dir.js"
import { validateWorkflowUiTemplate } from "./template-validator.js"
import { migrateWorkflowTemplateIntents } from "./migrate-template-intents.js"

export interface WorkflowTemplateSeedResult {
  seeded: string[]
  skipped: string[]
  errors: Array<{ file: string; message: string }>
}

function safeTemplateId(fileName: string) {
  return fileName.replace(/\.json$/i, "")
}

/** Copy validated repo JSON into ~/.drawmoon/templates/workflows (code I/O only — never LLM). */
export function seedRepoWorkflowTemplates(options?: { force?: boolean }): WorkflowTemplateSeedResult {
  const sourceDir = repoWorkflowTemplatesDir()
  const destDir = drawmoonWorkflowTemplatesDir()
  const force = options?.force ?? false
  const result: WorkflowTemplateSeedResult = { seeded: [], skipped: [], errors: [] }

  if (!existsSync(sourceDir)) return result

  for (const entry of readdirSync(sourceDir).filter((name) => name.endsWith(".json"))) {
    const sourcePath = join(sourceDir, entry)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(readFileSync(sourcePath, "utf-8")) as Record<string, unknown>
    } catch (err) {
      result.errors.push({ file: entry, message: err instanceof Error ? err.message : String(err) })
      continue
    }

    const migrated = migrateWorkflowTemplateIntents(parsed)
    const validation = validateWorkflowUiTemplate(migrated)
    if (!validation.ok) {
      result.errors.push({ file: entry, message: validation.errors.join("; ") })
      continue
    }

    const id = typeof migrated.id === "string" && migrated.id.trim() ? migrated.id.trim() : safeTemplateId(entry)
    const destPath = join(destDir, `${id}.json`)
    if (!force && existsSync(destPath)) {
      result.skipped.push(id)
      continue
    }

    const normalized = {
      loopEdges: [],
      branchGroups: [],
      mergeGroups: [],
      sharedSessions: [],
      sessionGroups: {},
      ...migrated,
      id,
    }
    writeFileSync(destPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8")
    result.seeded.push(id)
  }

  return result
}
