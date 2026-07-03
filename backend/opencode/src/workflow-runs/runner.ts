import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ulid } from "ulid"

import type { AgentNodeConfig, AgentNodeOutput, SessionState, WorkflowGraph, WorkflowNode } from "../schema/types.js"
import type { AgentRuntime } from "../runtime.js"
import type { FileWorkflowRunEventLog } from "./events.js"
import {
  buildFinalNovelFromChapters,
  listRunArtifacts,
  persistNodeMarkdown,
  readRunMarkdownFiles,
  type WorkflowOutputContext,
} from "./node-output-files.js"
import type { FileWorkflowRunStore } from "./store.js"
import { workflowExecutionQueue } from "./execution-queue.js"
import { getExecutionBridge } from "./threads/execution-bridge.js"
import { summarizeUsageForSessionIds } from "../opencode-telemetry.js"
import type {
  WorkflowRunLifecycleEvent,
  WorkflowRunNodeState,
  WorkflowRunRecord,
  WorkflowRunStartOptions,
  WorkflowRunContinueOptions,
} from "./types.js"
import { handlePostNodeComplete } from "./runner/node-complete-handler.js"
import { preparePlannerInquiryNodeRun, readPlannerInquiry, writePlannerInquiryAnswered } from "./planner-inquiry.js"
import { executionWaves, allUpstreamCompleted, resolveUpstream } from "./runner/graph-scheduler.js"
import { enrichNodeConfig } from "./runner/node-config-enricher.js"
import { normalizeLabels, runBatchWithAdaptiveRetry, createParallelLimitHolder, isConcurrencyLimitError, reduceParallelLimit, sleep, stripForHistory } from "./runner/runner-utils.js"
import { artifactRefsFromOutput, summarizeUsageFromResults } from "./runner/usage-artifacts.js"
import { nodeAction, resolveNodeConfig } from "./runner/node-config-resolver.js"
import { toContextMode } from "./runner/coercion.js"
import {
  Blackboard,
  blockingMissing,
  createSessionCheckpoint,
  nodeInputReady,
  readNodeArchetype,
  repairStillMissing,
  saveRawOutput,
} from "./context/index.js"
import { readWorkspaceFile, resolveWorkspaceFile } from "./context/resolver.js"
import type { WorkflowNodeContextMeta } from "./context/types.js"
import { runLlmApiNode } from "./runner/run-llm-api-node.js"
import {
  allocateWorkflowWorkspaceKey,
  ensureWorkflowWorkspace,
  parseWorkspaceKeyFromPath,
  resolveWorkflowWorkspace,
  workflowArtifactHref,
  workflowWorkspaceRelativePath,
} from "./workspace-paths.js"
import { seedWorkflowWorkspace } from "./workspace-seed.js"
import { missingGateArtifacts } from "./gate-prerequisites.js"
import { enrichWorkflowGraphReadAccess, resolveWorkflowDirs } from "./workspace-dirs.js"
import { validateWorkflowDirs } from "./workspace-preflight.js"
import { beginActiveSegment, pauseActiveSegment } from "./run-timing.js"

export interface WorkflowRunRunnerOptions {
  runtime: AgentRuntime
  store: FileWorkflowRunStore
  events: FileWorkflowRunEventLog
  dataDir: string
  cacheMode?: "off" | "input-only" | "files-aware"
}

export abstract class WorkflowRunRunnerBase {
  abstract startWorkflowRun(graph: WorkflowGraph, options?: WorkflowRunStartOptions): WorkflowRunRecord
  abstract cancelWorkflowRun(id: string): WorkflowRunRecord | null
  abstract pauseWorkflowRun(id: string): WorkflowRunRecord | null
  abstract interruptWorkflowRun(id: string): WorkflowRunRecord | null
  abstract retryNode(id: string, nodeId: string): WorkflowRunRecord | null
  abstract continueWorkflowRun(id: string, options?: WorkflowRunContinueOptions): WorkflowRunRecord | null
  abstract shutdown(reason?: string): WorkflowRunRecord[]
}

export class WorkflowRunRunner extends WorkflowRunRunnerBase {
  private runtime: AgentRuntime
  private store: FileWorkflowRunStore
  private events: FileWorkflowRunEventLog
  private dataDir: string
  private cacheMode: "off" | "input-only" | "files-aware"
  private activeRuns = new Set<string>()
  private cancelledRuns = new Set<string>()
  private gracefulStopRuns = new Map<string, string>()
  private interruptRuns = new Set<string>()
  private abortControllers = new Map<string, AbortController>()
  private recordLocks = new Map<string, Promise<void>>()

  constructor(options: WorkflowRunRunnerOptions) {
    super()
    this.runtime = options.runtime
    this.store = options.store
    this.events = options.events
    this.dataDir = options.dataDir
    this.cacheMode = options.cacheMode ?? "input-only"
    this.store.markOrphanedRunsFailed("runtime-exited")
  }

  private freezeRunTimer(draft: WorkflowRunRecord, atIso: string): void {
    pauseActiveSegment(draft, atIso)
  }

  private executionBridge() {
    return getExecutionBridge({ dataDir: this.dataDir, cacheMode: this.cacheMode })
  }

  /** Public entry used by the execution worker thread. */
  async runExecution(id: string, options: WorkflowRunStartOptions = {}, startAtNodeId?: string): Promise<void> {
    return this.executeRun(id, options, startAtNodeId)
  }

  startWorkflowRun(graph: WorkflowGraph, options: WorkflowRunStartOptions = {}): WorkflowRunRecord {
    enrichWorkflowGraphReadAccess(graph)
    const timestamp = new Date().toISOString()
    const id = ulid()
    const record: WorkflowRunRecord = {
      id,
      templateId: options.templateId ?? "ad-hoc",
      defaultLabel: options.defaultLabel ?? options.templateId ?? "ad-hoc",
      labels: normalizeLabels(options.labels),
      name: options.name ?? `Workflow Run ${id}`,
      graph,
      status: "queued",
      createdAt: timestamp,
      startedAt: null,
      updatedAt: timestamp,
      finishedAt: null,
      activeDurationMs: 0,
      activeSegmentStartedAt: null,
      currentNodeIds: [],
      completedNodeIds: [],
      failedNodeIds: [],
      nodeStates: Object.fromEntries(graph.nodes.map((node) => [node.id, {
        id: node.id,
        status: "waiting",
        startedAt: null,
        finishedAt: null,
      }])),
      nodeResults: {},
      nodeSessions: {},
      sessionGroups: { ...(graph.sessionGroups ?? {}) },
      history: {
        prompt: options.prompt,
        workflowTemplateId: options.templateId,
        workflowTemplateVersion: options.templateVersion,
        workflowTemplateSnapshot: options.workflowTemplateSnapshot,
        selectedAgentModes: options.selectedAgentModes ?? this.selectedAgentModes(graph),
        nodeOutputs: {},
        finalOutput: undefined,
      },
      latestEvent: null,
      progress: { totalNodes: graph.nodes.length, completedNodes: 0, failedNodes: 0, runningNodes: 0, waitingNodes: graph.nodes.length, percent: graph.nodes.length === 0 ? 100 : 0 },
      error: null,
    }

    const queued = this.store.create(record)
    this.emit(queued, { type: "workflow_queued", runId: id, status: "queued", timestamp })
    workflowExecutionQueue.enqueue(() => this.executionBridge().executeRun(id, options))
    return queued
  }

  cancelWorkflowRun(id: string): WorkflowRunRecord | null {
    const record = this.store.get(id)
    if (!record) return null
    this.cancelledRuns.add(id)
    this.interruptRuns.delete(id)
    this.abortControllers.get(id)?.abort()
    void this.executionBridge().cancelRun(id)
    if (record.status === "completed" || record.status === "failed" || record.status === "cancelled") return record

    const timestamp = new Date().toISOString()
    record.status = "cancelled"
    record.finishedAt = timestamp
    record.currentNodeIds = []
    for (const nodeId of Object.keys(record.nodeStates)) {
      const state = record.nodeStates[nodeId]
      if (!state) continue
      if (state.status === "running" || state.status === "waiting") {
        state.status = "cancelled"
        state.finishedAt = timestamp
      }
    }
    const saved = this.store.save(record)
    this.emit(saved, { type: "workflow_cancelled", runId: id, status: "cancelled", timestamp })
    return saved
  }

  pauseWorkflowRun(id: string): WorkflowRunRecord | null {
    const record = this.store.get(id)
    if (!record) return null
    if (record.status === "completed" || record.status === "failed" || record.status === "cancelled") return record
    this.gracefulStopRuns.set(id, "user-pause")
    return record
  }

  interruptWorkflowRun(id: string): WorkflowRunRecord | null {
    const record = this.store.get(id)
    if (!record) return null
    if (record.status === "completed" || record.status === "failed" || record.status === "cancelled") return record

    this.interruptRuns.add(id)
    this.abortControllers.get(id)?.abort()
    void this.executionBridge().cancelRun(id)

    const timestamp = new Date().toISOString()
    for (const nodeId of [...record.currentNodeIds]) {
      const state = record.nodeStates[nodeId]
      if (!state || state.status !== "running") continue
      record.nodeStates[nodeId] = {
        id: nodeId,
        status: "waiting",
        startedAt: null,
        finishedAt: null,
        error: undefined,
        sessionId: state.sessionId,
      }
    }
    record.status = "paused"
    record.error = "user-interrupt"
    record.finishedAt = timestamp
    record.currentNodeIds = []
    const saved = this.store.save(record)
    this.emit(saved, { type: "workflow_paused", runId: id, status: "paused", error: "user-interrupt", timestamp })
    this.interruptRuns.delete(id)
    return saved
  }

  retryNode(id: string, nodeId: string): WorkflowRunRecord | null {
    const record = this.store.get(id)
    if (!record || !record.nodeStates[nodeId]) return null
    delete record.nodeResults[nodeId]
    delete record.nodeSessions[nodeId]
    record.failedNodeIds = record.failedNodeIds.filter((value) => value !== nodeId)
    record.completedNodeIds = record.completedNodeIds.filter((value) => value !== nodeId)
    record.nodeStates[nodeId] = { id: nodeId, status: "waiting", startedAt: null, finishedAt: null }
    record.status = "queued"
    record.finishedAt = null
    record.error = null
    const saved = this.store.save(record)
    workflowExecutionQueue.enqueue(() => this.executionBridge().executeRun(id, { bypassCache: false }, nodeId))
    return saved
  }

  /**
   * Reconstruct the pause reason for a node that is still `paused` but whose run
   * was spuriously finalized (so the run-level `error` was cleared to null).
   * Mirrors the strings the pause paths write in runNode.
   */
  private inferPauseError(record: WorkflowRunRecord, pausedNode: WorkflowRunNodeState): string {
    if (pausedNode.error?.startsWith("needs-repair:")) return pausedNode.error
    const node = record.graph.nodes.find((n) => n.id === pausedNode.id)
    const action = node ? nodeAction(node, node.config.contextMode) : undefined
    const phase = (record.nodeResults[pausedNode.id]?.metadata as { plannerInquiryPhase?: string } | undefined)?.plannerInquiryPhase
    if (action?.kind === "inquiry" || phase === "questions") return "inquiry-pending"
    return "human-review"
  }

  continueWorkflowRun(id: string, options: WorkflowRunContinueOptions = {}): WorkflowRunRecord | null {
    const record = this.store.get(id)
    if (!record) return null
    // Recovery: a run that was spuriously finalized as `failed` by a deferred /
    // re-entrant resume while a node was legitimately paused (human-gate /
    // inquiry / needs-repair) — and where nothing actually failed — is resumable.
    // Restore the paused state the pause path would have written so the normal
    // continue handling below can run. Runs with real node failures
    // (failedNodeIds non-empty) are NOT eligible here and must use retry-node,
    // so a genuine failure can never be silently skipped.
    if (record.status === "failed" && record.failedNodeIds.length === 0) {
      const pausedNode = Object.values(record.nodeStates).find((state) => state.status === "paused")
      if (pausedNode) {
        record.status = "paused"
        record.error = this.inferPauseError(record, pausedNode)
        record.finishedAt = null
        record.currentNodeIds = [pausedNode.id]
        this.store.save(record)
      }
    }
    if (record.status !== "paused") return null

    if (record.error === "user-pause" || record.error === "user-interrupt") {
      const timestamp = new Date().toISOString()
      record.status = "queued"
      record.error = null
      record.finishedAt = null
      const saved = this.store.save(record)
      this.emit(saved, { type: "workflow_started", runId: id, status: "running", timestamp })
      workflowExecutionQueue.enqueue(() => this.executionBridge().executeRun(id))
      return saved
    }

    if (record.error?.startsWith("needs-repair:")) {
      const nodeId = record.currentNodeIds[0]
        ?? Object.entries(record.nodeStates).find(([, s]) => s.status === "paused")?.[0]
      if (!nodeId) return null
      const workspace = resolveWorkflowWorkspace(record)
      if (!workspace) return null
      const node = record.graph.nodes.find((n) => n.id === nodeId)
      if (!node) return null
      const blackboard = new Blackboard(workspace)
      const still = repairStillMissing(workspace, node, blackboard)
      const blocking = blockingMissing(record.graph, nodeId, still)
      if (blocking.length) {
        record.error = `needs-repair: ${nodeId} missing ${blocking.map((b) => b.path).join(", ")}`
        return this.store.save(record)
      }
      const timestamp = new Date().toISOString()
      record.nodeStates[nodeId] = {
        ...this.getNodeState(record, nodeId),
        status: "completed",
        finishedAt: timestamp,
        error: undefined,
      }
      if (!record.completedNodeIds.includes(nodeId)) record.completedNodeIds.push(nodeId)
      record.currentNodeIds = []
      record.status = "queued"
      record.error = null
      record.finishedAt = null
      const saved = this.store.save(record)
      this.emit(saved, { type: "workflow_started", runId: id, status: "running", timestamp })
      workflowExecutionQueue.enqueue(() => this.executionBridge().executeRun(id))
      return saved
    }

    const gateNodeId = record.currentNodeIds[0]
      ?? Object.entries(record.nodeStates).find(([, state]) => state.status === "paused")?.[0]
    if (!gateNodeId) return null

    const gateNode = record.graph.nodes.find((node) => node.id === gateNodeId)
    const gateAction = gateNode ? nodeAction(gateNode, gateNode.config.contextMode) : undefined
    const plannerInquiry = gateNode ? readPlannerInquiry(gateNode) !== null : false
    const isInquiry = record.error === "inquiry-pending" || gateAction?.kind === "inquiry"
    if (isInquiry) {
      const reply = typeof options.inquiryReply === "string" ? options.inquiryReply.trim() : ""
      if (!reply) return null
    }

    const timestamp = new Date().toISOString()
    const gateLabel = gateNode?.label ?? gateNodeId
    if (isInquiry && plannerInquiry && gateNode) {
      const reply = options.inquiryReply!.trim()
      const workspace = resolveWorkflowWorkspace(record)
      const inquiry = readPlannerInquiry(gateNode)
      if (workspace && inquiry) {
        mkdirSync(workspace, { recursive: true })
        writeFileSync(join(workspace, inquiry.replyFile), reply, "utf-8")
        writePlannerInquiryAnswered(workspace, id, inquiry)
      }
      record.nodeResults[gateNodeId] = {
        text: reply,
        summary: `Author clarification for ${gateLabel}: ${reply}`,
        artifacts: [],
        traceId: ulid(),
        cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
        metadata: {
          startedAt: timestamp,
          finishedAt: timestamp,
          durationMs: 0,
          exitCode: 0,
          cancelled: false,
          timedOut: false,
          iterations: 0,
          provider: "custom",
          providerVersion: null,
          inquiryReply: reply,
          plannerInquiryPhase: "answered",
        },
      }
      record.nodeStates[gateNodeId] = {
        id: gateNodeId,
        status: "waiting",
        startedAt: null,
        finishedAt: null,
        error: undefined,
      }
      record.completedNodeIds = record.completedNodeIds.filter((id) => id !== gateNodeId)
      record.currentNodeIds = []
      record.status = "queued"
      record.error = null
      record.finishedAt = null
      const saved = this.store.save(record)
      this.emit(saved, { type: "workflow_started", runId: id, status: "running", timestamp })
      workflowExecutionQueue.enqueue(() => this.executionBridge().executeRun(id, { bypassCache: true }, gateNodeId))
      return saved
    }
    if (isInquiry) {
      const reply = options.inquiryReply!.trim()
      record.nodeResults[gateNodeId] = {
        text: reply,
        summary: `User clarification for ${gateLabel}: ${reply}`,
        artifacts: [],
        traceId: ulid(),
        cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
        metadata: {
          startedAt: timestamp,
          finishedAt: timestamp,
          durationMs: 0,
          exitCode: 0,
          cancelled: false,
          timedOut: false,
          iterations: 0,
          provider: "custom",
          providerVersion: null,
          inquiryReply: reply,
        },
      }
    } else {
      record.nodeResults[gateNodeId] = {
        text: `Human review approved at ${timestamp}`,
        summary: `${gateLabel}: approved`,
        artifacts: [],
        traceId: ulid(),
        cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
        metadata: {
          startedAt: timestamp,
          finishedAt: timestamp,
          durationMs: 0,
          exitCode: 0,
          cancelled: false,
          timedOut: false,
          iterations: 0,
          provider: "custom",
          providerVersion: null,
        },
      }
    }
    record.nodeStates[gateNodeId] = {
      id: gateNodeId,
      status: "completed",
      startedAt: record.nodeStates[gateNodeId]?.startedAt ?? timestamp,
      finishedAt: timestamp,
    }
    if (!record.completedNodeIds.includes(gateNodeId)) record.completedNodeIds.push(gateNodeId)
    record.currentNodeIds = []
    record.status = "queued"
    record.error = null
    record.finishedAt = null
    const saved = this.store.save(record)
    this.emit(saved, { type: "workflow_started", runId: id, status: "running", timestamp })
    workflowExecutionQueue.enqueue(() => this.executionBridge().executeRun(id))
    return saved
  }

  shutdown(reason = "runtime-shutdown"): WorkflowRunRecord[] {
    workflowExecutionQueue.requestGracefulStop()
    void this.executionBridge().shutdown(reason)
    const stopped: WorkflowRunRecord[] = []
    for (const id of [...this.activeRuns]) {
      this.gracefulStopRuns.set(id, reason)
    }
    for (const id of [...this.activeRuns]) {
      const record = this.store.get(id)
      if (!record || record.status !== "queued") continue
      this.cancelledRuns.add(id)
      const cancelled = this.cancelWorkflowRun(id)
      if (cancelled) {
        cancelled.error = reason
        stopped.push(this.store.save(cancelled))
      }
    }
    return stopped
  }

  private async executeRun(id: string, options: WorkflowRunStartOptions = {}, startAtNodeId?: string): Promise<void> {
    const bypassCache = options.bypassCache === true
    if (this.activeRuns.has(id)) {
      workflowExecutionQueue.deferRunResume(id, options, startAtNodeId)
      return
    }
    this.activeRuns.add(id)
    const abortController = new AbortController()
    this.abortControllers.set(id, abortController)

    try {
      let record = this.store.get(id)
      if (!record) return
      if (record.status === "cancelled" || this.cancelledRuns.has(id)) return
      // A paused run is only ever resumed via continueWorkflowRun/retryNode, which
      // flip status to "queued" (never "paused") before enqueueing. So a deferred /
      // re-entrant resume that arrives while status is still "paused" is stale (a
      // gate/inquiry pause happened during the active invocation): it must not
      // un-pause the run, flip it to "running", and fall through to a spurious
      // finalize. Bail regardless of startAtNodeId.
      if (record.status === "paused") return
      this.cancelledRuns.delete(id)

      if (options.budgetBlocked && !options.budgetOverride) {
        const timestamp = new Date().toISOString()
        pauseActiveSegment(record, timestamp)
        record.status = "paused"
        record.error = options.budgetBlockReason ?? "budget-exceeded"
        const saved = this.store.save(record)
        this.emit(saved, {
          type: "workflow_failed",
          runId: id,
          status: "paused",
          error: saved.error ?? undefined,
          timestamp,
        })
        return
      }

      const startedAt = new Date().toISOString()
      record.status = "running"
      record.startedAt = record.startedAt ?? startedAt
      record.finishedAt = null
      if (!record.activeSegmentStartedAt) beginActiveSegment(record, startedAt)
      record = this.store.save(record)
      this.emit(record, { type: "workflow_started", runId: id, status: "running", timestamp: startedAt })

      const workspaceKey = record.history.workingDirectoryKey
        ?? (options.workingDirectory ? parseWorkspaceKeyFromPath(options.workingDirectory) : null)
        ?? allocateWorkflowWorkspaceKey(record.templateId, id)
      const outputDir = ensureWorkflowWorkspace(workspaceKey)
      enrichWorkflowGraphReadAccess(record.graph)
      const dirs = resolveWorkflowDirs(record.graph, options, outputDir)
      if (dirs.readDir) {
        console.log(`[runner] paper read root: ${dirs.readDir}`)
        if (dirs.readRoots.length) {
          console.log(`[runner] allowed read roots: ${dirs.readRoots.join("; ")}`)
        }
      }
      record = this.store.save(record)
      const preflight = validateWorkflowDirs({
        outputDir: dirs.outputDir,
        readDir: dirs.readDir,
        mounts: dirs.mounts,
      })
      if (!preflight.ok) {
        const timestamp = new Date().toISOString()
        record.status = "failed"
        record.error = preflight.error ?? "workspace-preflight-failed"
        record.finishedAt = timestamp
        const saved = this.store.save(record)
        this.emit(saved, {
          type: "workflow_failed",
          runId: id,
          status: "failed",
          error: saved.error ?? undefined,
          timestamp,
        })
        return
      }
      // Mounts must be physically visible under the run cwd so OpenCode's native
      // read/glob/list/grep (not just workflow-io MCP) can reach the source tree.
      // Default to junction/symlink; allow WORKFLOW_INPUT_MOUNT_MODE=read-roots to opt out.
      const mountMode =
        process.env.WORKFLOW_INPUT_MOUNT_MODE?.trim().toLowerCase() === "read-roots"
          ? "read-roots"
          : "symlink"
      const seed = seedWorkflowWorkspace(dirs.outputDir, dirs.mounts, { mode: mountMode })
      if (!seed.ok) {
        const timestamp = new Date().toISOString()
        record.status = "failed"
        record.error = seed.error ?? "workspace-seed-failed"
        record.finishedAt = timestamp
        const saved = this.store.save(record)
        this.emit(saved, {
          type: "workflow_failed",
          runId: id,
          status: "failed",
          error: saved.error ?? undefined,
          timestamp,
        })
        return
      }
      record.history.workingDirectoryKey = workspaceKey
      record.history.workingDirectory = workflowWorkspaceRelativePath(workspaceKey)
      if (dirs.readDir) record.history.readDirectory = dirs.readDir
      const outputCtx: WorkflowOutputContext = {
        dataDir: this.dataDir,
        runId: id,
        workspaceKey,
        workspaceDir: dirs.outputDir,
      }
      const blackboard = new Blackboard(dirs.outputDir)
      for (const node of record.graph.nodes) {
        node.config.cwd = dirs.outputDir
      }
      record = this.store.save(record)

      const nodeResults = new Map<string, AgentNodeOutput>(Object.entries(record.nodeResults))
      const nodeSessions = new Map<string, SessionState>()
      const sharedSessionIds = new Map<string, string>(Object.entries(record.sessionGroups))
      const waves = executionWaves(record.graph)
      let skipUntilTarget = Boolean(startAtNodeId)
      let failed = false
      const parallelLimit = createParallelLimitHolder()

      for (const wave of waves) {
        if (failed || this.cancelledRuns.has(id)) break
        const waveRecord = this.store.get(id) ?? record
        const batch = wave.filter((node) => {
          if (skipUntilTarget && node.id !== startAtNodeId) return false
          if (skipUntilTarget && node.id === startAtNodeId) {
            skipUntilTarget = false
          }
          const state = waveRecord.nodeStates[node.id]
          if (!state) return false
          if (state.status === "completed") return false
          if (state.status !== "waiting" && state.status !== "failed") return false
          if (!allUpstreamCompleted(waveRecord.graph, node.id, waveRecord.nodeStates)) return false
          return nodeInputReady(dirs.outputDir, node, blackboard).ready
        })

        if (!batch.length) continue

        let humanPaused = false
        const waveResults = await runBatchWithAdaptiveRetry(batch, async (node) => {
          const snapshot = this.store.get(id)
          if (!snapshot) return false
          try {
            const upstream = resolveUpstream(snapshot.graph, node, nodeResults, nodeSessions)
            let config = resolveNodeConfig(node, toContextMode(upstream.edgeContextMode), sharedSessionIds)
            config = enrichNodeConfig(node, config, dirs.outputDir, snapshot.graph, upstream.upstreamSession, id)
            config = {
              ...config,
              readRoots: dirs.readRoots,
              flatWriteOnly: readNodeArchetype(node) === "worker" ? true : config.flatWriteOnly,
            }
            return await this.runNode(snapshot, node, config, upstream.upstreamOutput, upstream.upstreamSession, bypassCache, nodeResults, nodeSessions, sharedSessionIds, abortController.signal, outputCtx, blackboard).then((result) => {
              if (result === "human-pause" || result === "needs-repair") {
                if (result === "human-pause") humanPaused = true
                return false
              }
              return result
            })
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            if (isConcurrencyLimitError(error)) reduceParallelLimit(parallelLimit)
            const failedAt = new Date().toISOString()
            await this.updateRecord(id, (draft) => {
              draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "failed", finishedAt: failedAt, error }
              draft.currentNodeIds = draft.currentNodeIds.filter((value) => value !== node.id)
              if (!draft.failedNodeIds.includes(node.id)) draft.failedNodeIds.push(node.id)
              draft.error = error
            })
            await this.emitLocked(id, { type: "node_failed", runId: id, nodeId: node.id, status: "failed", error, timestamp: failedAt })
            return false
          }
        }, (node) => {
          const snap = this.store.get(id)
          const err = snap?.nodeStates[node.id]?.error ?? ""
          return isConcurrencyLimitError(err)
        }, parallelLimit, async (node) => {
          await this.updateRecord(id, (draft) => {
            delete draft.nodeResults[node.id]
            draft.failedNodeIds = draft.failedNodeIds.filter((value) => value !== node.id)
            draft.nodeStates[node.id] = { id: node.id, status: "waiting", startedAt: null, finishedAt: null }
            if (!draft.failedNodeIds.length) draft.error = null
          })
        })
        if (humanPaused) return
        const pausedRecord = this.store.get(id)
        if (pausedRecord?.status === "paused" && pausedRecord.error?.startsWith("needs-repair:")) return
        if (waveResults.some((success) => success === false)) {
          const snap = this.store.get(id)
          const hardFail = snap?.failedNodeIds.some((nid) => this.isHardFailureNode(snap.graph.nodes.find((n) => n.id === nid)))
          if (hardFail) {
            failed = true
            break
          }
        }
        record = this.store.get(id) ?? record
        if (this.gracefulStopRuns.has(id)) {
          const pauseReason = this.gracefulStopRuns.get(id) ?? "runtime-shutdown"
          const timestamp = new Date().toISOString()
          pauseActiveSegment(record, timestamp)
          record.status = "paused"
          record.error = pauseReason === "user-pause" ? "user-pause" : pauseReason
          record.finishedAt = timestamp
          record.currentNodeIds = []
          const saved = this.store.save(record)
          this.emit(saved, {
            type: "workflow_paused",
            runId: id,
            status: "paused",
            error: saved.error ?? undefined,
            timestamp,
          })
          this.gracefulStopRuns.delete(id)
          return
        }
      }

      record = this.store.get(id) ?? record
      if (this.cancelledRuns.has(id) || record.status === "cancelled") return
      if (record.status === "paused") return
      // Never finalize a run that has a paused node (human-gate / inquiry waiting on
      // the user). Without this a deferred/re-entrant resume that flipped status to
      // "running" but ran no node (the paused gate is ineligible for any wave batch)
      // would fall through and mark the run "failed" (hasFailures=false but
      // allCompleted=false). The run must stay paused until an explicit continue.
      if (Object.values(record.nodeStates).some((state) => state.status === "paused")) return

      const hasFailures = record.failedNodeIds.length > 0
      const allCompleted = record.graph.nodes.every((node) => record.nodeStates[node.id]?.status === "completed")
      const timestamp = new Date().toISOString()
      pauseActiveSegment(record, timestamp)
      record.status = hasFailures || !allCompleted ? "failed" : "completed"
      record.finishedAt = timestamp
      record.currentNodeIds = []
      record.error = hasFailures ? record.error ?? "workflow-failed" : null
      const saved = this.store.save(record)
      this.emit(saved, { type: hasFailures ? "workflow_failed" : "workflow_completed", runId: id, status: saved.status, error: saved.error ?? undefined, timestamp })
    } finally {
      this.abortControllers.delete(id)
      this.activeRuns.delete(id)
      const deferred = workflowExecutionQueue.takeDeferredRunResume(id)
      if (deferred) {
        workflowExecutionQueue.enqueue(() => this.executionBridge().executeRun(id, deferred.options, deferred.startAtNodeId))
      }
    }
  }

  private isHardFailureNode(node: WorkflowNode | undefined): boolean {
    if (!node) return true
    const meta = node.metadata as WorkflowNodeContextMeta | undefined
    const archetype = meta?.archetype
    return archetype === "planner" || archetype === "merger" || archetype === "finalizer" || archetype === "media" || archetype === "gate"
  }

  private async runNode(
    record: WorkflowRunRecord,
    node: WorkflowNode,
    config: AgentNodeConfig,
    upstreamOutput: AgentNodeOutput | undefined,
    upstreamSession: SessionState | undefined,
    bypassCache: boolean,
    nodeResults: Map<string, AgentNodeOutput>,
    nodeSessions: Map<string, SessionState>,
    sharedSessionIds: Map<string, string>,
    signal: AbortSignal,
    outputCtx: WorkflowOutputContext,
    blackboard: Blackboard,
  ): Promise<boolean | "human-pause" | "needs-repair"> {
    const runId = record.id
    const startedAt = new Date().toISOString()
    const nodeStartMs = Date.now()
    preparePlannerInquiryNodeRun(outputCtx.workspaceDir, runId, node)
    const action = nodeAction(node, config.contextMode)
    if (action.kind === "human-gate") {
      const missing = missingGateArtifacts(outputCtx.workspaceDir, node)
      if (missing.length) {
        const pausedAt = new Date().toISOString()
        const error = `needs-repair: ${node.id} missing ${missing.join(", ")}`
        await this.updateRecord(runId, (draft) => {
          this.freezeRunTimer(draft, pausedAt)
          draft.status = "paused"
          draft.error = error
          draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "paused", startedAt: pausedAt, finishedAt: null, error }
          if (!draft.currentNodeIds.includes(node.id)) draft.currentNodeIds.push(node.id)
        })
        await this.emitLocked(runId, { type: "node_paused", runId, nodeId: node.id, status: "paused", timestamp: pausedAt })
        await this.emitLocked(runId, { type: "workflow_paused", runId, nodeId: node.id, status: "paused", error, timestamp: pausedAt })
        return "needs-repair"
      }
      const pausedAt = new Date().toISOString()
      await this.updateRecord(runId, (draft) => {
        this.freezeRunTimer(draft, pausedAt)
        draft.status = "paused"
        draft.error = "human-review"
        draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "paused", startedAt: pausedAt, finishedAt: null, error: undefined }
        if (!draft.currentNodeIds.includes(node.id)) draft.currentNodeIds.push(node.id)
      })
      await this.emitLocked(runId, { type: "node_paused", runId, nodeId: node.id, status: "paused", timestamp: pausedAt })
      await this.emitLocked(runId, { type: "workflow_paused", runId, nodeId: node.id, status: "paused", error: "human-review", timestamp: pausedAt })
      return "human-pause"
    }

    if (action.kind === "inquiry") {
      const pausedAt = new Date().toISOString()
      await this.updateRecord(runId, (draft) => {
        this.freezeRunTimer(draft, pausedAt)
        draft.status = "paused"
        draft.error = "inquiry-pending"
        draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "paused", startedAt: pausedAt, finishedAt: null, error: undefined }
        if (!draft.currentNodeIds.includes(node.id)) draft.currentNodeIds.push(node.id)
      })
      await this.emitLocked(runId, { type: "node_paused", runId, nodeId: node.id, status: "paused", timestamp: pausedAt })
      await this.emitLocked(runId, { type: "workflow_paused", runId, nodeId: node.id, status: "paused", error: "inquiry-pending", timestamp: pausedAt })
      return "human-pause"
    }

    await this.updateRecord(runId, (draft) => {
      draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "running", startedAt, finishedAt: null, error: undefined }
      if (!draft.currentNodeIds.includes(node.id)) draft.currentNodeIds.push(node.id)
    })
    await this.emitLocked(runId, { type: "node_started", runId, nodeId: node.id, status: "running", timestamp: startedAt })
    let actualSession: SessionState | undefined
    const maxRetries = 3
    let lastError: string | undefined
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(3000 * Math.pow(3, attempt - 1), 30000) // 3s, 9s, max 30s
        console.warn(`[runner] retry ${attempt}/${maxRetries} for node "${node.id}" after ${delay}ms: ${lastError}`)
        await this.updateRecord(runId, (draft) => {
          draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "running", startedAt: new Date().toISOString(), error: `retry ${attempt}/${maxRetries}` }
          if (!draft.currentNodeIds.includes(node.id)) draft.currentNodeIds.push(node.id)
        })
        await sleep(delay)
      }
      try {
        if ((config.modality ?? "text") !== "text" && action.kind !== "llm-api") {
          throw new Error(`Node "${node.id}" uses ${config.modality} modality; non-text nodes must run through an LLM API template, not CLI.`)
        }
        const source = action.kind === "llm-api"
          ? runLlmApiNode(this.runtime, record, node, action, config, upstreamOutput, upstreamSession, signal, outputCtx)
          : this.runtime.runNodeWithSession(config, upstreamOutput, upstreamSession, bypassCache, signal)

        for await (const item of source) {
          if (this.cancelledRuns.has(runId) && !this.gracefulStopRuns.has(runId)) {
            const cancelledAt = new Date().toISOString()
            await this.updateRecord(runId, (draft) => {
              draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "cancelled", finishedAt: cancelledAt }
              draft.currentNodeIds = draft.currentNodeIds.filter((value) => value !== node.id)
            })
            await this.emitLocked(runId, { type: "node_cancelled", runId, nodeId: node.id, status: "cancelled", timestamp: cancelledAt })
            return false
          }
          if (this.interruptRuns.has(runId)) {
            const interruptedAt = new Date().toISOString()
            await this.updateRecord(runId, (draft) => {
              draft.nodeStates[node.id] = {
                id: node.id,
                status: "waiting",
                startedAt: null,
                finishedAt: null,
                error: undefined,
                sessionId: draft.nodeStates[node.id]?.sessionId,
              }
              draft.currentNodeIds = draft.currentNodeIds.filter((value) => value !== node.id)
            })
            await this.emitLocked(runId, { type: "node_cancelled", runId, nodeId: node.id, status: "waiting", timestamp: interruptedAt })
            return false
          }
          actualSession = item.session ?? actualSession
          if (item.event.type === "session") {
            const sessionEvent = item.event
            await this.updateRecord(runId, (draft) => {
              draft.latestEvent = sessionEvent
              this.events.append(runId, sessionEvent)
              draft.nodeSessions[node.id] = sessionEvent.sessionId
              draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), sessionId: sessionEvent.sessionId }
            })
          } else if (item.event.type === "complete") {
            const persisted = persistNodeMarkdown(outputCtx, node, item.event.result.text)
            const cleanedText = stripForHistory(item.event.result.text)
            saveRawOutput(outputCtx.workspaceDir, node.id, cleanedText)
            const postComplete = handlePostNodeComplete({
              workspaceDir: outputCtx.workspaceDir,
              node,
              graph: record.graph,
              blackboard,
              nodeStartMs,
              cleanedText,
              runId,
            })
            if (postComplete.repairMsg) {
              const pausedAt = new Date().toISOString()
              await this.updateRecord(runId, (draft) => {
                this.freezeRunTimer(draft, pausedAt)
                draft.status = "paused"
                draft.error = postComplete.repairMsg!
                draft.nodeStates[node.id] = {
                  ...this.getNodeState(draft, node.id),
                  status: "paused",
                  finishedAt: pausedAt,
                  error: postComplete.repairMsg!,
                }
                draft.currentNodeIds = [node.id]
              })
              await this.emitLocked(runId, { type: "node_paused", runId, nodeId: node.id, status: "paused", timestamp: pausedAt })
              await this.emitLocked(runId, { type: "workflow_paused", runId, nodeId: node.id, status: "paused", error: postComplete.repairMsg!, timestamp: pausedAt })
              return "needs-repair"
            }
            if (postComplete.inquiryPause) {
              const pausedAt = new Date().toISOString()
              const inquiryMetadata = postComplete.inquiryQuestionsText
                ? {
                    inquiryQuestionsText: postComplete.inquiryQuestionsText,
                    inquiryQuestionsFile: postComplete.inquiryQuestionsFile,
                    plannerInquiryPhase: "questions",
                  }
                : { plannerInquiryPhase: "questions" }
              let result = {
                ...item.event.result,
                text: cleanedText,
                artifacts: [...(item.event.result.artifacts ?? []), persisted.artifact],
                metadata: {
                  ...(item.event.result.metadata ?? {}),
                  ...inquiryMetadata,
                },
              }
              nodeResults.set(node.id, result)
              await this.updateRecord(runId, (draft) => {
                this.freezeRunTimer(draft, pausedAt)
                draft.status = "paused"
                draft.error = "inquiry-pending"
                draft.nodeResults[node.id] = result
                draft.nodeStates[node.id] = {
                  ...this.getNodeState(draft, node.id),
                  status: "paused",
                  startedAt: draft.nodeStates[node.id]?.startedAt ?? pausedAt,
                  finishedAt: null,
                  error: undefined,
                }
                if (!draft.currentNodeIds.includes(node.id)) draft.currentNodeIds.push(node.id)
              })
              await this.emitLocked(runId, { type: "node_paused", runId, nodeId: node.id, status: "paused", timestamp: pausedAt })
              await this.emitLocked(runId, { type: "workflow_paused", runId, nodeId: node.id, status: "paused", error: "inquiry-pending", timestamp: pausedAt })
              return "human-pause"
            }
            if (postComplete.warnings.length) {
              console.warn(`[runner] post-complete ${node.id}:`, postComplete.warnings.join("; "))
            }
            if (readNodeArchetype(node) === "planner") {
              const arch = resolveWorkspaceFile(outputCtx.workspaceDir, "journal-architecture.md", blackboard)
              const pack = readWorkspaceFile(outputCtx.workspaceDir, arch)
              if (pack) {
                createSessionCheckpoint(config.sessionKey ?? "planner", pack, arch.path)
              }
            }
            let result = {
              ...item.event.result,
              text: cleanedText,
              artifacts: [...(item.event.result.artifacts ?? []), persisted.artifact],
            }
            if (config.provider === "opencode") {
              const snapshot = this.store.get(runId)
              const sessionIds = [
                snapshot?.nodeSessions[node.id],
                item.event.result.sessionId,
                actualSession?.id,
              ].filter((id): id is string => Boolean(id))
              const usage = await summarizeUsageForSessionIds(sessionIds)
              if (usage) {
                result = { ...result, usage: { ...usage, source: "run-results" as const } }
              }
            }
            nodeResults.set(node.id, result)
            await this.updateRecord(runId, (draft) => {
              draft.latestEvent = item.event
              this.events.append(runId, item.event)
              draft.nodeResults[node.id] = result
              draft.history.nodeOutputs = { ...(draft.history.nodeOutputs ?? {}), [node.id]: cleanedText }
              draft.history.artifacts = [
                ...(draft.history.artifacts ?? []).filter((a) => a.nodeId !== node.id),
                persisted.ref,
                ...artifactRefsFromOutput(outputCtx.workspaceKey, node.id, result),
              ]
              draft.history.usage = summarizeUsageFromResults(draft.nodeResults)
              if (node.id === "final-review" || node.id === "final-output") {
                const meta = node.metadata as { readRunFiles?: string[] } | undefined
                const chapterFiles = meta?.readRunFiles?.filter((name) => name.startsWith("chapter-")) ?? [
                  "chapter-1.md", "chapter-2.md", "chapter-3.md", "chapter-4.md",
                ]
                const merged = buildFinalNovelFromChapters(outputCtx, chapterFiles)
                draft.history.finalOutput = merged.body
                draft.history.artifacts = [
                  ...(draft.history.artifacts ?? []).filter((a) => a.nodeId !== "final-html"),
                  {
                    nodeId: node.id,
                    label: "final-novel.md",
                    kind: "markdown",
                    path: "final-novel.md",
                    href: workflowArtifactHref(outputCtx.workspaceKey, "final-novel.md"),
                  },
                  { nodeId: "final-html", label: "final-novel.html", kind: "other", path: "final-novel.html", href: workflowArtifactHref(outputCtx.workspaceKey, "final-novel.html") },
                  { nodeId: "final-pdf", label: "final-novel.pdf", kind: "pdf", path: "final-novel.pdf", href: workflowArtifactHref(outputCtx.workspaceKey, "final-novel.pdf") },
                ]
              } else {
                draft.history.finalOutput = cleanedText
              }
            })
          } else if (item.event.type === "cancelled") {
            const cancelledAt = new Date().toISOString()
            await this.updateRecord(runId, (draft) => {
              draft.latestEvent = item.event
              this.events.append(runId, item.event)
              draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "cancelled", finishedAt: cancelledAt }
              draft.currentNodeIds = draft.currentNodeIds.filter((value) => value !== node.id)
            })
            await this.emitLocked(runId, { type: "node_cancelled", runId, nodeId: node.id, status: "cancelled", timestamp: cancelledAt })
            return false
          } else if (item.event.type === "error") {
            throw new Error(item.event.error)
          } else {
            const streamEvent =
              item.event.type === "stdout"
              || item.event.type === "stderr"
              || item.event.type === "progress"
              || item.event.type === "session"
                ? { ...item.event, nodeId: node.id }
                : item.event
            await this.updateRecord(runId, (draft) => {
              draft.latestEvent = streamEvent
              this.events.append(runId, streamEvent)
            })
          }
        }

        // Success 鈥?save session and mark completed
        if (actualSession) {
          nodeSessions.set(node.id, actualSession)
          if (config.sessionPolicy === "shared" && config.sessionKey) {
            sharedSessionIds.set(config.sessionKey, actualSession.id)
          }
          await this.updateRecord(runId, (draft) => {
            draft.nodeSessions[node.id] = actualSession!.id
            draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), sessionId: actualSession!.id }
            if (config.sessionPolicy === "shared" && config.sessionKey) {
              draft.sessionGroups[config.sessionKey] = actualSession!.id
            }
          })
        }

        const finishedAt2 = new Date().toISOString()
        await this.updateRecord(runId, (draft) => {
          draft.nodeStates[node.id] = {
            ...this.getNodeState(draft, node.id),
            status: "completed",
            finishedAt: finishedAt2,
          }
          draft.currentNodeIds = draft.currentNodeIds.filter((value) => value !== node.id)
          if (!draft.completedNodeIds.includes(node.id)) draft.completedNodeIds.push(node.id)
        })
        await this.emitLocked(runId, { type: "node_completed", runId, nodeId: node.id, status: "completed", timestamp: finishedAt2 })
        return true
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        lastError = error
        // Retry on transient failures: rate limits, upstream errors, process spawn failures
        const isTransient = /(429|503|rate.?limit|too many requests|concurrency limit|upstream request failed|all accounts busy|upstream service|temporarily unavailable|process failed to start|spawn\s|EBUSY|EPIPE|ETIMEDOUT|ECONNRESET)/i.test(error)
        if (attempt < maxRetries && isTransient) {
          console.warn(`[runner] transient error on node "${node.id}" (attempt ${attempt + 1}): ${error}`)
          continue
        }
        // Non-retryable or out of retries 鈥?mark failed
        const finishedAtFailed = new Date().toISOString()
        await this.updateRecord(runId, (draft) => {
          draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "failed", finishedAt: finishedAtFailed, error }
          draft.currentNodeIds = draft.currentNodeIds.filter((value) => value !== node.id)
          if (!draft.failedNodeIds.includes(node.id)) draft.failedNodeIds.push(node.id)
          draft.error = error
        })
        await this.emitLocked(runId, { type: "node_failed", runId, nodeId: node.id, status: "failed", error, timestamp: finishedAtFailed })
        return false
      }
    }
    // Should not reach here, but if we do: mark as failed
    const finishedAtFinal = new Date().toISOString()
    await this.updateRecord(runId, (draft) => {
      draft.nodeStates[node.id] = { ...this.getNodeState(draft, node.id), status: "failed", finishedAt: finishedAtFinal, error: "max retries exceeded" }
      draft.currentNodeIds = draft.currentNodeIds.filter((value) => value !== node.id)
      if (!draft.failedNodeIds.includes(node.id)) draft.failedNodeIds.push(node.id)
      draft.error = "max retries exceeded"
    })
    await this.emitLocked(runId, { type: "node_failed", runId, nodeId: node.id, status: "failed", error: "max retries exceeded", timestamp: finishedAtFinal })
    return false
  }

  private selectedAgentModes(graph: WorkflowGraph): Record<string, string> {
    return Object.fromEntries(graph.nodes.map((node) => {
      const action = nodeAction(node, node.config.contextMode)
      return [node.id, action.binding.agentModeId ?? `${node.config.provider}:${node.config.mode}`]
    }))
  }

  private getNodeState(record: WorkflowRunRecord, nodeId: string) {
    return record.nodeStates[nodeId] ?? { id: nodeId, status: "waiting" as const, startedAt: null, finishedAt: null }
  }

  private async withRecordLock<T>(runId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.recordLocks.get(runId) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    this.recordLocks.set(runId, prev.then(() => gate))
    await prev
    try {
      return await task()
    } finally {
      release()
    }
  }

  private async updateRecord(runId: string, updater: (record: WorkflowRunRecord) => void): Promise<WorkflowRunRecord | null> {
    return this.withRecordLock(runId, async () => {
      const record = this.store.get(runId)
      if (!record) return null
      updater(record)
      return this.store.save(record)
    })
  }

  private async emitLocked(runId: string, event: WorkflowRunLifecycleEvent): Promise<void> {
    await this.withRecordLock(runId, async () => {
      const record = this.store.get(runId)
      if (!record) return
      record.latestEvent = event
      this.events.append(runId, event)
      this.store.save(record)
    })
  }

  private emit(record: WorkflowRunRecord, event: WorkflowRunLifecycleEvent): void {
    record.latestEvent = event
    this.events.append(record.id, event)
    this.store.save(record)
  }
}
