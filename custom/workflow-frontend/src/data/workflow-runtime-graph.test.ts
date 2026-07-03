import { describe, expect, test } from "bun:test"

import { ensureAgentModeTemplatesRegistered } from "./agent-mode-templates"
import { ensureCliTemplatesRegistered } from "./cli-templates"
import { ensureLlmApiTemplatesRegistered } from "./llm-api-templates"
import type { WorkflowNode, WorkflowTemplate } from "./console-model"

ensureCliTemplatesRegistered()
ensureAgentModeTemplatesRegistered()
ensureLlmApiTemplatesRegistered()

const plannerNode: WorkflowNode = {
  id: "io-planner",
  name: "IO Planner",
  kind: "agent-mode",
  stageId: "s1",
  columnId: "c1",
  laneId: "l1",
  x: 0,
  y: 0,
  agentId: "agent-1",
  executionMode: "agent-mode",
  agentModeTemplateId: "custom-io-planner",
  cliTemplateId: "opencode-cli",
  llmApiTemplateId: "kuaipao-openai-chat",
  promptTitle: "Plan",
  promptPreview: "Allocate files",
  outputContract: ".workflow/allocation-plan.json",
}

const template: WorkflowTemplate = {
  id: "tpl",
  name: "tpl",
  description: "",
  workingDirectory: ".",
  defaultAgentId: "agent-1",
  stages: [{ id: "s1", name: "S", color: "#ccc", columnIds: ["c1"] }],
  columns: [{ id: "c1", name: "C", stageId: "s1", lanes: [{ id: "l1", name: "belt", nodeIds: ["io-planner"] }] }],
  nodes: [plannerNode],
  edges: [],
  loopEdges: [],
  branchGroups: [],
  mergeGroups: [],
}

describe("workflowToRuntimeGraph", () => {
  test("custom-io-planner binds planner archetype and workflow-io constraints", async () => {
    const { workflowToRuntimeGraph } = await import("../pages/console/shared/core")
    const graph = workflowToRuntimeGraph(template)
    const node = graph.nodes[0]
    expect(node?.metadata?.archetype).toBe("planner")
    expect(node?.action.constraints?.forcedMcpServers).toEqual(["workflow-io", "workflow-web"])
    expect(node?.config.allowFileWrites).toBe(true)
  })
})
