import { For, Show } from "solid-js"

import { AgentModeStrategyEditor } from "../../../../components/AgentModeStrategyEditor"
import { NodeSessionInspector } from "./NodeSessionInspector"
import { NodeToolsInspector } from "./NodeToolsInspector"
import {
  agentModeById,
  executionLabel,
} from "../../shared/core"
import { getAgentModeTemplate } from "../../../../data/template-registry"
import { resolveMergedAgentModeTemplate } from "../../../../data/agent-mode-templates/opencode-custom-template"
import { isCliStrategyMode } from "../../../../data/agent-mode-strategy-kv"
import type { AgentModeGroup, ExecutorBinding, ExecutorModelSource, ModelOption } from "../../../../data/node-executor-binding"
import type {
  AgentDefinition,
  AgentRuntimeMode,
  ExecutionMode,
  NodeModality,
  PromptOverrides,
  RuntimeOverrides,
  WorkflowNode,
  WorkflowTemplate,
} from "../../../../data/console-model"

export interface EditorNodeInspectorProps {
  template: WorkflowTemplate
  node: WorkflowNode
  agentModeGroups: AgentModeGroup[]
  modelOptions: ModelOption[]
  executorBinding: ExecutorBinding
  modelSource: ExecutorModelSource
  filteredRuntimeModes: AgentRuntimeMode[]
  executionKind: ExecutionMode
  templateAgentOptions: AgentDefinition[]
  onTemplateChange: (next: WorkflowTemplate) => void
  onUpdateNode: (patch: Partial<WorkflowNode>) => void
  onUpdatePromptOverrides: (patch: Partial<PromptOverrides>) => void
  onUpdateRuntimeOverrides: (patch: Partial<RuntimeOverrides>) => void
  onRepairBinding: () => void
  onExecutionMode: (mode: ExecutionMode) => void
  onModality: (modality: NodeModality) => void
  onAgentModeChange: (agentModeId: string) => void
  onModelOptionChange: (option: ModelOption) => void
}

export function EditorNodeInspector(props: EditorNodeInspectorProps) {
  const node = () => props.node
  const boundAgentMode = () => {
    const id = node().agentModeTemplateId
    return resolveMergedAgentModeTemplate(id) ?? getAgentModeTemplate(id) ?? agentModeById(id)
  }
  const showCliStrategy = () => !isSpecialStep() && boundAgentMode() && isCliStrategyMode(boundAgentMode()!)
  const isSpecialStep = () => {
    const mode = node().executionMode ?? "agent-mode"
    return mode === "tool" || mode === "human-gate" || mode === "inquiry"
  }
  const selectedModelValue = () => {
    if (props.modelSource === "llm-api") {
      return props.executorBinding.llmApiTemplateId ?? props.modelOptions[0]?.id ?? ""
    }
    return props.executorBinding.cliModelId ?? props.modelOptions[0]?.id ?? ""
  }

  return (
    <aside class="step-properties wf-glass">
      <div class="panel-heading"><span>Node Object</span><strong>{node().kind ?? "none"}</strong></div>
      <div class="prop-stack">
        <label>Step name<input value={node().name} onInput={(e) => props.onUpdateNode({ name: e.currentTarget.value })} /></label>
        <label>Node prompt<textarea class="wf-node-prompt-editor" rows={14} value={node().promptPreview} onInput={(e) => props.onUpdateNode({ promptPreview: e.currentTarget.value })} /></label>
        <div class="wf-node-binding-summary">
          <span>agent mode <b>{agentModeById(node().agentModeTemplateId)?.name ?? "—"}</b></span>
          <Show when={props.modelSource === "llm-api"}>
            <span>API model <b>{props.executorBinding.effectiveModel || "workflow-selected"}</b></span>
          </Show>
          <Show when={props.modelSource === "cli-native"}>
            <span>CLI model <b>{props.executorBinding.effectiveModel || "native"}</b></span>
          </Show>
          <Show when={(node().promptOverrides?.userPromptBias || node().biasPrompt)}>
            <span>bias <b>set</b></span>
          </Show>
          <Show when={(node().toolConstraints?.forcedSkills ?? []).length}>
            <span>skills <b>{node().toolConstraints!.forcedSkills!.join(", ")}</b></span>
          </Show>
        </div>
        <label>Modality<select value={node().modality ?? "text"} onChange={(event) => props.onModality(event.currentTarget.value as NodeModality)}>
          <option value="text">text</option>
          <option value="image">image</option>
          <option value="audio">audio</option>
        </select></label>
        <label>Step kind<select value={node().executionMode ?? "agent-mode"} onChange={(event) => props.onExecutionMode(event.currentTarget.value as ExecutionMode)}>
          <option value="agent-mode">Agent executor</option>
          <option value="tool">Tool step</option>
          <option value="human-gate">Human gate</option>
          <option value="inquiry">Inquiry (问询)</option>
        </select></label>
        <Show when={!isSpecialStep()}>
          <label>Agent mode<select
            value={node().agentModeTemplateId ?? props.executorBinding.agentModeId}
            onChange={(event) => props.onAgentModeChange(event.currentTarget.value)}
          >
            <For each={props.agentModeGroups}>
              {(group) => (
                <optgroup label={group.label}>
                  <For each={group.modes}>
                    {(mode) => <option value={mode.id}>{mode.name}</option>}
                  </For>
                </optgroup>
              )}
            </For>
          </select></label>
          <Show when={props.modelOptions.length}>
            <label>{props.modelSource === "llm-api" ? "LLM API template" : "CLI model"}<select
              key={`model-${node().id}-${selectedModelValue()}`}
              value={selectedModelValue()}
              onChange={(event) => {
                const option = props.modelOptions.find((item) => item.id === event.currentTarget.value)
                if (option) props.onModelOptionChange(option)
              }}
            >
              <For each={props.modelOptions}>
                {(option) => (
                  <option value={option.id}>
                    {option.kind === "llm-api" ? `${option.name} / ${option.model}` : `${option.name}${option.statusLabel ? ` (${option.statusLabel})` : ""}`}
                  </option>
                )}
              </For>
            </select></label>
          </Show>
          <Show when={!props.modelOptions.length && props.modelSource === "llm-api"}>
            <p class="field-warning">No API template supports {node().modality ?? "text"} yet. Add one in LLM API templates.</p>
          </Show>
          <Show when={props.filteredRuntimeModes.length > 1}>
            <label>Runtime mode<select value={node().runtimeMode ?? props.filteredRuntimeModes[0] ?? "build"} onChange={(event) => props.onUpdateNode({ runtimeMode: event.currentTarget.value as AgentRuntimeMode })}>
              <For each={props.filteredRuntimeModes}>{(mode) => <option value={mode}>{mode}</option>}</For>
            </select></label>
          </Show>
          <Show when={showCliStrategy()}>
            <AgentModeStrategyEditor compact readOnly mode={boundAgentMode()!} />
          </Show>
        </Show>
        <div class="template-summary">
          <span>{executionLabel(node())}</span>
          <b>{props.executorBinding.executionMode ?? node().executionMode ?? "agent-mode"}</b>
        </div>
        <NodeSessionInspector template={props.template} node={node()} onTemplateChange={props.onTemplateChange} />
        <NodeToolsInspector template={props.template} node={node()} onTemplateChange={props.onTemplateChange} />
        <label>Object agent<select value={node().agentId} onChange={(event) => props.onUpdateNode({ agentId: event.currentTarget.value })}>
          <For each={props.templateAgentOptions}>{(agent) => <option value={agent.id}>{agent.name}</option>}</For>
        </select></label>
        <label>Execution output<textarea value={node().outputContract} onInput={(event) => props.onUpdateNode({ outputContract: event.currentTarget.value })} /></label>
        <label>Stage<select value={node().stageId} onChange={(event) => props.onUpdateNode({ stageId: event.currentTarget.value })}>
          <For each={props.template.stages}>{(stage) => <option value={stage.id}>{stage.name}</option>}</For>
        </select></label>
        <details class="advanced-section">
          <summary>Advanced overrides</summary>
          <div class="advanced-stack">
            <label>Model override<input value={node().runtimeOverrides?.model ?? ""} onInput={(e) => props.onUpdateRuntimeOverrides({ model: e.currentTarget.value })} /></label>
            <button type="button" class="wf-binding-repair" onClick={props.onRepairBinding}>normalize executor binding</button>
          </div>
        </details>
      </div>
    </aside>
  )
}
