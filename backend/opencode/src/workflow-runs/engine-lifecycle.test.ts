import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import {
  createEngine,
  edge,
  makeGraph,
  makeNode,
  nodeStatuses,
  startRun,
  stubHooks,
  type Engine,
} from "./engine-harness.js"

/**
 * Lifecycle / resume: pause, interrupt, cancel, human-gate, inquiry.
 *
 * A run must always be resumable from a paused state and never resumable from a
 * terminal (cancelled) state; a legitimate pause must never be finalized as a
 * spurious failure.
 */
describe("engine lifecycle & resume", () => {
  let engine: Engine
  beforeEach(() => { engine = createEngine() })
  afterEach(() => { engine.cleanup() })

  test("graceful pause at a wave boundary, then continue to completion", async () => {
    const g = makeGraph(
      [makeNode("a", { kind: "success", hook: "pauseNow" }), makeNode("b", { kind: "success" })],
      [edge("a", "b")],
    )
    const id = startRun(engine, g)
    stubHooks.set("pauseNow", () => { engine.runner.pauseWorkflowRun(id) })

    await engine.runner.runExecution(id)
    let rec = engine.store.get(id)!
    expect(rec.status).toBe("paused")
    expect(rec.error).toBe("user-pause")
    expect(nodeStatuses(engine, id)).toEqual({ a: "completed", b: "waiting" })

    // Continue (queue is stopped, so drive the resumed execution directly).
    const resumed = engine.runner.continueWorkflowRun(id)!
    expect(resumed.status).toBe("queued")
    await engine.runner.runExecution(id)
    rec = engine.store.get(id)!
    expect(rec.status).toBe("completed")
    expect(nodeStatuses(engine, id)).toEqual({ a: "completed", b: "completed" })
  })

  test("interrupt returns running node to 'waiting' and pauses; continue reruns it", async () => {
    const g = makeGraph([makeNode("a", { kind: "success" }), makeNode("b", { kind: "success" })], [edge("a", "b")])
    const id = startRun(engine, g)
    // Put the run mid-flight with `a` running.
    const rec = engine.store.get(id)!
    rec.status = "running"
    rec.nodeStates.a = { id: "a", status: "running", startedAt: new Date().toISOString(), finishedAt: null }
    rec.currentNodeIds = ["a"]
    engine.store.save(rec)

    const interrupted = engine.runner.interruptWorkflowRun(id)!
    expect(interrupted.status).toBe("paused")
    expect(interrupted.error).toBe("user-interrupt")
    expect(interrupted.nodeStates.a!.status).toBe("waiting")

    const resumed = engine.runner.continueWorkflowRun(id)!
    expect(resumed.status).toBe("queued")
    await engine.runner.runExecution(id)
    expect(engine.store.get(id)!.status).toBe("completed")
    expect(nodeStatuses(engine, id)).toEqual({ a: "completed", b: "completed" })
  })

  test("cancel is terminal and not resumable", async () => {
    const g = makeGraph([makeNode("a", { kind: "success" }), makeNode("b", { kind: "success" })], [edge("a", "b")])
    const id = startRun(engine, g)
    const rec = engine.store.get(id)!
    rec.status = "running"
    rec.nodeStates.a = { id: "a", status: "running", startedAt: new Date().toISOString(), finishedAt: null }
    rec.currentNodeIds = ["a"]
    engine.store.save(rec)

    const cancelled = engine.runner.cancelWorkflowRun(id)!
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.nodeStates.a!.status).toBe("cancelled")
    expect(cancelled.nodeStates.b!.status).toBe("cancelled")

    // A cancelled run cannot be continued.
    expect(engine.runner.continueWorkflowRun(id)).toBeNull()
  })

  test("human-gate pauses for review, approval completes the gate and runs downstream", async () => {
    const g = makeGraph(
      [
        makeNode("draft", { kind: "success" }),
        makeNode("approve", { kind: "success" }, { actionKind: "human-gate" }),
        makeNode("publish", { kind: "success" }),
      ],
      [edge("draft", "approve"), edge("approve", "publish")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    let rec = engine.store.get(id)!
    expect(rec.status).toBe("paused")
    expect(rec.error).toBe("human-review")
    expect(nodeStatuses(engine, id)).toEqual({ draft: "completed", approve: "paused", publish: "waiting" })

    // A paused-for-review run must NOT be a spurious failure.
    expect(rec.failedNodeIds).toEqual([])

    const resumed = engine.runner.continueWorkflowRun(id)!
    expect(resumed.status).toBe("queued")
    await engine.runner.runExecution(id)
    rec = engine.store.get(id)!
    expect(rec.status).toBe("completed")
    expect(nodeStatuses(engine, id)).toEqual({ draft: "completed", approve: "completed", publish: "completed" })
  })

  test("inquiry pauses; continue requires a reply, then resolves", async () => {
    const g = makeGraph(
      [
        makeNode("draft", { kind: "success" }),
        makeNode("clarify", { kind: "success" }, { actionKind: "inquiry" }),
        makeNode("finalize", { kind: "success" }),
      ],
      [edge("draft", "clarify"), edge("clarify", "finalize")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    let rec = engine.store.get(id)!
    expect(rec.status).toBe("paused")
    expect(rec.error).toBe("inquiry-pending")
    expect(nodeStatuses(engine, id).clarify).toBe("paused")

    // Continue without a reply is rejected.
    expect(engine.runner.continueWorkflowRun(id)).toBeNull()
    expect(engine.store.get(id)!.status).toBe("paused")

    // Continue with a reply resolves the gate and resumes.
    const resumed = engine.runner.continueWorkflowRun(id, { inquiryReply: "use option A" })!
    expect(resumed.status).toBe("queued")
    await engine.runner.runExecution(id)
    rec = engine.store.get(id)!
    expect(rec.status).toBe("completed")
    expect(nodeStatuses(engine, id)).toEqual({ draft: "completed", clarify: "completed", finalize: "completed" })
  })
})
