#!/usr/bin/env bun
/** Rewrite repo workflow JSON templates with InteractionIntent migration. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"

import { migrateWorkflowTemplateIntents } from "../src/drawmoon/migrate-template-intents.js"
import { validateWorkflowUiTemplate } from "../src/drawmoon/template-validator.js"
import { repoWorkflowTemplatesDir } from "../src/drawmoon/repo-workflow-templates-dir.js"

const dir = repoWorkflowTemplatesDir()
if (!existsSync(dir)) {
  console.error("No repo templates dir:", dir)
  process.exit(1)
}

let ok = 0
let fail = 0
for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
  const path = join(dir, file)
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
  const migrated = migrateWorkflowTemplateIntents(raw)
  const validation = validateWorkflowUiTemplate(migrated)
  if (!validation.ok) {
    console.error(`FAIL ${file}:`, validation.errors.join("; "))
    fail++
    continue
  }
  writeFileSync(path, `${JSON.stringify(migrated, null, 2)}\n`, "utf-8")
  console.log(`OK ${file}${validation.warnings.length ? ` (${validation.warnings.length} warnings)` : ""}`)
  ok++
}
console.log(`Done: ${ok} migrated, ${fail} failed`)
process.exit(fail ? 1 : 0)
