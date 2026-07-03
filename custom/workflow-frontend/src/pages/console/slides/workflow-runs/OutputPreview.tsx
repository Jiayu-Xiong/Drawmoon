import { createMemo, For, Show } from "solid-js"

import { artifactViewerKey, reuseArtifactIdentities } from "../../../../components/artifact-viewer-key"
import { MarkdownBody } from "../../../../components/MarkdownBody"
import { StreamingOutput } from "../../../../components/StreamingOutput"
import { useI18n } from "../../../../i18n"
import {
  isImageArtifact,
  isPreviewableArtifact,
  WorkflowArtifactPreview,
  type DisplayArtifact,
} from "./workflow-artifact-preview"

function previewRank(artifact: DisplayArtifact) {
  if (isImageArtifact(artifact)) return 0
  if (/\.pdf($|\?)/i.test(artifact.href) || artifact.kind === "pdf") return 1
  if (/\.(md|markdown|tex)($|\?)/i.test(artifact.href) || artifact.kind === "markdown") return 2
  if (/\.html?($|\?)/i.test(artifact.href) || artifact.kind === "html") return 3
  return 4
}

function isVisualArtifact(artifact: DisplayArtifact) {
  return isImageArtifact(artifact) || /\.pdf($|\?)/i.test(artifact.href) || artifact.kind === "pdf"
}

function dedupePreviewArtifacts(artifacts: DisplayArtifact[]) {
  const sorted = [...artifacts].sort((a, b) => previewRank(a) - previewRank(b))
  const hasVisual = sorted.some(isVisualArtifact)
  if (!hasVisual) return sorted
  return sorted.filter((artifact) => {
    if (isVisualArtifact(artifact)) return true
    if (/\.(md|markdown|tex|html?)($|\?)/i.test(artifact.href)) return false
    return true
  })
}

function shouldShowTextOutput(output: string, prompt: string | undefined, artifacts: DisplayArtifact[], isLive: boolean) {
  const text = output.trim()
  if (isLive) return text.length > 0
  if (artifacts.some(isVisualArtifact)) return false
  if (!text) return false
  const promptText = prompt?.trim() ?? ""
  if (promptText && text === promptText) return false
  if (promptText && text.length > 80 && promptText.length > 40 && text.startsWith(promptText.slice(0, 80))) return false
  if (artifacts.some((item) => /\.(md|markdown|tex|html?)($|\?)/i.test(item.href))) return false
  return true
}

function stablePreviewArtifacts(artifacts: DisplayArtifact[]) {
  const next = dedupePreviewArtifacts(artifacts.filter(isPreviewableArtifact))
  return next
}

export function OutputPreview(props: {
  artifacts: DisplayArtifact[]
  output: string
  prompt?: string
  isLive: boolean
  isPending: boolean
}) {
  const { t } = useI18n()
  const previewArtifacts = createMemo<DisplayArtifact[]>((prev) =>
    reuseArtifactIdentities(prev, stablePreviewArtifacts(props.artifacts)),
  )
  const showTextOutput = createMemo(() =>
    shouldShowTextOutput(props.output, props.prompt, previewArtifacts(), props.isLive),
  )
  const hasContent = () => !props.isPending && (previewArtifacts().length > 0 || showTextOutput() || props.isLive)

  return (
    <div class="wf-output-preview" classList={{ "wf-output-preview--empty": !hasContent() }}>
      <For each={previewArtifacts()} by={artifactViewerKey}>
        {(artifact) => (
          <WorkflowArtifactPreview artifact={artifact} large expandInPlace />
        )}
      </For>
      <Show when={showTextOutput()}>
        <div class="wf-output-preview__text">
          <Show
            when={props.isLive}
            fallback={<MarkdownBody text={props.output} class="wf-prose" />}
          >
            <StreamingOutput text={props.output} live class="wf-live-console__text wf-io-pane__stream" />
          </Show>
        </div>
      </Show>
      <Show when={!hasContent()}>
        {props.isPending ? (
          <div class="wf-output-preview__placeholder" />
        ) : (
          <p class="workflow-output-empty">
            {props.isLive ? t("run.livePlaceholder") : t("run.noOutput")}
          </p>
        )}
      </Show>
    </div>
  )
}
