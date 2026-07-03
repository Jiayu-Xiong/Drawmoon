#!/usr/bin/env bun
/** Emit all repo workflow templates from TS builders into xy/templates/workflow/. */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { validateWorkflowUiTemplate } from "@opencode-ai/backend-opencode/drawmoon/template-validator"
import { paperJournalDefaultTemplate } from "@opencode-ai/backend-opencode/drawmoon/bundled-templates/paper-journal-default"
import { buildAudiorwkvIclrPyramidUiTemplate } from "../src/data/templates/audiorwkv-iclr-pyramid"
import { buildIcmlToTmmSinkhornUiTemplate } from "../src/data/templates/icml-to-tmm-sinkhorn"

const outDir = join(import.meta.dirname, "../../../templates/workflow")

const builders: Array<{ id: string; build: () => Record<string, unknown> }> = [
  { id: "audiorwkv-iclr-pyramid", build: () => buildAudiorwkvIclrPyramidUiTemplate() as unknown as Record<string, unknown> },
  { id: "icml-to-tmm-sinkhorn", build: () => buildIcmlToTmmSinkhornUiTemplate() as unknown as Record<string, unknown> },
  { id: "paper-journal-default", build: paperJournalDefaultTemplate },
]

let failed = false
for (const { id, build } of builders) {
  const template = build()
  const validation = validateWorkflowUiTemplate(template)
  if (!validation.ok) {
    console.error(`[${id}] validation failed:`, validation.errors.join("; "))
    failed = true
    continue
  }
  if (validation.warnings.length) {
    console.warn(`[${id}] warnings:`, validation.warnings.join("; "))
  }
  const outPath = join(outDir, `${id}.json`)
  writeFileSync(outPath, `${JSON.stringify(template, null, 2)}\n`, "utf-8")
  console.log(`Wrote ${outPath} (${validation.stats.nodeCount} nodes, ${validation.stats.edgeCount} edges)`)
}

if (failed) process.exit(1)
