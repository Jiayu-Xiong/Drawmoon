import { canonicalViewerKey } from "./artifact-viewer-key"

const pool = new Map<string, HTMLIFrameElement>()

export function adoptPdfIframe(
  host: HTMLElement,
  href: string,
  options?: { title?: string; className?: string },
): HTMLIFrameElement {
  const key = canonicalViewerKey(href)
  let frame = key ? pool.get(key) : undefined
  if (!frame) {
    frame = document.createElement("iframe")
    frame.className = options?.className ?? "document-viewer-frame document-viewer-frame--pdf"
    frame.title = options?.title ?? "PDF preview"
    if (key) pool.set(key, frame)
  }
  if (options?.title) frame.title = options.title
  if (options?.className) frame.className = options.className
  if (key) frame.dataset.viewerKey = key
  const loadedKey = frame.src ? canonicalViewerKey(frame.src) : ""
  if (!frame.src || (key && loadedKey !== key)) {
    frame.src = href
    if (key) frame.dataset.viewerKey = key
  }
  if (frame.parentElement !== host) {
    host.replaceChildren(frame)
  }
  return frame
}

export function releasePdfIframeHost(host: HTMLElement | undefined) {
  const frame = host?.querySelector("iframe")
  if (frame?.parentElement === host) frame.remove()
}
