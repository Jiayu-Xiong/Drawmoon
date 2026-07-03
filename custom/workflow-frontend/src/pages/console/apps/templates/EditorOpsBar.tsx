import { For, Show } from "solid-js"

import { AppButton, colorToHex } from "../../shared/core"
import type { WorkflowTemplate } from "../../../../data/console-model"

export interface EditorOpsBarProps {
  template: WorkflowTemplate
  runState: string
  layoutMode: "canvas" | "sessions"
  autoMode: "off" | "preview"
  autoLayoutAxis: "stage" | "sessions"
  scale: number
  importInputRef: (el: HTMLInputElement) => void
  onImport: (file?: File | null) => void
  onImportClick: () => void
  onExport: () => void
  onRun: () => void
  onSave: () => void
  onAddNode: () => void
  onDeleteNode: () => void
  onLayoutMode: (mode: "canvas" | "sessions") => void
  onFit: () => void
  onZoomOut: () => void
  onZoomIn: () => void
  onStageColor: (id: string, color: string) => void
  onAutoLayoutAxis: (axis: "stage" | "sessions") => void
  onStartAutoPreview: () => void
  onApplyAutoPreview: () => void
  onCancelAutoPreview: () => void
}

export function EditorOpsBar(props: EditorOpsBarProps) {
  return (
    <nav class="template-editor-opsbar">
      <input ref={props.importInputRef} class="file-input-hidden" type="file" accept="application/json,.json" onChange={(event) => props.onImport(event.currentTarget.files?.[0])} />
      <AppButton icon="import" onClick={props.onImportClick}>Import</AppButton>
      <AppButton icon="export" onClick={props.onExport}>Export</AppButton>
      <AppButton icon="play" variant="primary" onClick={props.onRun}>Run</AppButton>
      <AppButton icon="save" variant="primary" onClick={props.onSave}>Save</AppButton>
      <AppButton icon="status">Validate</AppButton>
      <span class="opsbar-zoom">{props.runState}</span>
      <span class="opsbar-sep" />
      <AppButton icon="plus" onClick={props.onAddNode}>Add Node</AppButton>
      <AppButton icon="trash" variant="danger" onClick={props.onDeleteNode}>Delete</AppButton>
      <span class="opsbar-sep" />
      <button type="button" class={`wf-button wf-button--soft${props.layoutMode === "canvas" ? " is-active" : ""}`} onClick={() => props.onLayoutMode("canvas")}>Canvas</button>
      <button type="button" class={`wf-button wf-button--soft${props.layoutMode === "sessions" ? " is-active" : ""}`} onClick={() => props.onLayoutMode("sessions")}>Sessions</button>
      <span class="opsbar-sep" />
      <AppButton onClick={props.onFit}>Fit</AppButton>
      <AppButton icon="zoomOut" onClick={props.onZoomOut}>Zoom</AppButton>
      <span class="opsbar-zoom">{Math.round(props.scale * 100)}%</span>
      <AppButton icon="zoomIn" onClick={props.onZoomIn}>Zoom</AppButton>
      <span class="opsbar-sep" />
      <details class="template-stage-menu">
        <summary>Stages</summary>
        <div>
          <For each={props.template.stages}>
            {(stage) => (
              <label class="color-line">
                <input type="color" value={colorToHex(stage.color)} onInput={(event) => props.onStageColor(stage.id, event.currentTarget.value)} />
                <span>{stage.name}</span>
              </label>
            )}
          </For>
        </div>
      </details>
      <Show when={props.autoMode === "off"}>
        <select class="auto-layout-axis" value={props.autoLayoutAxis} onChange={(event) => props.onAutoLayoutAxis(event.currentTarget.value as "stage" | "sessions")}>
          <option value="stage">Stage layout</option>
          <option value="sessions">Session columns</option>
        </select>
        <AppButton icon="template" onClick={props.onStartAutoPreview}>Auto Layout</AppButton>
      </Show>
      <Show when={props.autoMode === "preview"}>
        <span class="auto-bar">
          <span class="auto-label">Previewing</span>
          <button class="wf-button wf-button--primary" onClick={props.onApplyAutoPreview}>Apply</button>
          <button class="wf-button wf-button--soft" onClick={props.onCancelAutoPreview}>Cancel</button>
        </span>
      </Show>
    </nav>
  )
}
