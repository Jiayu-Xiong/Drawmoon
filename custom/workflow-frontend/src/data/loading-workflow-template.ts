import type { WorkflowTemplate } from "./console-model"

/** Placeholder until ~/.drawmoon workflow templates finish loading. */
export const LOADING_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  id: "__loading__",
  name: "Loading templates…",
  workingDirectory: ".",
  defaultAgentId: "agent-paper",
  stages: [{ id: "__loading-stage", name: "…", color: "rgb(160,160,160)", columnIds: ["__loading-col"] }],
  columns: [{
    id: "__loading-col",
    name: "…",
    stageId: "__loading-stage",
    lanes: [{ id: "__loading-lane", name: "…", nodeIds: ["__loading-node"] }],
  }],
  nodes: [{
    id: "__loading-node",
    name: "…",
    kind: "agent-mode",
    stageId: "__loading-stage",
    columnId: "__loading-col",
    laneId: "__loading-lane",
    x: 147,
    y: 106,
    agentId: "agent-paper",
    executionMode: "agent-mode",
  }],
  edges: [],
  sharedSessions: [],
}

export const REPO_STARTER_TEMPLATE_IDS = new Set([
  "opencode-kuaipao-chat-three-node",
  "kiro-chat-three-node",
  "local-cli-agent-build",
])
