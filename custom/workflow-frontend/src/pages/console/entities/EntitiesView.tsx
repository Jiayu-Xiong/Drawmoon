import { For } from "solid-js"

import { Icon } from "../../../components/Icon"
import type { WorkflowEntity } from "../../../data/console-model"
import { TokenUsageCard } from "../../../components/TokenUsageCard"
import { Glass, MiniBelt, statusClass, getWorkflowEntityList } from "../shared/core"
export function EntitiesView(props: { onEntity: (entity: WorkflowEntity) => void }) {
  return (
    <div class="view-stack">
      <header class="view-heading">
        <span class="eyebrow">Workflow Entities</span>
        <h2>Runtime conveyor overview</h2>
      </header>
      <div class="entity-list">
        <For each={getWorkflowEntityList()}>
          {(entity) => {
            const current = entity.columnStates[entity.currentColumn - 1]
            return (
              <Glass class="entity-card">
                <button class="entity-card-hit" onClick={() => props.onEntity(entity)} />
                <div class="entity-card-top">
                  <div>
                    <strong>{entity.name}</strong>
                    <span class={`state-badge ${statusClass(entity.status)}`}>{entity.status}</span>
                  </div>
                  <div class="entity-numbers">
                    <b>col {entity.currentColumn} / {entity.columnStates.length}</b>
                    <span>parallel {current?.parallel ?? 0}</span>
                    <span>done {current?.done ?? 0} / {current?.parallel ?? 0}</span>
                    <button class="entity-open-button" title="Open workflow" onClick={() => props.onEntity(entity)}><Icon name="play" size={14} /></button>
                  </div>
                </div>
                <MiniBelt entity={entity} />
                <TokenUsageCard usage={entity.tokenUsage} compact />
              </Glass>
            )
          }}
        </For>
      </div>
    </div>
  )
}

