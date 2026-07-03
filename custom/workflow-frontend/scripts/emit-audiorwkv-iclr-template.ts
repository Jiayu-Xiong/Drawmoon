#!/usr/bin/env bun
/** Emit audiorwkv-iclr-pyramid.json from TS builder (zero LLM). */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { validateWorkflowUiTemplate } from "@opencode-ai/backend-opencode/drawmoon/template-validator"
import { buildAudiorwkvIclrPyramidUiTemplate } from "../src/data/templates/audiorwkv-iclr-pyramid"

const template = buildAudiorwkvIclrPyramidUiTemplate() as unknown as Record<string, unknown>
const validation = validateWorkflowUiTemplate(template)
if (!validation.ok) {
  console.error("Validation failed:", validation.errors.join("; "))
  process.exit(1)
}
if (validation.warnings.length) {
  console.warn("Warnings:", validation.warnings.join("; "))
}

const outPath = join(import.meta.dirname, "../../../templates/workflow/audiorwkv-iclr-pyramid.json")
writeFileSync(outPath, `${JSON.stringify(template, null, 2)}\n`, "utf-8")
console.log(`Wrote ${outPath} (${validation.stats.nodeCount} nodes, ${validation.stats.edgeCount} edges)`)
