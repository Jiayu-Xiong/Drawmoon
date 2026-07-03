import { createMemo } from "solid-js"

import { Icon } from "../../../../components/Icon"
import type { BackendProvider, SystemSnapshot } from "../../../../data/console-model"
import { listLlmApiTemplates } from "../../../../data/llm-api-templates"
import { workflowTemplates, statusClass } from "../../shared/core"
import { resolveLlmApiStatus } from "./node-detail-utils"

export function LlmApiStatusCard(props: {
  api: ReturnType<typeof listLlmApiTemplates>[number]
  providers: BackendProvider[]
  snapshot: SystemSnapshot
}) {
  const status = createMemo(() => resolveLlmApiStatus(props.api, props.providers, props.snapshot))
  const usedBy = createMemo(() => workflowTemplates.reduce((sum, template) => sum + template.nodes.filter((node) => node.llmApiTemplateId === props.api.id).length, 0))
  return (
    <article class={`node-manager-card slide-data-card ${statusClass(status())}`}>
      <div class="node-manager-card-head">
        <Icon name="api" size={16} />
        <span>{props.api.name}</span>
        <b class={statusClass(status())}>{status()}</b>
      </div>
      <p class="path-line">{props.api.endpoint}</p>
      <div class="registry-meta-grid">
        <span>model <b>{props.api.model}</b></span>
        <span>context <b>{props.api.contextWindow > 0 ? props.api.contextWindow.toLocaleString() : "—"}</b></span>
        <span>protocol <b>{props.api.protocol}</b></span>
        <span>format <b>{props.api.responseFormat}</b></span>
        <span>nodes <b>{usedBy()}</b></span>
      </div>
    </article>
  )
}
