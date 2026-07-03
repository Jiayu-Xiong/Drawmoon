import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../../../api"
import type { WorkflowEdge, WorkflowNode, WorkflowTemplate } from "../../../../data/console-model"
import { arrangeWorkflowInstance } from "../../../../components/workflow-layout/instance-layout"
import { CARD_H, CARD_W } from "../../../../components/workflow-layout/constants"
import { workflowEntityTemplate } from "../../../../data/workflow-entity"
import { getWorkflowUiTemplate } from "../../../../data/template-registry"
import { workflowTemplates } from "../../shared/core"
import type { WorkflowInstanceItem } from "./instance-utils"
import {
  canvasRunFromListItem,
  mapRuntimeNodeState,
  resolveEffectiveNodeStatus,
  templateWithRuntimeState,
} from "./workflow-run-detail-utils"

function edgeId(from: string, to: string) {
  return `${from}->${to}`
}

function synthesizeNodesFromGraph(
  base: WorkflowTemplate,
  run: RuntimeWorkflowRunRecord,
  graphNodes: Array<{ id: string; label?: string; config?: { prompt?: string } }>,
): WorkflowNode[] {
  if (!graphNodes.length) return []

  const stageId = base.stages[0]?.id ?? `${base.id}-stage`
  const columnId = base.columns[0]?.id ?? `${base.id}-c1`
  const laneId = base.columns[0]?.lanes[0]?.id ?? `${base.id}-l1`

  return graphNodes.map((node, index) => {
    const existing = base.nodes.find((item) => item.id === node.id)
    if (existing) {
      return {
        ...existing,
        name: node.label ?? existing.name,
        promptPreview: String(node.config?.prompt ?? existing.promptPreview ?? ""),
        state: mapRuntimeNodeState(resolveEffectiveNodeStatus(node.id, run)),
      }
    }
    const column = 187 + (index % 4) * (CARD_W + 44)
    const row = 146 + Math.floor(index / 4) * (CARD_H + 34)
    return {
      id: node.id,
      name: node.label ?? node.id,
      kind: "agent-mode",
      stageId,
      columnId,
      laneId,
      agentId: base.defaultAgentId ?? "agent-paper",
      executionMode: "agent-mode",
      promptTitle: node.label ?? node.id,
      promptPreview: String(node.config?.prompt ?? ""),
      outputContract: "",
      x: column,
      y: row,
      state: mapRuntimeNodeState(resolveEffectiveNodeStatus(node.id, run)),
    } satisfies WorkflowNode
  })
}

function synthesizeEdgesFromGraph(base: WorkflowTemplate, run: RuntimeWorkflowRunRecord): WorkflowEdge[] {
  const runtimeEdges = (run.graph as { edges?: Array<{ from: string; to: string; contextMode?: string }> }).edges ?? []
  if (!runtimeEdges.length) return base.edges

  return runtimeEdges.map((edge) => {
    const existing = base.edges.find((item) => item.from === edge.from && item.to === edge.to)
    return existing ?? {
      id: edgeId(edge.from, edge.to),
      from: edge.from,
      to: edge.to,
      kind: "normal",
      contextMode: (edge.contextMode as WorkflowEdge["contextMode"]) ?? "inherit",
    }
  })
}

function resolveBaseTemplate(item: WorkflowInstanceItem): WorkflowTemplate {
  const fromRegistry = workflowTemplates.find((template) => template.id === item.templateId)
  if (fromRegistry?.nodes.length) return fromRegistry
  const fromUi = getWorkflowUiTemplate(item.templateId)
  if (fromUi?.nodes.length) return fromUi
  const fromEntity = workflowEntityTemplate(item.entity)
  if (fromEntity.nodes.length && fromEntity.id === item.templateId) return fromEntity
  return fromRegistry ?? fromUi ?? fromEntity
}

function templateCoversRun(base: WorkflowTemplate, run: RuntimeWorkflowRunRecord) {
  const graphIds = (run.graph?.nodes ?? []).map((node) => node.id)
  const stateIds = Object.keys(run.nodeStates ?? {})
  const expected = graphIds.length ? graphIds : stateIds
  if (!expected.length) return base.nodes.length > 0
  const known = new Set(base.nodes.map((node) => node.id))
  return expected.every((id) => known.has(id))
}

export function reconcileTemplateWithRun(
  base: WorkflowTemplate,
  run: RuntimeWorkflowRunRecord,
): WorkflowTemplate {
  const graphNodes = run.graph?.nodes ?? []
  if (graphNodes.length > 0) {
    return {
      ...base,
      nodes: synthesizeNodesFromGraph(base, run, graphNodes),
      edges: synthesizeEdgesFromGraph(base, run),
    }
  }

  const stateIds = Object.keys(run.nodeStates ?? {})
  if (stateIds.length > 0 && !templateCoversRun(base, run)) {
    const pseudoGraph = stateIds.map((id) => ({
      id,
      label: base.nodes.find((node) => node.id === id)?.name ?? id,
      config: { prompt: base.nodes.find((node) => node.id === id)?.promptPreview ?? "" },
    }))
    return {
      ...base,
      nodes: synthesizeNodesFromGraph(base, run, pseudoGraph),
      edges: base.edges,
    }
  }

  return base
}

export function effectiveRuntimeForItem(
  item: WorkflowInstanceItem,
  runtimeRun: RuntimeWorkflowRunRecord | null,
): RuntimeWorkflowRunRecord {
  if (runtimeRun) return runtimeRun
  return canvasRunFromListItem(item, resolveBaseTemplate(item))
}

export function buildInstanceCanvasLayout(
  item: WorkflowInstanceItem,
  runtimeRun: RuntimeWorkflowRunRecord | null,
): WorkflowTemplate {
  const base = resolveBaseTemplate(item)
  const run = runtimeRun ?? canvasRunFromListItem(item, base)
  const reconciled = reconcileTemplateWithRun(base, run)
  const nodes = reconciled.nodes.length ? arrangeWorkflowInstance(reconciled) : []
  return { ...reconciled, nodes }
}

export function buildInstanceCanvasTemplate(
  item: WorkflowInstanceItem,
  runtimeRun: RuntimeWorkflowRunRecord | null,
): WorkflowTemplate {
  const base = resolveBaseTemplate(item)
  const run = runtimeRun ?? canvasRunFromListItem(item, base)
  return templateWithRuntimeState(buildInstanceCanvasLayout(item, runtimeRun), run)
}
