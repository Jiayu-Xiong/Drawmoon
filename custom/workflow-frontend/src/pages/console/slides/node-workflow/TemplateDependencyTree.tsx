import { createMemo, For, Show } from "solid-js"

import type { WorkflowRunListItem } from "../../../../api"
import { Icon } from "../../../../components/Icon"
import { resolveExecutorBinding } from "../../../../data/node-executor-binding"
import {
  agentModeById,
  executionLabel,
  Glass,
  nodeIcon,
} from "../../shared/core"

export function TemplateDependencyTree(props: {
  template: WorkflowTemplate
  runs: WorkflowRunListItem[]
  templates?: WorkflowTemplate[]
  selectedTemplateId?: string
  onSelectTemplate?: (templateId: string) => void
}) {
  const activeRuns = createMemo(() => props.runs.filter((run) => run.templateId === props.template.id && ["queued", "running"].includes(run.status)))
  const dependencyRows = createMemo(() => props.template.nodes.map((node) => {
    const binding = resolveExecutorBinding(node, props.template)
    const mode = node.agentModeTemplateId ? agentModeById(node.agentModeTemplateId) : null
    const kind = binding.isDirectApi || node.executionMode === "llm-api"
      ? "API"
      : binding.modelSource === "cli-native"
        ? "CLI"
        : "Agent"
    const executor = mode?.name ?? executionLabel(node, props.template)
    const model = binding.effectiveModel
    return { node, kind, executor, model }
  }))
  const canSwitchTemplate = () => Boolean(props.templates?.length && props.onSelectTemplate)

  return (
    <Glass class="template-dependency-card slide-data-card">
      <div class="template-tree-head">
        <div class="template-tree-head-main">
          <span class="eyebrow">Workflow Template</span>
          <Show
            when={canSwitchTemplate()}
            fallback={<h3>{props.template.name}</h3>}
          >
            <select
              class="template-select template-tree-select"
              onInput={(event) => props.onSelectTemplate?.(event.currentTarget.value)}
            >
              <For each={props.templates}>
                {(item) => (
                  <option
                    value={item.id}
                    selected={item.id === (props.selectedTemplateId ?? props.template.id)}
                  >
                    {item.name}
                  </option>
                )}
              </For>
            </select>
          </Show>
        </div>
        <div class="template-tree-run-state">
          <strong>{activeRuns().length ? `${activeRuns().length} running` : "no active entity"}</strong>
          <span>{props.template.nodes.length} steps</span>
        </div>
      </div>
      <div class="template-dependency-list">
        <For each={dependencyRows()}>
          {(row, index) => (
            <article class="template-dependency-row">
              <span class="template-dependency-index">{index() + 1}</span>
              <Icon name={nodeIcon(row.node.kind)} size={14} />
              <div class="template-dependency-main">
                <strong class="template-dependency-name">{row.node.name}</strong>
                <div class="template-dependency-meta">
                  <em class="template-dependency-kind">{row.kind}</em>
                  <b class="template-dependency-executor">{row.executor}</b>
                  <Show when={row.model}>
                    <span class="template-dependency-model">{row.model}</span>
                  </Show>
                </div>
              </div>
            </article>
          )}
        </For>
      </div>
      <Show when={activeRuns().length}>
        <div class="template-dependency-active">
          <For each={activeRuns()}>
            {(run) => <span>{run.name} · {run.status} · {run.progress.percent}%</span>}
          </For>
        </div>
      </Show>
    </Glass>
  )
}
