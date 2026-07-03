import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import type { AgentRuntime } from "../runtime.js"
import type { WorkflowGraph } from "../schema/types.js"
import type { WorkflowRunRecord } from "./types.js"
import { FileWorkflowRunEventLog } from "./events.js"
import { FileWorkflowRunStore } from "./store.js"
import { WorkflowRunRunner } from "./runner.js"

/**
 * Regression: a run paused at a human-gate must NOT be flipped to `failed` by a
 * deferred / re-entrant `executeRun` that gets drained after the pause. See the
 * gate-pause double-fire bug where the re-entry flipped status to "running",
 * ran no node (the paused gate is ineligible for any wave batch), then finalized
 * as `failed` (hasFailures=false, allCompleted=false).
 */
describe("human-gate deferred resume", () => {
  const GATE_ID = "submit-review-gate"
  const UPSTREAM_ID = "draft"

  function makeGraph(): WorkflowGraph {
    return {
      nodes: [
        { id: UPSTREAM_ID, label: "Draft", config: { provider: "opencode", mode: "build", cwd: ".", prompt: "", contextMode: "fresh" }, metadata: { archetype: "worker" } },
        { id: GATE_ID, label: "Review Gate", config: { provider: "custom", mode: "human-gate", cwd: ".", prompt: "", contextMode: "fresh" }, metadata: { archetype: "gate" } },
      ],
      edges: [{ from: UPSTREAM_ID, to: GATE_ID }],
    }
  }

  function makePausedRecord(id: string, graph: WorkflowGraph): WorkflowRunRecord {
    const now = new Date().toISOString()
    return {
      id,
      templateId: "test",
      defaultLabel: "test",
      labels: [],
      name: `Run ${id}`,
      graph,
      status: "paused",
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      activeDurationMs: 0,
      activeSegmentStartedAt: null,
      currentNodeIds: [GATE_ID],
      completedNodeIds: [UPSTREAM_ID],
      failedNodeIds: [],
      nodeStates: {
        [UPSTREAM_ID]: { id: UPSTREAM_ID, status: "completed", startedAt: now, finishedAt: now },
        [GATE_ID]: { id: GATE_ID, status: "paused", startedAt: now, finishedAt: null },
      },
      nodeResults: {},
      nodeSessions: {},
      sessionGroups: {},
      history: { selectedAgentModes: {}, nodeOutputs: {} },
      latestEvent: null,
      progress: { totalNodes: 2, completedNodes: 1, failedNodes: 0, runningNodes: 0, waitingNodes: 0, percent: 50 },
      error: "human-review",
    }
  }

  test("drained deferred resume keeps run paused, never failed", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "wf-gate-"))
    try {
      const store = new FileWorkflowRunStore({ dataDir })
      const events = new FileWorkflowRunEventLog({ dataDir })
      // Runtime is never invoked: the paused gate node runs no work.
      const runtime = {} as unknown as AgentRuntime
      const runner = new WorkflowRunRunner({ runtime, store, events, dataDir })

      const graph = makeGraph()
      const id = "01TESTGATEDEFERRED0000000001"
      store.create(makePausedRecord(id, graph))

      // Simulate the deferred/re-entrant resumes drained after the pause. The old
      // bug fired `workflow_started -> workflow_completed:failed` twice ~35ms apart;
      // each carried a startAtNodeId, bypassing the old paused guard.
      await runner.runExecution(id, {}, GATE_ID)
      await runner.runExecution(id, { bypassCache: true }, GATE_ID)

      const after = store.get(id)!
      expect(after.status).toBe("paused")
      expect(after.nodeStates[GATE_ID]!.status).toBe("paused")
      expect(after.failedNodeIds).toEqual([])
      expect(after.error).toBe("human-review")

      // The stale resumes must not have emitted any lifecycle churn.
      const emitted = events.read(id).map((e) => (e as { type?: string }).type)
      expect(emitted).not.toContain("workflow_started")
      expect(emitted).not.toContain("workflow_failed")
      expect(emitted).not.toContain("workflow_completed")
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
