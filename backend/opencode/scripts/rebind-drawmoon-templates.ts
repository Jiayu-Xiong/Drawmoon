#!/usr/bin/env bun
/**
 * Rebind all ~/.drawmoon/templates/workflows/*.json (executorId / llmId migration).
 * Usage: bun run scripts/rebind-drawmoon-templates.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { drawmoonWorkflowTemplatesDir } from "../src/drawmoon/paths.js"
import { rebindWorkflowTemplateJson } from "../src/drawmoon/rebind-workflow-template.js"
import { validateWorkflowUiTemplate } from "../src/drawmoon/template-validator.js"

const dir = drawmoonWorkflowTemplatesDir()
if (!existsSync(dir)) {
  console.error("No drawmoon workflow templates dir:", dir)
  process.exit(1)
}

let updated = 0
for (const entry of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
  const path = join(dir, entry)
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
  const rebound = rebindWorkflowTemplateJson(raw)
  const validation = validateWorkflowUiTemplate(rebound)
  if (!validation.ok) {
    console.warn(`skip ${entry}: ${validation.errors.join("; ")}`)
    continue
  }
  writeFileSync(path, `${JSON.stringify(rebound, null, 2)}\n`, "utf-8")
  updated += 1
  console.log(`rebound ${entry}`)
}

console.log(`Done: ${updated} template(s) in ${dir}`)
