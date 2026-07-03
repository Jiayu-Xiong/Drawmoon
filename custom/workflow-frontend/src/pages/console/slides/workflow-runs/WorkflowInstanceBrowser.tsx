import { createMemo, createSignal, For, Show } from "solid-js"

import type { WorkflowTemplateInfo } from "../../../../api"
import { masonryColumnCount } from "../../../../components/MasonryColumns"
import { Icon } from "../../../../components/Icon"
import { Glass } from "../../shared/core"
import { filterAndSortInstances, type WorkflowInstanceItem, type WorkflowSortMode } from "./instance-utils"
import { WorkflowInstanceCard } from "./WorkflowInstanceCard"

export function WorkflowInstanceBrowser(props: {
  items: WorkflowInstanceItem[]
  templates: WorkflowTemplateInfo[]
  sortMode: WorkflowSortMode
  query: string
  panelWidth: number
  loading: boolean
  focusId?: string | null
  onSort: (mode: WorkflowSortMode) => void
  onQuery: (value: string) => void
  onOpen: (item: WorkflowInstanceItem) => void
  onRename: (item: WorkflowInstanceItem, name: string) => void
  onDelete: (item: WorkflowInstanceItem) => void
  onStartRun: (templateId: string) => void
  onRefresh: () => void
}) {
  const [showTemplates, setShowTemplates] = createSignal(false)
  const cards = createMemo(() => filterAndSortInstances(props.items, props.query, props.sortMode))
  const columns = createMemo(() => masonryColumnCount(props.panelWidth, 300, 3))
  const metrics = createMemo(() => ({
    running: props.items.filter((item) => item.status === "running").length,
    completed: props.items.filter((item) => item.status === "completed" || item.status === "success").length,
    failed: props.items.filter((item) => item.status === "failed").length,
    total: props.items.length,
  }))

  return (
    <div class="workflow-instance-browser">
      <Glass class="workflow-summary-banner">
        <div>
          <span class="eyebrow">Workflow Instances</span>
          <h2>Runs & History</h2>
          <p>{metrics().running} running · {metrics().completed} completed · {metrics().failed} failed · {metrics().total} total</p>
        </div>
        <div class="workflow-summary-tools">
          <button type="button" classList={{ active: props.sortMode === "time" }} onClick={() => props.onSort("time")}>Time</button>
          <button type="button" classList={{ active: props.sortMode === "template" }} onClick={() => props.onSort("template")}>Template</button>
          <button type="button" classList={{ active: props.sortMode === "name" }} onClick={() => props.onSort("name")}>Name</button>
          <input
            value={props.query}
            placeholder="Search name, template, time…"
            onInput={(event) => props.onQuery(event.currentTarget.value)}
          />
          <button type="button" title="Refresh runs" onClick={props.onRefresh}><Icon name="play" size={14} /></button>
          <button type="button" classList={{ active: showTemplates() }} onClick={() => setShowTemplates((value) => !value)}>
            <Icon name="template" size={14} /> New Run
          </button>
        </div>
      </Glass>

      <Show when={showTemplates()}>
        <Glass class="workflow-template-launcher">
          <span class="eyebrow">Start from Template</span>
          <div class="template-launcher-grid">
            <For each={props.templates}>
              {(template) => (
                <button type="button" class="template-launcher-card" onClick={() => { props.onStartRun(template.id); setShowTemplates(false) }}>
                  <Icon name="template" size={18} />
                  <div>
                    <strong>{template.name}</strong>
                    <em>{template.id} · v{template.version} · {template.nodeCount} nodes</em>
                    <p>{template.description ?? ""}</p>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Glass>
      </Show>

      <Show when={props.loading}>
        <Glass class="workflow-summary-empty"><p>Loading workflow runs…</p></Glass>
      </Show>

      <Show when={!props.loading && cards().length > 0}>
        <div
          class="workflow-instance-grid workflow-instance-grid--stable"
          style={{ "--wf-grid-cols": String(columns()) }}
        >
          <For each={cards()}>
            {(item) => (
              <WorkflowInstanceCard
                item={item}
                focused={props.focusId === item.id}
                onOpen={() => props.onOpen(item)}
                onRename={(name) => props.onRename(item, name)}
                onDelete={() => props.onDelete(item)}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={!props.loading && cards().length === 0}>
        <Glass class="workflow-summary-empty">
          <Icon name="workflow" size={32} />
          <h3>No workflow instances</h3>
          <p>Start the local runtime and refresh, or launch a run from a template.</p>
        </Glass>
      </Show>
    </div>
  )
}
