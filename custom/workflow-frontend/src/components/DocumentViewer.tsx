import { createEffect, createMemo, createResource, on, onCleanup, onMount, Show } from "solid-js"

import { canonicalViewerKey } from "./artifact-viewer-key"
import { adoptPdfIframe, releasePdfIframeHost } from "./pdf-viewer-cache"
import { MarkdownBody } from "./MarkdownBody"

export type DocumentViewerKind = "markdown" | "html" | "pdf" | "auto"

function detectKind(href: string, explicit?: DocumentViewerKind): DocumentViewerKind {
  if (explicit && explicit !== "auto") return explicit
  if (/\.pdf($|\?)/i.test(href)) return "pdf"
  if (/\.html?($|\?)/i.test(href)) return "html"
  return "markdown"
}

function PdfEmbedFrame(props: { href: string; title?: string; class?: string }) {
  let host: HTMLDivElement | undefined
  const viewerKey = createMemo(() => canonicalViewerKey(props.href))
  const className = () => props.class ?? "document-viewer-frame document-viewer-frame--pdf"

  onMount(() => {
    if (!host) return
    adoptPdfIframe(host, props.href, { title: props.title, className: className() })
  })

  createEffect(on(viewerKey, (key, prevKey) => {
    if (!host || !key || key === prevKey) return
    adoptPdfIframe(host, props.href, { title: props.title, className: className() })
  }))

  onCleanup(() => releasePdfIframeHost(host))

  return <div ref={host} class="pdf-embed-host" />
}

export function DocumentViewer(props: {
  href: string
  title?: string
  kind?: DocumentViewerKind
  markdown?: string
  class?: string
  showExternalLink?: boolean
  embed?: boolean
}) {
  const kind = createMemo(() => detectKind(props.href, props.kind))
  const fetchedDocumentKey = createMemo(() => {
    if (props.markdown) return null
    if (kind() !== "markdown" && kind() !== "html") return null
    return canonicalViewerKey(props.href)
  })
  const [documentText] = createResource(
    fetchedDocumentKey,
    async () => {
      const response = await fetch(props.href, { cache: "no-store" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.text()
    },
  )
  const markdownText = createMemo(() => props.markdown ?? (kind() === "markdown" ? documentText() : undefined))

  return (
    <div
      class={`document-viewer${props.embed ? " document-viewer--embed" : ""}${props.class ? ` ${props.class}` : ""}`}
    >
      <Show when={props.title}>
        <div class="document-viewer-head">
          <strong>{props.title}</strong>
          <Show when={props.showExternalLink !== false}>
            <a href={props.href} target="_blank" rel="noreferrer">Open in new tab</a>
          </Show>
        </div>
      </Show>
      <Show when={kind() === "markdown"}>
        <Show
          when={!documentText.loading}
          fallback={<p class="document-viewer-status">Loading preview…</p>}
        >
          <Show
            when={!documentText.error}
            fallback={(
              <iframe
                class="document-viewer-frame"
                title={props.title ?? "Markdown preview"}
                src={props.href}
              />
            )}
          >
            <Show
              when={markdownText()}
              fallback={<iframe class="document-viewer-frame" title={props.title ?? "Markdown preview"} src={props.href} />}
            >
              {(text) => <MarkdownBody text={text()} class="wf-prose document-viewer-markdown" />}
            </Show>
          </Show>
        </Show>
      </Show>
      <Show when={kind() === "html"}>
        <Show
          when={!documentText.loading}
          fallback={<p class="document-viewer-status">Loading preview…</p>}
        >
          <iframe
            class="document-viewer-frame document-viewer-frame--html"
            title={props.title ?? "HTML preview"}
            src={documentText.error || !documentText() ? props.href : undefined}
            srcdoc={documentText.error ? undefined : documentText()}
            sandbox="allow-same-origin allow-popups allow-forms"
          />
        </Show>
      </Show>
      <Show when={kind() === "pdf"}>
        <PdfEmbedFrame
          href={props.href}
          title={props.title ?? "PDF preview"}
        />
      </Show>
    </div>
  )
}
