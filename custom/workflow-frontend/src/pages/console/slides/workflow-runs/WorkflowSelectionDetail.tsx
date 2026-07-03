import { createMemo, createSignal, Show } from "solid-js"

import { MarkdownBody } from "../../../../components/MarkdownBody"
import { useI18n } from "../../../../i18n"
import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../../../api"
import type { WorkflowTemplate } from "../../../../data/console-model"
import { workflowEntityRunControls } from "../../../../data/workflow-entity/run-controls"
import { resolveEdgeFlow } from "./workflow-run-detail-utils"
import { WorkflowNodeIoView } from "./WorkflowNodeIoView"
import type { DetailSelection } from "./WorkflowRunDetailPanel"

export function WorkflowSelectionDetail(props: {
  selection: DetailSelection
  template: WorkflowTemplate
  run: RuntimeWorkflowRunRecord | null
  runId: string
  liveText?: string
  onRuntimeUpdated?: (run: RuntimeWorkflowRunRecord) => void
}) {
  const { t } = useI18n()
  const [retryingNodeId, setRetryingNodeId] = createSignal<string | null>(null)

  const selectedNodeId = createMemo(() => {
    const sel = props.selection
    return sel?.kind === "node" ? sel.nodeId : null
  })

  const edge = createMemo(() => {
    const sel = props.selection
    if (!sel || sel.kind !== "edge") return null
    const e = props.template.edges.find((item) => item.id === sel.edgeId)
    return e ? resolveEdgeFlow(e, props.template, props.run, t) : null
  })

  const title = createMemo(() => {
    const nodeId = selectedNodeId()
    if (nodeId) {
      return props.template.nodes.find((node) => node.id === nodeId)?.name ?? nodeId
    }
    const flow = edge()
    if (flow) return `${flow.fromLabel} → ${flow.toLabel}`
    return ""
  })

  async function retryNode(nodeId: string) {
    if (retryingNodeId()) return
    setRetryingNodeId(nodeId)
    try {
      const run = await workflowEntityRunControls(props.runId).retryNode(nodeId)
      props.onRuntimeUpdated?.(run)
    } catch (err) {
      console.error("[workflow] retry node failed", err)
    } finally {
      setRetryingNodeId(null)
    }
  }

  return (
    <Show when={props.selection}>
      <section class="wf-run-selection-detail">
        <header class="wf-run-selection-detail__head">
          <div>
            <span class="eyebrow">{t("run.selectionDetail")}</span>
            <h3>{title()}</h3>
          </div>
        </header>

        <Show when={selectedNodeId()}>
          {(nodeId) => (
            <WorkflowNodeIoView
              nodeId={nodeId()}
              template={props.template}
              run={props.run}
              liveText={props.liveText}
              onRetry={() => retryNode(nodeId())}
              retrying={retryingNodeId() === nodeId()}
            />
          )}
        </Show>

        <Show when={edge()}>
          {(flow) => (
            <div class="wf-run-detail-panel__edge wf-edge-io-inline">
              <div class="wf-run-detail-panel__meta">
                <span>{t("run.transferMode")} <b>{flow().contextMode}</b></span>
              </div>
              <p class="wf-inspector-note">{flow().contextDetail}</p>
              <Show when={flow().sessionNote}>
                <p class="wf-inspector-note wf-inspector-note--accent">{flow().sessionNote}</p>
              </Show>
              <div class="wf-io-split wf-io-split--edge">
                <div class="wf-io-pane">
                  <h4>{t("run.upstreamPrompt", { label: flow().fromLabel })}</h4>
                  <div class="wf-io-pane__body"><pre>{flow().sourcePrompt || "—"}</pre></div>
                </div>
                <div class="wf-io-pane">
                  <h4>{t("run.downstreamPrompt", { label: flow().toLabel })}</h4>
                  <div class="wf-io-pane__body"><pre>{flow().targetPrompt || "—"}</pre></div>
                </div>
              </div>
              <Show when={flow().sourceOutputPreview}>
                <div class="wf-io-pane wf-io-pane--full">
                  <h4>{t("run.upstreamPreview")}</h4>
                  <div class="wf-io-pane__body">
                    <MarkdownBody text={flow().sourceOutputPreview} class="wf-prose" />
                  </div>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </section>
    </Show>
  )
}
