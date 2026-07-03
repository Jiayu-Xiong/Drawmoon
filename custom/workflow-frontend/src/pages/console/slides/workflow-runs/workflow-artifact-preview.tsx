import { For, Show } from "solid-js"

import { DocumentViewer } from "../../../../components/DocumentViewer"
import { artifactViewerKey } from "../../../../components/artifact-viewer-key"

export type DisplayArtifact = {
  label: string
  href: string
  kind: string
  nodeId?: string
}

export function isImageArtifact(artifact: Pick<DisplayArtifact, "href" | "kind" | "label">) {
  if (artifact.kind === "image") return true
  return /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(artifact.href) || /\.(png|jpe?g|webp|gif|svg)$/i.test(artifact.label)
}

export function isPreviewableArtifact(artifact: DisplayArtifact) {
  if (isImageArtifact(artifact)) return true
  if (artifact.kind === "markdown" || artifact.kind === "pdf" || artifact.kind === "html") return true
  return /\.(md|markdown|tex|html?|pdf)($|\?)/i.test(artifact.href)
}

export function WorkflowArtifactPreview(props: {
  artifact: DisplayArtifact
  large?: boolean
  linksOnly?: boolean
  expandInPlace?: boolean
}) {
  if (isImageArtifact(props.artifact)) {
    return (
      <figure class="workflow-output-image-preview" classList={{ "workflow-output-image-preview--large": props.large }}>
        <img
          src={props.artifact.href}
          alt={props.artifact.label}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            const img = event.currentTarget
            img.classList.add("is-broken")
            img.alt = props.artifact.label
          }}
        />
        <figcaption>{props.artifact.label}</figcaption>
      </figure>
    )
  }
  const canInline = !props.linksOnly
    && (/\.(md|markdown|html?|pdf|tex)($|\?)/i.test(props.artifact.href) || props.artifact.kind === "markdown" || props.artifact.kind === "pdf")
  if (canInline && props.expandInPlace) {
    return (
      <div class="wf-artifact-inline">
        <DocumentViewer href={props.artifact.href} kind="auto" title={props.artifact.label} showExternalLink={false} embed />
      </div>
    )
  }
  if (canInline) {
    return <DocumentViewer href={props.artifact.href} kind="auto" title={props.artifact.label} showExternalLink={false} embed />
  }
  return (
    <a class="workflow-artifact-link" href={props.artifact.href} target="_blank" rel="noreferrer">
      {props.artifact.label}
    </a>
  )
}

export function WorkflowArtifactGallery(props: {
  artifacts: DisplayArtifact[]
  largeImages?: boolean
  linksOnly?: boolean
  expandInPlace?: boolean
  emptyLabel?: string
  onArtifactClick?: (artifact: DisplayArtifact) => void
}) {
  const images = () => props.artifacts.filter(isImageArtifact)
  const others = () => props.artifacts.filter((item) => !isImageArtifact(item))
  return (
    <Show when={props.artifacts.length} fallback={<p class="workflow-output-empty">{props.emptyLabel ?? "No artifacts"}</p>}>
      <div class="wf-artifact-gallery">
        <Show when={images().length}>
          <div class="wf-artifact-gallery__images">
            <For each={images()} by={artifactViewerKey}>
              {(artifact) => (
                <button
                  type="button"
                  class="wf-artifact-image-hit"
                  classList={{ "wf-artifact-image-hit--linked": Boolean(props.onArtifactClick && artifact.nodeId) }}
                  onClick={() => {
                    if (props.onArtifactClick && artifact.nodeId) props.onArtifactClick(artifact)
                  }}
                >
                  <WorkflowArtifactPreview artifact={artifact} large={props.largeImages} />
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={others().length}>
          <div class="wf-artifact-gallery__files">
            <For each={others()} by={artifactViewerKey}>
              {(artifact) => (
                <details class="wf-artifact-fold">
                  <summary
                    onClick={(event) => {
                      if (!props.onArtifactClick) return
                      event.preventDefault()
                      props.onArtifactClick(artifact)
                    }}
                  >
                    {artifact.label}
                  </summary>
                  <WorkflowArtifactPreview
                    artifact={artifact}
                    linksOnly={props.linksOnly ?? false}
                    expandInPlace={props.expandInPlace ?? true}
                  />
                </details>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  )
}
