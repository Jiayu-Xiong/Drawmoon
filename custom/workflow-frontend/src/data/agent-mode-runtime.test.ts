import { describe, expect, test } from "bun:test"

import { ensureAgentModeTemplatesRegistered } from "./agent-mode-templates"
import { getAgentModeTemplate } from "./template-registry"
import { mergeAgentModeRuntimeDefaults, resolveNodeArchetype } from "./agent-mode-runtime"
import type { WorkflowNode } from "./console-model"

ensureAgentModeTemplatesRegistered()

const baseNode: WorkflowNode = {
  id: "planner",
  name: "Planner",
  kind: "agent-mode",
  stageId: "s1",
  columnId: "c1",
  laneId: "l1",
  x: 0,
  y: 0,
  agentId: "agent-1",
  promptTitle: "t",
  promptPreview: "p",
  outputContract: "o",
}

describe("agent-mode-runtime", () => {
  test("custom-io-planner supplies planner archetype by default", () => {
    const mode = getAgentModeTemplate("custom-io-planner")
    expect(mode?.defaultRuntimeOverrides?.archetype).toBe("planner")
    expect(resolveNodeArchetype(baseNode, mode)).toBe("planner")
  })

  test("node archetype override wins over agent mode default", () => {
    const mode = getAgentModeTemplate("custom-io-planner")
    const node = { ...baseNode, runtimeOverrides: { archetype: "worker" as const } }
    expect(resolveNodeArchetype(node, mode)).toBe("worker")
  })

  test("mergeAgentModeRuntimeDefaults layers node overrides on mode defaults", () => {
    const mode = getAgentModeTemplate("custom-io-planner")
    const merged = mergeAgentModeRuntimeDefaults(
      { runtimeOverrides: { maxIterations: 4 } },
      mode,
    )
    expect(merged?.archetype).toBe("planner")
    expect(merged?.maxIterations).toBe(4)
  })
})
