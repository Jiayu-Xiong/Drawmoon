import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import type { WorkflowTemplate } from "../src/data/console-model"

function drawmoonWorkflowPath(id: string): string {
  return join(homedir(), ".drawmoon", "templates", "workflows", `${id}.json`)
}

/** Load a workflow UI template from ~/.drawmoon or repo starter JSON. */
export function loadDrawmoonWorkflowTemplate(id: string): WorkflowTemplate {
  const drawmoon = drawmoonWorkflowPath(id)
  if (existsSync(drawmoon)) {
    return JSON.parse(readFileSync(drawmoon, "utf-8")) as WorkflowTemplate
  }
  const repo = join(import.meta.dirname, "../../../templates/workflow", `${id}.json`)
  if (existsSync(repo)) {
    return JSON.parse(readFileSync(repo, "utf-8")) as WorkflowTemplate
  }
  throw new Error(`Workflow template not found: ${id} (checked ${drawmoon} and ${repo})`)
}
