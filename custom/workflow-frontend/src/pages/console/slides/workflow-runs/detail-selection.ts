import { createSignal } from "solid-js"

import type { DetailSelection } from "./WorkflowRunDetailPanel"

/** Per-run canvas/detail selection — survives WorkflowInstanceDetail remounts. */
const selectionByRun = new Map<string, DetailSelection>()
const pinnedByRun = new Map<string, boolean>()
const [revision, setRevision] = createSignal(0)

function bump() {
  setRevision((value) => value + 1)
}

export function workflowDetailSelection(runId: string): DetailSelection {
  revision()
  return selectionByRun.get(runId) ?? null
}

export function workflowDetailSelectionPinned(runId: string): boolean {
  revision()
  return pinnedByRun.get(runId) ?? false
}

export function setWorkflowDetailSelection(
  runId: string,
  selection: DetailSelection,
  options?: { pinned?: boolean },
) {
  if (!runId) return
  if (selection) {
    selectionByRun.set(runId, selection)
    if (options?.pinned !== undefined) pinnedByRun.set(runId, options.pinned)
    else if (!pinnedByRun.has(runId)) pinnedByRun.set(runId, true)
  } else {
    selectionByRun.delete(runId)
    pinnedByRun.delete(runId)
  }
  bump()
}

export function setWorkflowDetailSelectionPinned(runId: string, pinned: boolean) {
  if (!runId) return
  pinnedByRun.set(runId, pinned)
  bump()
}

export function clearWorkflowDetailSelection(runId: string) {
  if (!runId) return
  selectionByRun.delete(runId)
  pinnedByRun.delete(runId)
  bump()
}
