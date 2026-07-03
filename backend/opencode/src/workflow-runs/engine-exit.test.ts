import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { FileWorkflowRunStore } from "./store.js"
import { FileWorkflowRunEventLog } from "./events.js"
import { WorkflowRunRunner } from "./runner.js"
import type { WorkflowRunRecord } from "./types.js"
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
 * Bug category (a): unexpected exit / spurious failure.
 *
 * The engine must finalize deterministically: all-success => completed; a soft
 * failure must not abort unrelated branches; a hard-archetype failure must break
 * the run; and an uncaught persistence error must never leave a run silently
 * stuck in "running" with no terminal event (bug #1).
 */
describe("engine (a): exit / failure propagation", () => {
  let engine: Engine
  beforeEach(() => { engine = createEngine() })
  afterEach(() => { engine.cleanup() })

  test("single success node => run completed", async () => {
    const g = makeGraph([makeNode("a", { kind: "success" })], [])
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    const rec = engine.store.get(id)!
    expect(rec.status).toBe("completed")
    expect(nodeStatuses(engine, id)).toEqual({ a: "completed" })
    expect(eventTypes(engine, id)).toContain("workflow_completed")
  })

  test("linear all-success chain => completed, every node ran", async () => {
    const g = makeGraph(
      [makeNode("a", { kind: "success" }), makeNode("b", { kind: "success" }), makeNode("c", { kind: "success" })],
      [edge("a", "b"), edge("b", "c")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    expect(engine.store.get(id)!.status).toBe("completed")
    expect(nodeStatuses(engine, id)).toEqual({ a: "completed", b: "completed", c: "completed" })
  })

  test("soft failure does NOT abort an independent parallel branch", async () => {
    // root -> softFail ; root -> ok . The ok branch must still complete.
    const g = makeGraph(
      [
        makeNode("root", { kind: "success" }),
        makeNode("softFail", { kind: "fail", error: "401 unauthorized" }, { archetype: "worker" }),
        makeNode("ok", { kind: "success" }, { archetype: "worker" }),
      ],
      [edge("root", "softFail"), edge("root", "ok")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    const rec = engine.store.get(id)!
    const s = nodeStatuses(engine, id)
    expect(s.root).toBe("completed")
    expect(s.softFail).toBe("failed")
    expect(s.ok).toBe("completed") // independent branch not aborted
    expect(rec.status).toBe("failed") // run overall failed because a node failed
  })

  test("hard-archetype failure breaks the run (downstream never runs)", async () => {
    const g = makeGraph(
      [
        makeNode("root", { kind: "success" }),
        makeNode("gate", { kind: "fail", error: "401 unauthorized" }, { archetype: "finalizer" }),
        makeNode("after", { kind: "success" }),
      ],
      [edge("root", "gate"), edge("gate", "after")],
    )
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    const s = nodeStatuses(engine, id)
    expect(s.gate).toBe("failed")
    expect(s.after).toBe("waiting") // downstream of a failed hard node never executes
    expect(engine.store.get(id)!.status).toBe("failed")
  })

  test("BUG#1: uncaught finalize persistence error leaves run stuck 'running' until restart", async () => {
    // Wrap the store so the *finalize* save throws (disk full / IO error).
    const realStore = engine.store
    let armed = false
    const proxy = new Proxy(realStore, {
      get(target, prop, receiver) {
        if (prop === "save") {
          return (record: WorkflowRunRecord) => {
            if (armed && record.finishedAt && (record.status === "completed" || record.status === "failed")) {
              throw new Error("simulated disk failure during finalize")
            }
            return target.save(record)
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as FileWorkflowRunStore

    const runner = new WorkflowRunRunner({
      runtime: engine.runtime,
      store: proxy,
      events: engine.events,
      dataDir: engine.dataDir,
      cacheMode: "off",
    })
    const g = makeGraph([makeNode("a", { kind: "success" })], [])
    const id = runner.startWorkflowRun(g, { templateId: "stuck" }).id

    armed = true
    let threw = false
    try {
      await runner.runExecution(id)
    } catch {
      threw = true
    }
    expect(threw).toBe(true)

    // Confirmed defect: the finalize never persisted, so the ON-DISK run is
    // stuck "running" with no terminal event. (A fresh store instance mimics a
    // process restart / separate reader that bypasses the in-memory cache.)
    const diskStore = new FileWorkflowRunStore({ dataDir: engine.dataDir })
    expect(diskStore.get(id)!.status).toBe("running")
    expect(eventTypes(engine, id)).not.toContain("workflow_completed")
    expect(eventTypes(engine, id)).not.toContain("workflow_failed")

    // Recovery only happens when a fresh runner boots (orphan sweep) — i.e. the
    // user must restart the backend; the run cannot recover on its own.
    const recoveryStore = new FileWorkflowRunStore({ dataDir: engine.dataDir })
    const rebooted = new WorkflowRunRunner({
      runtime: engine.runtime,
      store: recoveryStore,
      events: engine.events,
      dataDir: engine.dataDir,
      cacheMode: "off",
    })
    void rebooted
    const recovered = new FileWorkflowRunStore({ dataDir: engine.dataDir }).get(id)!
    expect(recovered.status).toBe("failed")
    expect(recovered.error).toBe("runtime-exited")
  })
})
