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
 * Bug category (c): a failed node cannot be retried (or the wrong things retry).
 *
 * Three layers: automatic transient retry inside runNode (only for matching
 * error strings), manual retryNode, and the startAtNodeId resume semantics.
 */
describe("engine (c): retry behavior", () => {
  let engine: Engine
  beforeEach(() => { engine = createEngine() })
  afterEach(() => { engine.cleanup() })

  test("transient error (429) auto-retries then succeeds", async () => {
    const key = `t-${Date.now()}-${Math.random()}`
    const g = makeGraph(
      [makeNode("a", { kind: "transient", error: "429 rate limit", failTimes: 1, key })],
      [],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    expect(nodeStatuses(engine, id).a).toBe("completed")
    expect(engine.store.get(id)!.status).toBe("completed")
  }, 20_000)

  test("non-transient error (401) does NOT auto-retry and fails fast", async () => {
    const start = Date.now()
    const g = makeGraph([makeNode("a", { kind: "fail", error: "401 unauthorized" })], [])
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    // No 3s backoff sleep should have occurred (fail is immediate).
    expect(Date.now() - start).toBeLessThan(2000)
    expect(nodeStatuses(engine, id).a).toBe("failed")
    expect(engine.store.get(id)!.status).toBe("failed")
  })

  test("manual retryNode reruns a failed node and recovers downstream", async () => {
    // `a` fails once (non-transient so no auto-retry), then succeeds on manual retry.
    const key = `r-${Date.now()}-${Math.random()}`
    const g = makeGraph(
      [
        makeNode("a", { kind: "transient", error: "401 unauthorized", failTimes: 1, key }),
        makeNode("b", { kind: "success" }),
      ],
      [edge("a", "b")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    expect(nodeStatuses(engine, id).a).toBe("failed")
    expect(nodeStatuses(engine, id).b).toBe("waiting")
    expect(engine.store.get(id)!.status).toBe("failed")

    // Manual retry resets `a` (queue is stopped, so drive execution directly).
    const retried = engine.runner.retryNode(id, "a")!
    expect(retried.nodeStates.a!.status).toBe("waiting")
    expect(retried.status).toBe("queued")
    await engine.runner.runExecution(id, { bypassCache: false }, "a")

    expect(nodeStatuses(engine, id)).toEqual({ a: "completed", b: "completed" })
    expect(engine.store.get(id)!.status).toBe("completed")
  })

  test("BUG#5: startAtNodeId skips earlier incomplete nodes, leaving the target unrunnable", async () => {
    // Chain a -> b -> c. Simulate a mid-graph retry of `b` while `a` is still
    // incomplete (waiting). The resume skips `a`, but `b` is then blocked by its
    // incomplete upstream, so `b` never runs — a silent dead-end.
    const g = makeGraph(
      [
        makeNode("a", { kind: "success" }),
        makeNode("b", { kind: "success" }),
        makeNode("c", { kind: "success" }),
      ],
      [edge("a", "b"), edge("b", "c")],
    )
    const id = startRun(engine, g)
    // Force the record into a state where `a` never completed but we retry from `b`.
    const rec = engine.store.get(id)!
    rec.nodeStates.b = { id: "b", status: "failed", startedAt: null, finishedAt: null, error: "boom" }
    rec.failedNodeIds = ["b"]
    engine.store.save(rec)

    await engine.runner.runExecution(id, { bypassCache: false }, "b")

    const after = nodeStatuses(engine, id)
    // `b` was the retry target but its upstream `a` is not completed, so the
    // upstream gate excludes it: it never actually re-executes.
    expect(after.a).toBe("waiting")
    expect(after.b).not.toBe("completed")
    expect(after.c).toBe("waiting")
    expect(eventTypes(engine, id)).not.toContain("node_started")
    expect(engine.store.get(id)!.status).toBe("failed")
  })
})
