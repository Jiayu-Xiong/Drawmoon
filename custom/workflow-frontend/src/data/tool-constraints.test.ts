import { describe, expect, test } from "bun:test"

import type { AgentModeTemplate, WorkflowNode } from "./console-model"
import { hasToolConstraints, resolveNodeToolConstraints } from "./tool-constraints"

const baseNode: WorkflowNode = {
  id: "node-a",
  name: "Node A",
  kind: "agent",
  stageId: "stage-1",
  columnId: "col-1",
  laneId: "lane-1",
  x: 0,
  y: 0,
  agentId: "agent-1",
  executionMode: "agent-mode",
  promptTitle: "Hello",
  promptPreview: "hello",
  outputContract: "text",
}

const agentMode: AgentModeTemplate = {
  id: "mode-1",
  name: "Mode",
  description: "",
  provider: "opencode",
  cliTemplateId: "opencode-cli",
  strategyKind: "custom",
  controlSurface: "customizable",
  origin: "builtin",
  mode: "chat",
  model: "workflow-selected",
  contextMode: "fresh",
  defaultSystemPrompt: "",
  allowSystemPromptOverride: true,
  allowedTools: [],
  outputKinds: ["markdown"],
  maxIterations: 8,
  timeoutMs: 120_000,
  allowFileWrites: false,
  cacheFiles: [],
  contextFiles: [],
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
  constraints: {
    forcedSkills: ["shared-skill"],
    forcedMcpServers: ["shared-mcp"],
  },
}

describe("resolveNodeToolConstraints", () => {
  test("inherits agent mode when node has no overrides", () => {
    const merged = resolveNodeToolConstraints(baseNode, agentMode)
    expect(merged.forcedSkills).toEqual(["shared-skill"])
    expect(merged.forcedMcpServers).toEqual(["shared-mcp"])
  })

  test("node force scope replaces agent skill list", () => {
    const merged = resolveNodeToolConstraints({
      ...baseNode,
      toolConstraints: { forcedSkills: ["node-skill"] },
    }, agentMode)
    expect(merged.forcedSkills).toEqual(["node-skill"])
    expect(merged.allowedSkills).toBeUndefined()
    expect(merged.forcedMcpServers).toEqual(["shared-mcp"])
  })

  test("node allow scope replaces agent mcp list", () => {
    const merged = resolveNodeToolConstraints({
      ...baseNode,
      toolConstraints: { allowedMcpServers: ["node-mcp"] },
    }, agentMode)
    expect(merged.allowedMcpServers).toEqual(["node-mcp"])
    expect(merged.forcedMcpServers).toBeUndefined()
    expect(merged.forcedSkills).toEqual(["shared-skill"])
  })

  test("empty forced list means explicit none", () => {
    const merged = resolveNodeToolConstraints({
      ...baseNode,
      toolConstraints: { forcedSkills: [] },
    }, agentMode)
    expect(merged.forcedSkills).toEqual([])
    expect(merged.allowedSkills).toBeUndefined()
  })

  test("inherits top-level allowedTools when constraints omit tools", () => {
    const merged = resolveNodeToolConstraints(baseNode, {
      ...agentMode,
      allowedTools: ["read_file", "write_file", "glob", "webfetch"],
      constraints: {},
    })
    expect(merged.allowedTools).toEqual(["read_file", "write_file", "glob", "webfetch"])
    expect(hasToolConstraints(merged)).toBe(true)
  })
})

describe("hasToolConstraints", () => {
  test("detects non-empty constraint lists", () => {
    expect(hasToolConstraints({ forcedSkills: ["a"] })).toBe(true)
    expect(hasToolConstraints({})).toBe(false)
  })
})
