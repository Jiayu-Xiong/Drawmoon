#!/usr/bin/env bun
/**
 * Emit bundled workflow template JSON into xy/templates/workflow/ (code only, zero LLM).
 * Usage: bun run scripts/emit-workflow-template.ts [template-id]
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { paperJournalDefaultTemplate } from "../src/drawmoon/bundled-templates/paper-journal-default.js"
import { validateWorkflowUiTemplate } from "../src/drawmoon/template-validator.js"

const builders: Record<string, () => Record<string, unknown>> = {
  "paper-journal-default": paperJournalDefaultTemplate,
}

const id = process.argv[2] ?? "paper-journal-default"
const build = builders[id]
if (!build) {
  console.error(`Unknown template id: ${id}`)
  process.exit(1)
}

const template = build()
const validation = validateWorkflowUiTemplate(template)
if (!validation.ok) {
  console.error("Validation failed:", validation.errors.join("; "))
  process.exit(1)
}
if (validation.warnings.length) {
  console.warn("Warnings:", validation.warnings.join("; "))
}

const outDir = join(fileURLToPath(new URL(".", import.meta.url)), "../../../templates/workflow")
const outPath = join(outDir, `${id}.json`)
writeFileSync(outPath, `${JSON.stringify(template, null, 2)}\n`, "utf-8")
console.log(`Wrote ${outPath} (${validation.stats.nodeCount} nodes, ${validation.stats.edgeCount} edges)`)
