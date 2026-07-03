import { describe, expect, test } from "bun:test"

import { validateWorkflowUiTemplate } from "./template-validator.js"

const minimalValid = {
  id: "test-flow",
  name: "Test",
  stages: [{ id: "s1", name: "S", color: "#fff", columnIds: ["c1"] }],
  columns: [{ id: "c1", name: "C", stageId: "s1", lanes: [{ id: "l1", name: "L", nodeIds: ["a", "b"] }] }],
  nodes: [
    {
      id: "a",
      name: "Plan",
      promptPreview: "Create plan file.",
      outputContract: "plan.md",
      executionMode: "cli",
      agentModeTemplateId: "m1",
      artifacts: [{ path: "plan.md" }],
      runtimeOverrides: { contextMode: "fresh", archetype: "planner" },
    },
    {
      id: "b",
      name: "Write",
      promptPreview: "Write section from plan.",
      outputContract: "section.md",
      executionMode: "cli",
      agentModeTemplateId: "m1",
      artifacts: [{ path: "section.md" }],
      runtimeOverrides: { contextMode: "artifacts", archetype: "worker", readRunFiles: ["plan.md"] },
    },
  ],
  edges: [{ from: "a", to: "b", contextMode: "artifacts" }],
}

describe("validateWorkflowUiTemplate", () => {
  test("accepts minimal valid pipeline", () => {
    const r = validateWorkflowUiTemplate(minimalValid)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  test("rejects empty nodes", () => {
    const r = validateWorkflowUiTemplate({ ...minimalValid, nodes: [] })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes("nodes"))).toBe(true)
  })

  test("warns on bad readRunFiles", () => {
    const bad = structuredClone(minimalValid) as typeof minimalValid
    bad.nodes[1]!.runtimeOverrides = { readRunFiles: ["missing.md"] }
    const r = validateWorkflowUiTemplate(bad)
    expect(r.warnings.some((w) => w.includes("readRunFiles"))).toBe(true)
  })
})
