export type View = "entities" | "home" | "system" | "detail" | "nodeDetail" | "editor" | "templateGen" | "tools" | "agentModes" | "llmApi"
export type SlideView = "home" | "detail" | "nodeDetail"
export type AppView = "editor" | "templateGen" | "system" | "tools" | "agentModes" | "llmApi"
export type MotionKind = "idle" | "slide-left" | "slide-right" | "dock-lift" | "dock-drop" | "app-switch"

export type LauncherNavigate = (view: View) => void

export const SLIDE_DURATION_MS = 860
export const DOCK_LIFT_MS = 920
export const APP_SWITCH_MS = 400
export const APP_VIEWS: AppView[] = ["editor", "templateGen", "system", "tools", "agentModes", "llmApi"]

export function isAppView(view: View): view is AppView {
  return APP_VIEWS.includes(view as AppView)
}

export function appIndex(view: AppView) {
  return APP_VIEWS.indexOf(view)
}

export function launcherSlotFromView(view: View) {
  if (view === "home" || view === "detail" || view === "nodeDetail") return 0
  if (view === "editor") return 1
  if (view === "templateGen") return 2
  if (view === "system") return 3
  if (view === "tools") return 4
  if (view === "agentModes") return 5
  if (view === "llmApi") return 6
  return 0
}

export function motionDuration(kind: MotionKind) {
  if (kind === "slide-left" || kind === "slide-right") return SLIDE_DURATION_MS
  if (kind === "dock-lift" || kind === "dock-drop") return DOCK_LIFT_MS
  if (kind === "app-switch") return APP_SWITCH_MS
  return 0
}

export function resolveMotion(from: View, to: View, kind: MotionKind): MotionKind {
  if (kind !== "idle") return kind
  if (isSlideView(to) && isSlideView(from) && to !== from) {
    return slideIndex(to) < slideIndex(from) ? "slide-left" : "slide-right"
  }
  if (isAppView(to) && (isSlideView(from) || from === "entities")) return "dock-lift"
  if (isSlideView(to) && isAppView(from)) return "dock-drop"
  if (isAppView(to) && isAppView(from) && to !== from) return "app-switch"
  return "idle"
}

export function isSlideView(view: View): view is SlideView {
  return view === "home" || view === "detail" || view === "nodeDetail"
}

export function slideIndex(view: SlideView) {
  if (view === "detail") return 0
  if (view === "home") return 1
  return 2
}

export function uniqueSlideViews(items: Array<SlideView | undefined>) {
  return Array.from(new Set(items.filter((item): item is SlideView => Boolean(item))))
}

export function uniqueAppViews(items: Array<AppView | undefined>) {
  return Array.from(new Set(items.filter((item): item is AppView => Boolean(item))))
}

export const viewHash: Record<View, string> = {
  entities: "entities",
  home: "home",
  system: "system",
  detail: "detail",
  nodeDetail: "nodes",
  editor: "templates",
  templateGen: "template-gen",
  tools: "tools",
  agentModes: "agent-modes",
  llmApi: "llm-api",
}

export const hashView = Object.fromEntries(Object.entries(viewHash).map(([view, hash]) => [hash, view])) as Record<string, View>

function locationHashBody() {
  if (typeof window === "undefined") return ""
  return window.location.hash.replace(/^#\/?/, "")
}

function locationHashBase() {
  return locationHashBody().split(/[/?]/)[0] ?? ""
}

export function viewFromLocation(): View {
  if (typeof window === "undefined") return "home"
  const hash = locationHashBase()
  if (hash === "cli") return "home"
  return hashView[hash] ?? "home"
}

export function workflowRunIdFromLocation() {
  if (typeof window === "undefined") return null
  const match = locationHashBody().match(/^detail\/run\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function writeViewHistory(next: View, mode: "push" | "replace" = "push", options?: { preserveRunDetail?: boolean }) {
  if (typeof window === "undefined") return
  let hash = `#${viewHash[next]}`
  if (next === "detail" && options?.preserveRunDetail !== false) {
    const runId = workflowRunIdFromLocation()
    if (runId) hash = `#detail/run/${encodeURIComponent(runId)}`
  }
  const url = `${window.location.pathname}${window.location.search}${hash}`
  window.history[mode === "replace" ? "replaceState" : "pushState"]({ view: next }, "", url)
}

export function writeWorkflowRunDetailHistory(runId: string) {
  if (typeof window === "undefined") return
  const hash = `#detail/run/${encodeURIComponent(runId)}`
  const url = `${window.location.pathname}${window.location.search}${hash}`
  window.history.replaceState({ view: "detail", runId }, "", url)
}

export function clearWorkflowRunDetailHistory() {
  if (typeof window === "undefined") return
  const hash = `#${viewHash.detail}`
  const url = `${window.location.pathname}${window.location.search}${hash}`
  window.history.replaceState({ view: "detail" }, "", url)
}

export function syncWorkflowRunDetailFromLocation() {
  return workflowRunIdFromLocation()
}

export function motionForHistory(from: View, to: View): MotionKind {
  return resolveMotion(from, to, "idle")
}

