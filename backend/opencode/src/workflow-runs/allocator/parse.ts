import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type { AllocationPlan } from "./plan-schema.js"
import { ALLOCATION_PLAN_PATH } from "./plan-schema.js"

export function parseAllocationPlan(text: string): AllocationPlan | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const jsonBlock = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim()
  const raw = jsonBlock ?? trimmed
  try {
    const parsed = JSON.parse(raw) as AllocationPlan
    if (!Array.isArray(parsed.files)) return null
    return {
      writeRoot: typeof parsed.writeRoot === "string" ? parsed.writeRoot : ".",
      folders: Array.isArray(parsed.folders)
        ? parsed.folders.filter((f): f is string => typeof f === "string")
        : [],
      files: parsed.files.filter(
        (f) => f && typeof f.flat === "string" && typeof f.dest === "string" && typeof f.producer === "string",
      ),
    }
  } catch {
    return null
  }
}

export function allocationPlanPath(workspaceDir: string): string {
  return join(workspaceDir, ALLOCATION_PLAN_PATH)
}

export function writeAllocationPlanEntity(workspaceDir: string, plan: AllocationPlan): string {
  const path = allocationPlanPath(workspaceDir)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(plan, null, 2), "utf-8")
  return ALLOCATION_PLAN_PATH
}

export function readAllocationPlanEntity(workspaceDir: string): AllocationPlan | null {
  const path = allocationPlanPath(workspaceDir)
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AllocationPlan
  } catch {
    return null
  }
}

export function ensurePlanFolders(workspaceDir: string, folders: string[]): void {
  for (const folder of folders) {
    const norm = folder.replace(/\\/g, "/").replace(/^\/+/, "")
    if (!norm || norm === ".") continue
    mkdirSync(join(workspaceDir, norm), { recursive: true })
  }
}
