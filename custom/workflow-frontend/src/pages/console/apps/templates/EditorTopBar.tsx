import { For, Show } from "solid-js"

import { AppButton } from "../../shared/core"
import type { AgentDefinition, WorkflowTemplate } from "../../../../data/console-model"

export interface EditorTopBarProps {
  template: WorkflowTemplate
  workflowTemplates: WorkflowTemplate[]
  templatesLoading?: boolean
  templateAgentOptions: AgentDefinition[]
  onSelectTemplate: (id: string) => void
  onNewTemplate: () => void
  onTemplateChange: (updater: (item: WorkflowTemplate) => WorkflowTemplate) => void
}

export function EditorTopBar(props: EditorTopBarProps) {
  return (
    <header class="template-editor-topbar">
      <div class="template-topbar-left">
        <select
          class="template-select"
          onInput={(event) => props.onSelectTemplate(event.currentTarget.value)}
          disabled={props.templatesLoading}
        >
          <Show when={props.templatesLoading}>
            <option value="">Loading templates…</option>
          </Show>
          <For each={props.workflowTemplates}>
            {(item) => (
              <option value={item.id} selected={item.id === props.template.id}>
                {item.name}
              </option>
            )}
          </For>
        </select>
        <AppButton icon="plus" variant="primary" onClick={props.onNewTemplate}>New Template</AppButton>
      </div>
      <div class="template-topbar-props">
        <label>Name<input value={props.template.name} onInput={(event) => props.onTemplateChange((item) => ({ ...item, name: event.currentTarget.value }))} /></label>
        <label>CWD<input value={props.template.workingDirectory} onInput={(event) => props.onTemplateChange((item) => ({ ...item, workingDirectory: event.currentTarget.value }))} /></label>
        <label>Agent<select value={props.template.defaultAgentId} onChange={(event) => props.onTemplateChange((item) => ({ ...item, defaultAgentId: event.currentTarget.value }))}>
          <For each={props.templateAgentOptions}>{(agent) => <option value={agent.id}>{agent.name}</option>}</For>
        </select></label>
      </div>
    </header>
  )
}
