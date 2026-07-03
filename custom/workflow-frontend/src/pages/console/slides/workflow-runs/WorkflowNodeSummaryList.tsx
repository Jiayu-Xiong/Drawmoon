import { For } from "solid-js"

import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../../../api"
import type { WorkflowTemplate } from "../../../../data/console-model"
import { useI18n } from "../../../../i18n"
import { formatNodeStatus, resolveEffectiveNodeStatus } from "./workflow-run-detail-utils"

export function WorkflowNodeSummaryList(props: {
  template: WorkflowTemplate
  run: RuntimeWorkflowRunRecord | null
  selectedNodeId?: string
  onSelectNode: (nodeId: string) => void
}) {
  const { t } = useI18n()

  return (
    <div class="wf-node-summary-list">
      <h4>{t("run.runSteps")}</h4>
      <For each={props.template.nodes}>
        {(node, index) => {
          const status = () => resolveEffectiveNodeStatus(node.id, props.run)
          return (
            <button
              type="button"
              class="wf-node-summary-item wf-node-summary-item--row"
              classList={{ "is-selected": props.selectedNodeId === node.id }}
              onClick={() => props.onSelectNode(node.id)}
            >
              <span class="wf-node-summary-item__index">{index() + 1}</span>
              <span class="wf-node-summary-item__label">{node.name}</span>
              <span class={`wf-node-summary-item__status state-${node.state ?? "waiting"}`}>
                {formatNodeStatus(status())}
              </span>
            </button>
          )
        }}
      </For>
    </div>
  )
}
