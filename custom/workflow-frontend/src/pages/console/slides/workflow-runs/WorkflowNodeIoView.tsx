import { createMemo, Show } from "solid-js"

import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../../../api"
import type { WorkflowTemplate } from "../../../../data/console-model"
import { useI18n } from "../../../../i18n"
import { reuseArtifactIdentities } from "../../../../components/artifact-viewer-key"
import { formatNodeStatus, resolveNodeDetail } from "./workflow-run-detail-utils"
import { WorkflowArtifactGallery, type DisplayArtifact } from "./workflow-artifact-preview"
import { OutputPreview } from "./OutputPreview"

export type NodeDetailInfo = {
  id: string
  label: string
  status: string
  prompt: string
  output: string
  isLive: boolean
  readRunFiles: string[]
  outputFile?: string
  sessionId?: string
  error?: string
  artifacts: import("./workflow-artifact-preview").DisplayArtifact[]
  primaryMarkdown?: import("./workflow-artifact-preview").DisplayArtifact
  primaryImage?: import("./workflow-artifact-preview").DisplayArtifact
  hasRichOutput: boolean
}

export function WorkflowNodeIoView(props: {
  nodeId: string
  template: WorkflowTemplate
  run: RuntimeWorkflowRunRecord | null
  liveText?: string
  onRetry?: () => void
  retrying?: boolean
}) {
  const { t } = useI18n()
  const detail = createMemo(() =>
    resolveNodeDetail(props.nodeId, props.template, props.run, props.liveText),
  )
  const isPending = createMemo(() => {
    const node = detail()
    return (node.status === "waiting" || node.status === "queued" || node.status === "pending")
      && !node.isLive
      && !node.hasRichOutput
  })
  const extraArtifacts = createMemo<DisplayArtifact[]>((prev) => reuseArtifactIdentities(prev, detail().artifacts.filter((artifact) => {
    const shownInOutput = /\.(png|jpe?g|webp|gif|svg|md|markdown|tex|html?|pdf)($|\?)/i.test(artifact.href)
      || artifact.kind === "image"
      || artifact.kind === "markdown"
      || artifact.kind === "pdf"
    return !shownInOutput
  })))

  return (
    <div class="wf-node-io-view">
      <div class="wf-run-detail-panel__meta">
        <span>{t("run.status")} <b>{formatNodeStatus(detail().status)}</b></span>
        <Show when={detail().sessionId}><span>session <b>{detail().sessionId}</b></span></Show>
        <Show when={detail().outputFile}><span>file <b>{detail().outputFile}</b></span></Show>
        <Show when={(detail().status === "failed" || detail().error) && props.onRetry}>
          <button
            type="button"
            class="wf-button wf-button--small"
            disabled={props.retrying}
            onClick={props.onRetry}
          >
            {props.retrying ? t("run.retryingNode") : t("run.retryNode")}
          </button>
        </Show>
      </div>
      <Show when={detail().error}>
        <div class="wf-run-detail-panel__error" role="alert">
          <h4>{t("run.nodeError")}</h4>
          <pre>{detail().error}</pre>
        </div>
      </Show>
      <div class="wf-io-split">
        <div class="wf-io-pane wf-io-pane--prompt">
          <h4>{t("run.inputPrompt")}</h4>
          <div class="wf-io-pane__body wf-io-pane__body--prompt">
            <pre>{detail().prompt || "—"}</pre>
          </div>
        </div>
        <div class="wf-io-pane wf-io-pane--output">
          <h4>{detail().isLive ? t("run.outputStreaming") : t("run.output")}</h4>
          <div class="wf-io-pane__body wf-io-pane__body--output">
            <OutputPreview
              artifacts={detail().artifacts}
              output={detail().output}
              prompt={detail().prompt}
              isLive={detail().isLive}
              isPending={isPending()}
            />
          </div>
        </div>
      </div>
      <Show when={extraArtifacts().length}>
        <div class="wf-node-io-view__artifacts">
          <h4>{t("run.nodeArtifacts")}</h4>
          <WorkflowArtifactGallery artifacts={extraArtifacts()} largeImages expandInPlace emptyLabel={t("run.noArtifacts")} />
        </div>
      </Show>
    </div>
  )
}
