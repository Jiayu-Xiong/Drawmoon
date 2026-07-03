import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js"

import type { LocalCliInfo } from "../../../../api"
import { startWorkflowRun } from "../../../../api"
import { SharedSessionsBoard } from "../../../../components/SharedSessionsBoard"
import { TemplateCanvas } from "../../../../components/WorkflowTemplateCanvas"
import { arrangeWorkflowTemplate } from "../../../../components/workflow-layout/stage-layout"
import { arrangeWorkflowTemplateBySessions } from "../../../../components/workflow-layout/session-column-layout"
import { computeCanvasTransform, scheduleCanvasFit } from "../../../../components/workflow-layout/viewport-fit"
import { EditorTopBar } from "./EditorTopBar"
import { EditorOpsBar } from "./EditorOpsBar"
import { EditorNodeInspector } from "./EditorNodeInspector"
import { agents, llmApiTemplates, registerWorkflowUiTemplate, resolveDefaultWorkflowTemplate, workflowTemplates, workflowToRuntimeGraph } from "../../shared/core"
import { cliTemplates } from "../../../../data/cli-templates"
import { anyBudgetBlocked, estimateWorkflowBudget } from "../../../../data/budget/estimate"
import { mergeCliSnapshotsForTemplate } from "../../runtime"
import { onLlmApiBindReady } from "../../../../data/llm-api-bind/bootstrap"
import { normalizeNodeLlmBinding, normalizeTemplateLlmBindings, syncNodeModelOverride } from "../../../../data/node-llm-binding"
import {
  applyAgentModeChange,
  applyModelOptionChange,
  directLlmModeForModality,
  groupAgentModesForNode,
  listAgentModesForNode,
  listModelOptions,
  refreshCliForAgentMode,
  resolveExecutorBinding,
  resolveModelSource,
  runtimeModesForBinding,
} from "../../../../data/node-executor-binding"
import { saveWorkflowTemplateOverride } from "../../../../data/bootstrap-templates"
import {
  bootstrapTemplateRegistry,
  templateBootstrapResult,
  templateRegistryVersion,
  templatesEverReady,
} from "../../../../data/template-store"
import {
  assessTemplateBindings,
  involvedExecutorIds,
  probeAgentModes,
  type NodeBindingHealth,
} from "../../../../data/node-binding-health"
import { serializeWorkflowTemplateSnapshot } from "../../../../data/workflow-template-snapshot"
import { LOADING_WORKFLOW_TEMPLATE } from "../../../../data/loading-workflow-template"
import type { AgentRuntimeMode, ExecutionMode, NodeModality, PromptOverrides, RuntimeOverrides, WorkflowNode, WorkflowTemplate } from "../../../../data/console-model"

function cloneWorkflowTemplate(tpl: WorkflowTemplate) {
  return normalizeTemplateLlmBindings(JSON.parse(JSON.stringify(tpl)) as WorkflowTemplate)
}

export function EditorView(props: { cliInfo?: LocalCliInfo | null; onRefreshCliInfo?: () => void }) {
  const availableTemplates = createMemo(() => {
    templateRegistryVersion()
    return workflowTemplates
  })
  const [template, setTemplate] = createSignal<WorkflowTemplate>(LOADING_WORKFLOW_TEMPLATE)
  const [selected, setSelected] = createSignal(template().nodes[0]?.id ?? "")
  const [scale, setScale] = createSignal(0.82)
  const [pan, setPan] = createSignal({ x: -20, y: 0 })
  const [autoMode, setAutoMode] = createSignal<"off" | "preview">("off")
  const [backupNodes, setBackupNodes] = createSignal<WorkflowNode[]>([])
  const [runState, setRunState] = createSignal("idle")
  const [budgetOverride, setBudgetOverride] = createSignal(false)
  const [layoutMode, setLayoutMode] = createSignal<"canvas" | "sessions">("canvas")
  const [autoLayoutAxis, setAutoLayoutAxis] = createSignal<"stage" | "sessions">("stage")
  const [llmBindTick, setLlmBindTick] = createSignal(0)
  const [probeResults, setProbeResults] = createSignal<Map<string, boolean>>(new Map())
  const bindingHealthByNodeId = createMemo(() => {
    template()
    props.cliInfo
    probeResults()
    const health = assessTemplateBindings(template(), { cliInfo: props.cliInfo ?? null, probeResults: probeResults() })
    return Object.fromEntries(health.map((h) => [h.nodeId, h])) as Record<string, NodeBindingHealth>
  })
  const selectedNode = createMemo(() => template().nodes.find((node) => node.id === selected()))
  const executorBinding = createMemo(() => {
    const node = selectedNode()
    return node ? resolveExecutorBinding(node, template(), props.cliInfo ?? null) : undefined
  })
  const modelSource = createMemo(() => {
    const node = selectedNode()
    return node ? resolveModelSource(node, template()) : "none"
  })
  const agentModeGroups = createMemo(() => {
    const node = selectedNode()
    return node ? groupAgentModesForNode(node, template()) : []
  })
  const modelOptions = createMemo(() => {
    llmBindTick()
    const node = selectedNode()
    return node ? listModelOptions(node, template(), props.cliInfo ?? null) : []
  })
  const filteredRuntimeModes = createMemo(() => {
    const node = selectedNode()
    return node ? runtimeModesForBinding(node, template()) : []
  })
  const executionKind = createMemo(() => selectedNode()?.executionMode ?? "agent-mode")
  const templateAgentOptions = createMemo(() => {
    const ids = new Set<string>()
    if (template().defaultAgentId) ids.add(template().defaultAgentId)
    for (const node of template().nodes) {
      if (node.agentId) ids.add(node.agentId)
    }
    const scoped = agents.filter((agent) => ids.has(agent.id))
    return scoped.length ? scoped : agents.filter((agent) => agent.id === "agent-kuaipao")
  })
  let importInput: HTMLInputElement | undefined
  let canvasHost: HTMLElement | undefined

  function pickPreferredTemplate(list: WorkflowTemplate[]) {
    return list.find((item) => item.id === "paper-journal-default")
      ?? list.find((item) => item.id === "journal-paper-default")
      ?? list[0]
  }

  onMount(() => {
    const stopBind = onLlmApiBindReady(() => {
      setLlmBindTick((value) => value + 1)
      setTemplate((tpl) => cloneWorkflowTemplate(tpl))
    })
    const list = availableTemplates()
    if (list.length) {
      const preferred = pickPreferredTemplate(list)
      if (preferred && template().id === LOADING_WORKFLOW_TEMPLATE.id) {
        selectTemplate(preferred.id)
      }
    }
    void bootstrapTemplateRegistry().then((result) => {
      if (!result.backendOnline || !result.templateCount) return
      const refreshed = availableTemplates()
      const preferred = pickPreferredTemplate(refreshed)
      if (preferred && (template().id === LOADING_WORKFLOW_TEMPLATE.id || !refreshed.some((item) => item.id === template().id))) {
        selectTemplate(preferred.id)
      }
    })
    return stopBind
  })

  createEffect(() => {
    templateRegistryVersion()
    templatesEverReady()
    const list = availableTemplates()
    if (!list.length) return
    const currentId = template().id
    if (currentId === LOADING_WORKFLOW_TEMPLATE.id || !list.some((item) => item.id === currentId)) {
      selectTemplate(list[0]!.id)
    }
  })

  function canvasViewport() {
    const rect = canvasHost?.getBoundingClientRect()
    return {
      width: Math.max(320, rect?.width ?? (typeof window === "undefined" ? 1280 : window.innerWidth - 360)),
      height: Math.max(320, rect?.height ?? (typeof window === "undefined" ? 720 : window.innerHeight - 180)),
    }
  }

  function fitCanvas(nodes = template().nodes, mode: "contain" | "dense" | "anchor-top-left" = "anchor-top-left") {
    const viewport = canvasViewport()
    const transform = computeCanvasTransform(nodes, viewport, mode)
    setScale(transform.scale)
    setPan({ x: transform.panX, y: transform.panY })
  }

  function arrangeNodes() {
    const viewport = canvasViewport()
    return autoLayoutAxis() === "sessions"
      ? arrangeWorkflowTemplateBySessions(template())
      : arrangeWorkflowTemplate(template(), viewport)
  }

  function autoLayoutTemplate() {
    setLayoutMode("canvas")
    const arranged = arrangeNodes()
    setTemplate((item) => ({ ...item, nodes: arranged }))
    scheduleCanvasFit(() => fitCanvas(arranged, "anchor-top-left"))
  }

  function startAutoPreview() {
    setLayoutMode("canvas")
    setBackupNodes(template().nodes.map((node) => ({ ...node })))
    const arranged = arrangeNodes()
    setTemplate((item) => ({ ...item, nodes: arranged }))
    setAutoMode("preview")
    scheduleCanvasFit(() => fitCanvas(arranged, "anchor-top-left"))
  }

  function applyAutoPreview() {
    setBackupNodes([])
    setAutoMode("off")
  }

  function cancelAutoPreview() {
    const backup = backupNodes()
    if (backup.length) {
      setTemplate((item) => ({ ...item, nodes: backup }))
      fitCanvas(backup)
    }
    setBackupNodes([])
    setAutoMode("off")
  }

  function selectTemplate(id: string, options?: { skipAutoLayout?: boolean }) {
    const next = availableTemplates().find((item) => item.id === id)
    if (!next) return
    let copy = cloneWorkflowTemplate(next)
    if (!options?.skipAutoLayout) {
      try {
        const arranged = autoLayoutAxis() === "sessions"
          ? arrangeWorkflowTemplateBySessions(copy)
          : arrangeWorkflowTemplate(copy, canvasViewport())
        copy = { ...copy, nodes: arranged }
      } catch (err) {
        console.warn("[layout] autolayout failed:", err)
      }
    }
    setTemplate(copy)
    setSelected(copy.nodes[0]?.id ?? "")
    setAutoMode("off")
    setBackupNodes([])
    setLayoutMode("canvas")
    scheduleCanvasFit(() => fitCanvas(copy.nodes, "anchor-top-left"))
  }

  function saveTemplate() {
    const tpl = normalizeTemplateLlmBindings(template())
    registerWorkflowUiTemplate(tpl)
    saveWorkflowTemplateOverride(tpl)
    setTemplate(tpl)
    setRunState(`saved: ${tpl.id}`)
  }

  function exportTemplate() {
    const blob = new Blob([JSON.stringify(template(), null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${template().id || "workflow-template"}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function importTemplateFile(file?: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as WorkflowTemplate
        if (!parsed?.nodes?.length || !parsed?.columns?.length || !parsed?.stages?.length) throw new Error("Invalid workflow template JSON")
        registerWorkflowUiTemplate(normalizeTemplateLlmBindings(parsed))
        const normalized = cloneWorkflowTemplate(parsed)
        setTemplate(normalized)
        setSelected(normalized.nodes[0]?.id ?? "")
        fitCanvas(normalized.nodes)
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Import failed")
      }
    }
    reader.readAsText(file)
  }

  function addNode() {
    const maxX = Math.max(0, ...template().nodes.map((n) => n.x)) + 240
    const midY = template().nodes.length ? template().nodes.reduce((s, n) => s + n.y, 0) / template().nodes.length : 350
    const column = template().columns[template().columns.length - 1] ?? template().columns[0]!
    const lane = column.lanes[0]!
    const stageId = column.stageId
    const newId = "n" + (template().nodes.length + 1)
    const node: WorkflowNode = {
      id: newId,
      name: "New Step",
      kind: "llm-step",
      stageId,
      columnId: column.id,
      laneId: lane.id,
      agentId: template().defaultAgentId,
      promptTitle: "Object step",
      promptPreview: "Object-level workflow step.",
      outputContract: "Describe execution output.",
      artifacts: [],
      x: maxX,
      y: midY,
      state: "waiting",
    }
    setTemplate((item) => ({
      ...item,
      nodes: [...item.nodes, node],
    }))
    setSelected(newId)
  }

  function dragNode(id: string, dx: number, dy: number) {
    setTemplate((item) => {
      const nextNodes = item.nodes.map((node) => {
        if (node.id !== id) return node
        let nx = node.x + dx
        let ny = node.y + dy
        // Collision: prevent overlap (card 230px*154px + 10px margin)
        for (const other of item.nodes) {
          if (other.id === id) continue
          const ox = Math.abs(nx - other.x) < 240
          const oy = Math.abs(ny - other.y) < 154
          if (ox && oy) {
            nx = other.x + (nx > other.x ? 240 : -240)
            ny = other.y + (ny > other.y ? 154 : -154)
          }
        }
        return { ...node, x: nx, y: ny }
      })
      return { ...item, nodes: nextNodes }
    })
  }

  function delNode() {
    const id = selected()
    if (!id) return
    setTemplate((item) => ({
      ...item,
      nodes: item.nodes.filter((node) => node.id !== id),
      edges: item.edges.filter((edge) => edge.from !== id && edge.to !== id),
      loopEdges: item.loopEdges.filter((edge) => edge.from !== id && edge.to !== id),
      columns: item.columns.map((column) => ({
        ...column,
        lanes: column.lanes.map((lane) => ({ ...lane, nodeIds: lane.nodeIds.filter((nodeId) => nodeId !== id) })),
      })),
    }))
    setSelected("")
  }

  function updateSelectedNode(patch: Partial<WorkflowNode>) {
    setTemplate((item) => ({
      ...item,
      nodes: item.nodes.map((node) => node.id === selected() ? { ...node, ...patch } : node),
    }))
  }

  function updatePromptOverrides(patch: Partial<PromptOverrides>) {
    const current = selectedNode()
    updateSelectedNode({ promptOverrides: { ...(current?.promptOverrides ?? {}), ...patch } })
  }

  function updateRuntimeOverrides(patch: Partial<RuntimeOverrides>) {
    const current = selectedNode()
    if (!current) return
    if (patch.model !== undefined) {
      const synced = syncNodeModelOverride(current, patch.model, template())
      updateSelectedNode({
        runtimeOverrides: { ...(current.runtimeOverrides ?? {}), ...patch },
        llmApiTemplateId: synced.llmApiTemplateId,
      })
      return
    }
    updateSelectedNode({ runtimeOverrides: { ...(current.runtimeOverrides ?? {}), ...patch } })
  }

  function repairSelectedNodeBinding() {
    const current = selectedNode()
    if (!current) return
    const normalized = normalizeNodeLlmBinding(current, template())
    if (
      normalized.llmApiTemplateId !== current.llmApiTemplateId
      || normalized.runtimeOverrides?.model !== current.runtimeOverrides?.model
    ) {
      updateSelectedNode({
        llmApiTemplateId: normalized.llmApiTemplateId,
        runtimeOverrides: normalized.runtimeOverrides,
      })
    }
  }

  function updateExecutionMode(executionMode: ExecutionMode) {
    const node = selectedNode()
    if (!node) return
    if (executionMode === "tool" || executionMode === "human-gate" || executionMode === "inquiry") {
      updateSelectedNode({ executionMode })
      return
    }
    updateSelectedNode({
      executionMode: "agent-mode",
      agentModeTemplateId: node.agentModeTemplateId ?? template().defaultAgentModeTemplateId ?? directLlmModeForModality(node.modality ?? "text"),
    })
  }

  function updateAgentMode(agentModeId: string) {
    const current = selectedNode()
    if (!current) return
    void refreshCliForAgentMode(agentModeId).then(() => props.onRefreshCliInfo?.())
    updateSelectedNode(applyAgentModeChange(current, agentModeId, template(), props.cliInfo ?? null))
  }

  function updateModelOption(option: import("../../../../data/node-executor-binding").ModelOption) {
    const current = selectedNode()
    if (!current) return
    updateSelectedNode(applyModelOptionChange(current, option))
  }

  function updateModality(modality: NodeModality) {
    const current = selectedNode()
    if (!current) return
    const draft = { ...current, modality }
    const nextModeId = listAgentModesForNode(draft, template()).find((m) => m.id === current.agentModeTemplateId)?.id
      ?? directLlmModeForModality(modality)
    const patch = applyAgentModeChange(draft, nextModeId, template(), props.cliInfo ?? null)
    updateSelectedNode({ modality, ...patch })
  }

  function updateStageColor(id: string, color: string) {
    setTemplate((item) => ({
      ...item,
      stages: item.stages.map((stage) => stage.id === id ? { ...stage, color } : stage),
    }))
  }

  async function runSelectedTemplate() {
    const tpl = normalizeTemplateLlmBindings(template())
    setTemplate(tpl)
    setRunState("probing bindings…")
    const probed = await probeAgentModes(involvedExecutorIds(tpl), props.cliInfo ?? null)
    setProbeResults(probed)
    const health = assessTemplateBindings(tpl, { cliInfo: props.cliInfo ?? null, probeResults: probed })
    const blockedBinding = health.find((h) => !h.ok)
    if (blockedBinding) {
      setRunState(`blocked: ${blockedBinding.issues.map((i) => i.message).join("; ")}`)
      return
    }
    const snapshots = mergeCliSnapshotsForTemplate(tpl, cliTemplates, null)
    const estimates = estimateWorkflowBudget(tpl, snapshots)
    const blocked = anyBudgetBlocked(estimates)
    let override = budgetOverride()
    if (blocked && !override) {
      override = window.confirm(`${blocked.blockReason}\n\nContinue anyway (override)?`)
      if (!override) {
        setRunState(`blocked: ${blocked.blockReason}`)
        return
      }
    }
    setRunState("submitting…")
    try {
      const graph = workflowToRuntimeGraph(tpl)
      const run = await startWorkflowRun({
        templateId: tpl.id,
        name: tpl.name,
        graph,
        bypassCache: true,
        defaultLabel: tpl.id,
        workflowTemplateSnapshot: serializeWorkflowTemplateSnapshot(tpl),
      })
      setRunState(`queued: ${run.id}`)
      // Navigate to workflow detail view via URL hash
      window.location.hash = `#detail/run/${encodeURIComponent(run.id)}`
    } catch (error) {
      setRunState(error instanceof Error ? `error: ${error.message}` : "error")
    } finally {
      setBudgetOverride(false)
    }
  }

  const bootstrapAlert = createMemo(() => templateBootstrapResult())

  return (
    <div class="template-editor-shell">
      <Show when={bootstrapAlert().message}>
        <div class="template-editor-alert" role="alert">
          <strong>{bootstrapAlert().backendOnline ? "模板" : "Runtime"}</strong>
          <span>{bootstrapAlert().message}</span>
          <Show when={!bootstrapAlert().backendOnline}>
            <code>cd xy/backend/opencode &amp;&amp; bun run src/index.ts --port 3456</code>
          </Show>
        </div>
      </Show>
      <EditorTopBar
        template={template()}
        workflowTemplates={availableTemplates()}
        templatesLoading={!templatesEverReady() && availableTemplates().length === 0}
        templateAgentOptions={templateAgentOptions()}
        onSelectTemplate={selectTemplate}
        onNewTemplate={() => {
          const list = availableTemplates()
          if (list[0]) selectTemplate(list[0].id, { skipAutoLayout: true })
        }}
        onTemplateChange={(updater) => setTemplate(updater)}
      />
      <EditorOpsBar
        template={template()}
        runState={runState()}
        layoutMode={layoutMode()}
        autoMode={autoMode()}
        autoLayoutAxis={autoLayoutAxis()}
        scale={scale()}
        importInputRef={(el) => { importInput = el }}
        onImport={importTemplateFile}
        onImportClick={() => importInput?.click()}
        onExport={exportTemplate}
        onRun={runSelectedTemplate}
        onSave={saveTemplate}
        onAddNode={addNode}
        onDeleteNode={delNode}
        onLayoutMode={setLayoutMode}
        onFit={() => fitCanvas(template().nodes, "contain")}
        onZoomOut={() => setScale(Math.max(0.15, scale() - 0.08))}
        onZoomIn={() => setScale(Math.min(3, scale() + 0.08))}
        onStageColor={updateStageColor}
        onAutoLayoutAxis={setAutoLayoutAxis}
        onStartAutoPreview={startAutoPreview}
        onApplyAutoPreview={applyAutoPreview}
        onCancelAutoPreview={cancelAutoPreview}
      />
      <div class="template-editor-main">
        <Show when={layoutMode() === "canvas"} fallback={(
          <main class="editor-sessions" data-primary-scroll>
            <SharedSessionsBoard
              template={template()}
              selectedId={selected()}
              onSelectNode={setSelected}
              onTemplateChange={(next) => setTemplate(next)}
            />
          </main>
        )}>
          <main class="editor-canvas" ref={canvasHost}>
            <TemplateCanvas
              template={template()}
              selectedNodeId={selected()}
              bindingHealthByNodeId={bindingHealthByNodeId()}
              onSelectNode={setSelected}
              editable
              scale={scale()}
              pan={pan()}
              onDragNode={dragNode}
              onPan={(x, y) => setPan({ x, y })}
              onZoom={(nextScale, x, y) => {
                setScale(nextScale)
                setPan({ x, y })
              }}
            />
          </main>
        </Show>
        <Show when={selectedNode()} fallback={
          <aside class="step-properties wf-glass"><p>Select a station.</p></aside>
        }>
          {(node) => (
            <EditorNodeInspector
              template={template()}
              node={node()}
              agentModeGroups={agentModeGroups()}
              modelOptions={modelOptions()}
              executorBinding={executorBinding()!}
              modelSource={modelSource()}
              filteredRuntimeModes={filteredRuntimeModes()}
              executionKind={executionKind()}
              templateAgentOptions={templateAgentOptions()}
              onTemplateChange={setTemplate}
              onUpdateNode={updateSelectedNode}
              onUpdatePromptOverrides={updatePromptOverrides}
              onUpdateRuntimeOverrides={updateRuntimeOverrides}
              onRepairBinding={repairSelectedNodeBinding}
              onExecutionMode={updateExecutionMode}
              onModality={updateModality}
              onAgentModeChange={updateAgentMode}
              onModelOptionChange={updateModelOption}
            />
          )}
        </Show>
      </div>
    </div>
  )
}
