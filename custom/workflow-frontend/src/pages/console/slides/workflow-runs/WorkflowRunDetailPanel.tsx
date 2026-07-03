import { createMemo, Show } from "solid-js"

import { MarkdownBody } from "../../../../components/MarkdownBody"
import { DocumentViewer } from "../../../../components/DocumentViewer"
import { useI18n } from "../../../../i18n"
import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../../../api"
import type { WorkflowTemplate } from "../../../../data/console-model"
import {
  allRunArtifacts,
  finalOutputCaption,
} from "./workflow-run-detail-utils"
import { reuseArtifactIdentities } from "../../../../components/artifact-viewer-key"
import { WorkflowArtifactGallery, type DisplayArtifact } from "./workflow-artifact-preview"
import { WorkflowNodeSummaryList } from "./WorkflowNodeSummaryList"

export type DetailSelection =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string }
  | null

export function WorkflowRunDetailPanel(props: {
  selection: DetailSelection
  template: WorkflowTemplate
  run: RuntimeWorkflowRunRecord | null
  runId: string
  runLoading?: boolean
  liveOutputs?: Record<string, string>
  onSelectNode?: (nodeId: string) => void
  onRuntimeUpdated?: (run: RuntimeWorkflowRunRecord) => void
}) {
  const { t } = useI18n()

  const deliverables = createMemo<DisplayArtifact[]>((prev) =>
    reuseArtifactIdentities(prev, props.run ? allRunArtifacts(props.run) : []),
  )
  const finalCaption = createMemo(() => finalOutputCaption(props.run, props.template, t))
  const finalNovelArtifact = createMemo(() =>
    deliverables().find((item) => /final-novel\.(md|html)/i.test(item.href)),
  )
  const lastCompletedNodeId = createMemo(() => {
    const completed = props.run?.completedNodeIds ?? []
    return completed[completed.length - 1] ?? null
  })

  const panelTitle = () => t("run.deliverables")

  function handleArtifactClick(artifact: { nodeId?: string }) {
    if (artifact.nodeId) props.onSelectNode?.(artifact.nodeId)
  }

  function handleLastReceiptOpen() {
    const id = lastCompletedNodeId()
    if (id) props.onSelectNode?.(id)
  }

  return (
    <section class="wf-run-detail-panel">
      <header class="wf-run-detail-panel__head">
        <div>
          <span class="eyebrow">{t("run.detail")}</span>
          <h3>{panelTitle()}</h3>
        </div>
      </header>

      <div class="wf-run-detail-panel__body">
        <Show when={props.runLoading && !props.run} fallback={(
          <div class="wf-run-detail-panel__deliverables">
            <div class="wf-run-detail-panel__artifacts">
              <h4>{t("run.artifacts")}</h4>
              <WorkflowArtifactGallery
                artifacts={deliverables()}
                largeImages
                expandInPlace
                emptyLabel={t("run.noArtifacts")}
                onArtifactClick={handleArtifactClick}
              />
            </div>

            <Show when={props.onSelectNode}>
              <WorkflowNodeSummaryList
                template={props.template}
                run={props.run}
                selectedNodeId={props.selection?.kind === "node" ? props.selection.nodeId : undefined}
                onSelectNode={(nodeId) => props.onSelectNode?.(nodeId)}
              />
            </Show>

            <Show when={finalNovelArtifact()}>
              {(artifact) => (
                <details class="wf-run-detail-fold">
                  <summary>{t("run.finalManuscript")}</summary>
                  <p class="wf-final-caption">{t("run.finalManuscriptHint")}</p>
                  <DocumentViewer href={artifact().href} kind="auto" title={t("run.finalManuscript")} />
                </details>
              )}
            </Show>
            <Show when={props.run?.history?.finalOutput}>
              <details class="wf-run-detail-fold" onToggle={(event) => {
                if ((event.currentTarget as HTMLDetailsElement).open) handleLastReceiptOpen()
              }}>
                <summary>{finalCaption().title}</summary>
                <p class="wf-final-caption">{finalCaption().hint}</p>
                <MarkdownBody text={props.run!.history!.finalOutput!} class="wf-prose" />
              </details>
            </Show>
          </div>
        )}>
          <p class="workflow-output-empty wf-run-detail-panel__loading">{t("run.loadingRun")}</p>
        </Show>
      </div>
    </section>
  )
}
