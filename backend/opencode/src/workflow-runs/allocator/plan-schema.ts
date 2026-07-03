import type { OutputCriticality } from "../context/types.js"

export const ALLOCATION_PLAN_PATH = ".workflow/allocation-plan.json"

export interface AllocationFile {
  /** Flat source filename under write root (e.g. "section-intro.md"). */
  flat: string
  /** Destination relative path (e.g. "iclr2026/sections/intro.md"). */
  dest: string
  /** Producer node id — must exist in the workflow graph. */
  producer: string
  criticality?: OutputCriticality
}

export interface AllocationPlan {
  /** Must be "." — all writes are flat under the entity output root. */
  writeRoot: string
  /** Directories to create under write root before worker nodes run. */
  folders: string[]
  files: AllocationFile[]
}
