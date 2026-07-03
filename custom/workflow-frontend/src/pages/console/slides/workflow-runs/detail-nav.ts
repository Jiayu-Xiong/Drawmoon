import { createSignal } from "solid-js"

import { syncWorkflowRunDetailFromLocation } from "../../navigation"

/** Survives DetailView remounts — slide deck can remount panels during transitions. */
const [detailPaneOpen, setDetailPaneOpen] = createSignal(false)
const [detailSelectedId, setDetailSelectedId] = createSignal<string | null>(null)

function workflowRunDetailHash(id: string) {
  return `#detail/run/${encodeURIComponent(id)}`
}

function workflowListHash() {
  return "#detail"
}

export function workflowDetailPaneOpen() {
  return detailPaneOpen()
}

export function workflowDetailSelectedId() {
  return detailSelectedId()
}

export function openWorkflowDetailPane(id: string) {
  setDetailSelectedId(id)
  setDetailPaneOpen(true)
  if (typeof window !== "undefined") {
    const nextHash = workflowRunDetailHash(id)
    if (window.location.hash !== nextHash) {
      const url = `${window.location.pathname}${window.location.search}${nextHash}`
      window.history.replaceState({ view: "detail", runId: id }, "", url)
    }
  }
}

export function closeWorkflowDetailPane() {
  setDetailPaneOpen(false)
  setDetailSelectedId(null)
  if (typeof window !== "undefined" && window.location.hash !== workflowListHash()) {
    const url = `${window.location.pathname}${window.location.search}${workflowListHash()}`
    window.history.replaceState({ view: "detail" }, "", url)
  }
}

export function resetWorkflowDetailPane() {
  closeWorkflowDetailPane()
}

export function syncWorkflowDetailPaneFromLocation() {
  const runId = syncWorkflowRunDetailFromLocation()
  if (runId) {
    setDetailSelectedId(runId)
    setDetailPaneOpen(true)
    return runId
  }
  setDetailPaneOpen(false)
  setDetailSelectedId(null)
  return null
}

let workflowRunOpenHandler: ((id: string) => void) | null = null

export function registerWorkflowRunOpenHandler(handler: (id: string) => void) {
  workflowRunOpenHandler = handler
}

export function unregisterWorkflowRunOpenHandler() {
  workflowRunOpenHandler = null
}

export function requestOpenWorkflowRun(id: string) {
  if (workflowRunOpenHandler) {
    workflowRunOpenHandler(id)
    return
  }
  openWorkflowDetailPane(id)
}
