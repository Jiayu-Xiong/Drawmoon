import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import {
  createEngine,
  edge,
  eventTypes,
  makeGraph,
  makeNode,
  nodeStatuses,
  startRun,
  type Engine,
} from "./engine-harness.js"

/**
 * Bug category (b): a node that SHOULD run fails to execute.
 *
 * The scheduler gates a node on (1) all upstream completed and (2) required
 * contract inputs present. These tests verify the positive path (a multi-input
 * node executes once every upstream completes) and that missing inputs gate the
 * node deterministically without crashing the run.
 */
describe("engine (b): node execution gating", () => {
  let engine: Engine
  beforeEach(() => { engine = createEngine() })
  afterEach(() => { engine.cleanup() })

  test("diamond: merge node executes only after BOTH upstreams complete", async () => {
    const g = makeGraph(
      [
        makeNode("root", { kind: "success" }),
        makeNode("left", { kind: "success" }),
        makeNode("right", { kind: "success" }),
        makeNode("merge", { kind: "success" }),
      ],
      [edge("root", "left"), edge("root", "right"), edge("left", "merge"), edge("right", "merge")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    expect(engine.store.get(id)!.status).toBe("completed")
    expect(nodeStatuses(engine, id)).toEqual({
      root: "completed", left: "completed", right: "completed", merge: "completed",
    })
    // merge must have started (proof it was actually scheduled, not skipped).
    const started = eventTypes(engine, id).filter((t) => t === "node_started").length
    expect(started).toBe(4)
  })

  test("wide fan-out: all parallel children execute", async () => {
    const g = makeGraph(
      [
        makeNode("root", { kind: "success" }),
        makeNode("c1", { kind: "success" }),
        makeNode("c2", { kind: "success" }),
        makeNode("c3", { kind: "success" }),
      ],
      [edge("root", "c1"), edge("root", "c2"), edge("root", "c3")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    const s = nodeStatuses(engine, id)
    expect(s).toEqual({ root: "completed", c1: "completed", c2: "completed", c3: "completed" })
  })

  test("missing REQUIRED contract input gates the node (stays waiting, run fails, no crash)", async () => {
    // A node that declares a required input which is never produced. The engine
    // must exclude it from every wave and finalize deterministically.
    const gated = makeNode("gated", { kind: "success" }, {
      metadata: {
        archetype: "worker",
        contract: {
          transport: "inter",
          inputs: [{ key: "missing-artifact", from: "missing-artifact", mode: "reference", required: true }],
        },
      },
    })
    const g = makeGraph([gated], [])
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    const rec = engine.store.get(id)!
    expect(nodeStatuses(engine, id).gated).toBe("waiting") // never executed
    expect(rec.status).toBe("failed") // incomplete => failed (no crash, no hang)
    // The node was never started because its input was not ready.
    expect(eventTypes(engine, id)).not.toContain("node_started")
  })
})
