import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import {
  createEngine,
  edge,
  makeGraph,
  makeNode,
  nodeStatuses,
  startRun,
  type Engine,
} from "./engine-harness.js"

/**
 * Bug category (d): a node silently does not execute (no "skipped" status).
 *
 * These tests document engine behaviors that can surprise operators: downstream
 * of a soft failure stays "waiting" forever, `condition` action kinds do not
 * branch, and there is no disabled-node concept.
 */
describe("engine (d): silent non-execution", () => {
  let engine: Engine
  beforeEach(() => { engine = createEngine() })
  afterEach(() => { engine.cleanup() })

  test("BUG#6: downstream of a soft failure stays 'waiting' (no 'skipped' signal)", async () => {
    const g = makeGraph(
      [
        makeNode("a", { kind: "fail", error: "401 unauthorized" }, { archetype: "worker" }),
        makeNode("b", { kind: "success" }),
      ],
      [edge("a", "b")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    const s = nodeStatuses(engine, id)
    expect(s.a).toBe("failed")
    // `b` is neither run nor explicitly skipped — it is indistinguishable from a
    // node that is merely pending. The vocabulary has no "skipped" state.
    expect(s.b).toBe("waiting")
    expect(engine.store.get(id)!.status).toBe("failed")
  })

  test("BUG#3: a 'condition' node does not branch — all downstreams execute", async () => {
    const cond = makeNode("cond", { kind: "success" }, { actionKind: "condition" })
    const g = makeGraph(
      [cond, makeNode("thenNode", { kind: "success" }), makeNode("elseNode", { kind: "success" })],
      [edge("cond", "thenNode"), edge("cond", "elseNode")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    const s = nodeStatuses(engine, id)
    // If condition branching worked, only one of thenNode/elseNode would run.
    // The engine has no branch logic, so BOTH run.
    expect(s.cond).toBe("completed")
    expect(s.thenNode).toBe("completed")
    expect(s.elseNode).toBe("completed")
  })

  test("BUG#4: there is no disabled-node concept — a 'disabled' node still runs", async () => {
    const g = makeGraph(
      [makeNode("disabled", { kind: "success" }, { metadata: { enabled: false, disabled: true } })],
      [],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    // metadata.enabled/disabled are ignored by the scheduler.
    expect(nodeStatuses(engine, id).disabled).toBe("completed")
    expect(engine.store.get(id)!.status).toBe("completed")
  })
})
