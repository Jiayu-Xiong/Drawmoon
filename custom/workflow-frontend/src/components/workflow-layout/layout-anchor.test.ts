import { describe, expect, test } from "bun:test"

import type { WorkflowNode, WorkflowTemplate } from "../../data/console-model"
import { anchorNodesToTopLeft, CANVAS_LAYOUT_ANCHOR } from "./layout-anchor"
import { CARD_H, CARD_W } from "./constants"
import { arrangeWorkflowTemplate } from "./stage-layout"

describe("workflow layout anchor", () => {
  test("anchorNodesToTopLeft aligns first card top-left to canvas anchor", () => {
    const nodes: WorkflowNode[] = [
      { id: "a", name: "A", kind: "agent-mode", stageId: "s", columnId: "c", laneId: "l", x: 500, y: 400 } as WorkflowNode,
    ]
    const anchored = anchorNodesToTopLeft(nodes)
    expect(anchored[0]!.x - CARD_W / 2).toBeCloseTo(CANVAS_LAYOUT_ANCHOR.x, 0)
    expect(anchored[0]!.y - CARD_H / 2).toBeCloseTo(CANVAS_LAYOUT_ANCHOR.y, 0)
  })

  test("parallel lanes are horizontal and serial nodes vertical within lane", () => {
    const template: WorkflowTemplate = {
      id: "t",
      name: "T",
      workingDirectory: ".",
      defaultAgentId: "agent",
      stages: [{ id: "s", name: "S", color: "#000", columnIds: ["c1"] }],
      columns: [{
        id: "c1",
        name: "Parallel",
        stageId: "s",
        lanes: [
          { id: "l1", name: "a", nodeIds: ["n1", "n2"] },
          { id: "l2", name: "b", nodeIds: ["n3"] },
        ],
      }],
      nodes: [
        { id: "n1", name: "1", kind: "agent-mode", stageId: "s", columnId: "c1", laneId: "l1", x: 0, y: 0 },
        { id: "n2", name: "2", kind: "agent-mode", stageId: "s", columnId: "c1", laneId: "l1", x: 0, y: 0 },
        { id: "n3", name: "3", kind: "agent-mode", stageId: "s", columnId: "c1", laneId: "l2", x: 0, y: 0 },
      ],
      edges: [],
      sharedSessions: [],
    }
    const placed = arrangeWorkflowTemplate(template, { width: 1200, height: 800 })
    const n1 = placed.find((n) => n.id === "n1")!
    const n2 = placed.find((n) => n.id === "n2")!
    const n3 = placed.find((n) => n.id === "n3")!
    expect(n2.y).toBeGreaterThan(n1.y)
    expect(n1.x).toBeLessThan(n3.x)
    expect(n1.x - CARD_W / 2).toBeCloseTo(CANVAS_LAYOUT_ANCHOR.x, 0)
  })
})
