import { describe, expect, test } from "bun:test"

import { ensureAgentModeTemplatesRegistered } from "./agent-mode-templates"
import { ensureCliTemplatesRegistered } from "./cli-templates"
import { ensureLlmApiTemplatesRegistered } from "./llm-api-templates"
import type { WorkflowNode, WorkflowTemplate } from "./console-model"
import { DIRECT_API_MODE_ID } from "./agent-mode-templates/direct-llm-modes"
import {
  applyAgentModeChange,
  listAgentModesForNode,
  listModelOptions,
  listTemplateGenModelOptions,
  normalizeNodeExecutor,
  resolveModelSource,
} from "./node-executor-binding"

ensureCliTemplatesRegistered()
ensureAgentModeTemplatesRegistered()
ensureLlmApiTemplatesRegistered()

const baseNode: WorkflowNode = {
  id: "n1",
  name: "Node",
  kind: "agent-mode",
  stageId: "s1",
  columnId: "c1",
  laneId: "l1",
  x: 0,
  y: 0,
  agentId: "agent-paper",
  executionMode: "agent-mode",
  modality: "text",
  agentModeTemplateId: "opencode-chat",
  cliTemplateId: "opencode-cli",
  llmApiTemplateId: "kuaipao-openai-chat",
  promptTitle: "t",
  promptPreview: "p",
  outputContract: "o",
}

const template: WorkflowTemplate = {
  id: "tpl",
  name: "tpl",
  description: "",
  workingDirectory: ".",
  defaultAgentId: "agent-paper",
  defaultAgentModeTemplateId: "opencode-chat",
  defaultLlmApiTemplateId: "kuaipao-openai-chat",
  stages: [{ id: "s1", name: "S", color: "#ccc", columnIds: ["c1"] }],
  columns: [{ id: "c1", name: "C", stageId: "s1", lanes: [{ id: "l1", name: "belt", nodeIds: ["n1"] }] }],
  nodes: [baseNode],
  edges: [],
  loopEdges: [],
  branchGroups: [],
  mergeGroups: [],
}

describe("node-executor-binding", () => {
  test("opencode agent mode uses llm-api model source", () => {
    expect(resolveModelSource(baseNode, template)).toBe("llm-api")
    const options = listModelOptions(baseNode, template)
    expect(options.every((item) => item.kind === "llm-api")).toBe(true)
    expect(options.some((item) => item.id === "kuaipao-openai-chat")).toBe(true)
  })

  test("kiro agent mode uses cli-native models only", () => {
    const kiroNode: WorkflowNode = {
      ...baseNode,
      agentModeTemplateId: "kiro-cli-chat",
      cliTemplateId: "kiro-cli",
      llmApiTemplateId: "kuaipao-openai-chat",
      runtimeOverrides: { model: "deepseek-3.2" },
    }
    expect(resolveModelSource(kiroNode, template)).toBe("cli-native")
    const options = listModelOptions(kiroNode, template)
    expect(options.every((item) => item.kind === "cli-native")).toBe(true)
    expect(options.some((item) => item.id === "deepseek-3.2")).toBe(true)
  })

  test("switching opencode to kiro resets llm api binding", () => {
    const next = applyAgentModeChange(baseNode, "kiro-cli-chat", template)
    expect(next.llmApiTemplateId).toBeUndefined()
    expect(next.runtimeOverrides?.model).toBe("deepseek-3.2")
  })

  test("legacy llm-api execution normalizes to direct chat mode", () => {
    const legacy: WorkflowNode = {
      ...baseNode,
      executionMode: "llm-api",
      agentModeTemplateId: undefined,
      cliTemplateId: undefined,
    }
    const normalized = normalizeNodeExecutor(legacy, template)
    expect(normalized.agentModeTemplateId).toBe(DIRECT_API_MODE_ID)
  })

  test("legacy direct-llm-image migrates to direct-api", () => {
    const legacy: WorkflowNode = {
      ...baseNode,
      executionMode: "llm-api",
      agentModeTemplateId: "direct-llm-image",
      cliTemplateId: undefined,
    }
    const normalized = normalizeNodeExecutor(legacy, template)
    expect(normalized.agentModeTemplateId).toBe(DIRECT_API_MODE_ID)
    expect(normalized.cliTemplateId).toBe("direct-api-cli")
  })

  test("direct-api image node maps to llm-api runtime action", async () => {
    const { workflowToRuntimeGraph } = await import("../pages/console/shared/core")
    const imageNode: WorkflowNode = {
      ...baseNode,
      modality: "image",
      executionMode: "llm-api",
      agentModeTemplateId: DIRECT_API_MODE_ID,
      cliTemplateId: "direct-api-cli",
      llmApiTemplateId: "kuaipao-openai-image",
    }
    const imageTemplate: WorkflowTemplate = {
      ...template,
      nodes: [imageNode],
    }
    const graph = workflowToRuntimeGraph(imageTemplate)
    expect(graph.nodes[0]?.action.kind).toBe("llm-api")
  })

  test("listTemplateGenModelOptions excludes image llm apis", () => {
    const options = listTemplateGenModelOptions({ ...baseNode, agentModeTemplateId: DIRECT_API_MODE_ID, cliTemplateId: "direct-api-cli" })
    expect(options.every((item) => item.kind !== "llm-api" || (item.api.modalities ?? ["text"]).includes("text"))).toBe(true)
    expect(options.some((item) => item.id === "kuaipao-openai-image")).toBe(false)
  })

  test("listAgentModesForNode includes single virtual direct-api mode", () => {
    const modes = listAgentModesForNode({ ...baseNode, modality: "image" }, template)
    expect(modes.filter((m) => m.id === DIRECT_API_MODE_ID)).toHaveLength(1)
  })

  test("custom-io-planner applies planner archetype when selected", () => {
    const next = applyAgentModeChange(baseNode, "custom-io-planner", template)
    expect(next.runtimeOverrides?.archetype).toBe("planner")
  })
})
