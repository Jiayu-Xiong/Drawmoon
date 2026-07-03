import { describe, expect, test } from "bun:test"
import { migrateWorkflowTemplateIntents } from "./migrate-template-intents.js"
import { validateWorkflowUiTemplate } from "./template-validator.js"

describe("migrateWorkflowTemplateIntents", () => {
  test("adds intent and upgrades planner to custom-io-planner", () => {
    const raw = {
      id: "t",
      name: "T",
      stages: [{ id: "s" }],
      columns: [{ id: "c", lanes: [{ id: "l", nodeIds: ["p", "w"] }] }],
      nodes: [
        {
          id: "p",
          name: "Plan",
          promptPreview: "plan",
          executionMode: "cli",
          agentModeTemplateId: "opencode-paper-planner",
          runtimeOverrides: { archetype: "planner", contextMode: "fresh" },
        },
        {
          id: "w",
          name: "Work",
          promptPreview: "work",
          executionMode: "cli",
          agentModeTemplateId: "opencode-paper-section",
          runtimeOverrides: { archetype: "worker", contextMode: "artifacts", readRunFiles: ["out.md"] },
        },
      ],
      edges: [{ from: "p", to: "w", contextMode: "artifacts" }],
      sharedSessions: [],
      sessionGroups: {},
      loopEdges: [],
      branchGroups: [],
      mergeGroups: [],
    }
    const migrated = migrateWorkflowTemplateIntents(raw)
    const planner = (migrated.nodes as Array<Record<string, unknown>>)[0]!
    const worker = (migrated.nodes as Array<Record<string, unknown>>)[1]!
    expect(planner.agentModeTemplateId).toBe("custom-io-planner")
    expect((planner.runtimeOverrides as { intent?: string }).intent).toBe("handoff")
    expect((worker.runtimeOverrides as { intent?: string }).intent).toBe("handoff")
    expect(validateWorkflowUiTemplate(migrated).ok).toBe(true)
  })

  test("reviewer gets review intent and opencode-paper-reviewer", () => {
    const raw = {
      id: "r",
      name: "R",
      stages: [{ id: "s" }],
      columns: [{ id: "c", lanes: [{ id: "l", nodeIds: ["review"] }] }],
      nodes: [{
        id: "peer-review",
        name: "Review",
        promptPreview: "审稿",
        executionMode: "cli",
        agentModeTemplateId: "opencode-build",
        runtimeOverrides: { archetype: "reviewer", contextMode: "fresh", readRunFiles: ["paper.pdf"] },
      }],
      edges: [],
      sharedSessions: [],
      sessionGroups: {},
      loopEdges: [],
      branchGroups: [],
      mergeGroups: [],
    }
    const migrated = migrateWorkflowTemplateIntents(raw)
    const node = (migrated.nodes as Array<Record<string, unknown>>)[0]!
    expect(node.agentModeTemplateId).toBe("opencode-paper-reviewer")
    expect((node.runtimeOverrides as { intent?: string }).intent).toBe("review")
  })
})
