const SLIDE_SCROLL_SELECTORS = [
  "[data-primary-scroll]",
  ".workflow-run-pane--detail",
  ".home-slide-panel--nodes .side-page-content",
  ".home-slide-panel.is-slide-active .side-page-content",
  ".home-main-glass",
]

const APP_SCROLL_SELECTORS = [
  "[data-primary-scroll]",
  ".app-stage-panel.is-active .view-stack",
  ".app-stage-panel.is-active .editor-sessions",
  ".app-stage-panel.is-active .console-stage",
]

function isScrollable(el: HTMLElement) {
  return el.scrollHeight > el.clientHeight + 1
}

function canConsumeWheel(el: HTMLElement, deltaY: number) {
  if (!isScrollable(el)) return false
  if (deltaY < 0) return el.scrollTop > 0
  if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1
  return false
}

function findPrimaryScroll(root: ParentNode, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector)
    if (el instanceof HTMLElement && isScrollable(el)) return el
  }
  for (const selector of selectors) {
    const el = root.querySelector(selector)
    if (el instanceof HTMLElement) return el
  }
  return null
}

function findScrollableAncestor(target: HTMLElement, stopAt: HTMLElement | null) {
  let node: HTMLElement | null = target
  while (node && node !== stopAt) {
    const style = getComputedStyle(node)
    const oy = style.overflowY
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && isScrollable(node)) return node
    node = node.parentElement
  }
  return null
}

function activeSlideRoot(shell: HTMLElement) {
  return shell.querySelector(".home-slide-panel.is-slide-active")
}

function activeAppRoot(shell: HTMLElement) {
  return shell.querySelector(".app-stage-panel.is-active")
}

function slideLayerVisible(shell: HTMLElement) {
  const layer = shell.querySelector(".stage-layer--slide")
  return Boolean(layer?.classList.contains("is-visible"))
}

function appLayerVisible(shell: HTMLElement) {
  const layer = shell.querySelector(".stage-layer--app")
  return Boolean(layer?.classList.contains("is-visible"))
}

export function bindGutterWheelScroll(shell: HTMLElement) {
  const onWheel = (event: WheelEvent) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    let scrollRoot: ParentNode | null = null
    let selectors: string[] = []
    let scope: HTMLElement | null = null

    if (slideLayerVisible(shell)) {
      scrollRoot = activeSlideRoot(shell)
      selectors = SLIDE_SCROLL_SELECTORS
      scope = scrollRoot instanceof HTMLElement ? scrollRoot : null
    } else if (appLayerVisible(shell)) {
      scrollRoot = activeAppRoot(shell)
      selectors = APP_SCROLL_SELECTORS
      scope = scrollRoot instanceof HTMLElement ? scrollRoot : null
    }

    if (!scrollRoot || !scope) return

    const primary = findPrimaryScroll(scrollRoot, selectors)
    if (!primary) return

    const inScope = scope.contains(target) || target === scope
    const nested = findScrollableAncestor(target, shell)

    if (inScope && nested && nested !== primary && canConsumeWheel(nested, event.deltaY)) return
    if (inScope && nested === primary && canConsumeWheel(primary, event.deltaY)) return

    if (!isScrollable(primary)) return

    primary.scrollTop += event.deltaY
    event.preventDefault()
  }

  shell.addEventListener("wheel", onWheel, { passive: false })
  return () => shell.removeEventListener("wheel", onWheel)
}
