/**
 * Deterministic engine test harness.
 *
 * Isolates the workflow control-flow engine from agent (LLM/CLI) behavior so
 * that any unexpected exit / non-execution / failed-retry is attributable to
 * the engine itself, never to a non-deterministic provider. A programmable stub
 * provider (registered under the "custom" provider id) drives node outcomes:
 * success / hard error / transient-then-success / provider-cancel / hang.
 *
 * This is intentionally NOT a *.test.ts file — it is shared support code.
 */

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { AgentRuntime } from "../runtime.js"
import { normalizeLegacyNodeConfig } from "../workflow-actions/index.js"
import type {
  AgentNodeOutput,
  AgentProviderAdapter,
  ProviderCapabilities,
  ProviderInfo,
  RunEvent,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from "../schema/types.js"
import type { WorkflowAction } from "../workflow-actions/types.js"
import { FileWorkflowRunEventLog } from "./events.js"
import { FileWorkflowRunStore } from "./store.js"
import { WorkflowRunRunner } from "./runner.js"
import { workflowExecutionQueue } from "./execution-queue.js"

// ── Stub directive model ──────────────────────────────────────────────────

export type StubDirective =
  | { kind: "success"; text?: string; hook?: string }
  | { kind: "fail"; error?: string; hook?: string }
  | { kind: "transient"; error: string; failTimes: number; key: string; hook?: string }
  | { kind: "cancelled"; hook?: string }
  | { kind: "hang"; hook?: string }

const DIRECTIVE_OPEN = "__STUB__"
const DIRECTIVE_CLOSE = "__ENDSTUB__"
// The runner appends archetype/delivery rules to the prompt, so the directive
// must be extractable even when surrounded by other text.
const DIRECTIVE_RE = /__STUB__([\s\S]*?)__ENDSTUB__/

export function encodeDirective(directive: StubDirective): string {
  return `${DIRECTIVE_OPEN}${JSON.stringify(directive)}${DIRECTIVE_CLOSE}`
}

function decodeDirective(prompt: string | undefined): StubDirective {
  if (!prompt) return { kind: "success" }
  const match = prompt.match(DIRECTIVE_RE)
  if (!match) return { kind: "success" }
  try {
    return JSON.parse(match[1]!) as StubDirective
  } catch {
    return { kind: "success" }
  }
}

/** Named hooks invoked synchronously when a node begins executing. Tests use
 * these to deterministically inject pause/cancel/interrupt mid-run. */
export const stubHooks = new Map<string, () => void | Promise<void>>()

/** Cross-attempt failure counters for transient directives (keyed per test). */
const transientCounters = new Map<string, number>()

export function resetStubState(): void {
  stubHooks.clear()
  transientCounters.clear()
}

const CAPABILITIES: ProviderCapabilities = {
  nonInteractive: true,
  sessionResume: false,
  streaming: true,
  cancellation: true,
  fileOps: false,
  fork: false,
  maxIterations: 1,
  contextModes: ["fresh", "summary", "artifacts"],
  inputModalities: { filesByPath: false, images: false, pdf: false, attachmentChannel: "none" },
  metadata: {},
}

function makeOutput(text: string, traceId: string): AgentNodeOutput {
  const now = new Date().toISOString()
  return {
    text,
    summary: text.slice(0, 200),
    traceId,
    cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
    metadata: {
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      exitCode: 0,
      cancelled: false,
      timedOut: false,
      iterations: 1,
      provider: "custom",
      providerVersion: null,
    },
  }
}

/** Programmable provider registered under "custom". */
export const stubProvider: AgentProviderAdapter = {
  id: "custom",
  capabilities: CAPABILITIES,
  async detect(): Promise<ProviderInfo> {
    return { id: "custom", name: "Stub", version: "test", available: true, path: "stub", capabilities: CAPABILITIES }
  },
  async prepare(input) {
    const directive = decodeDirective(input.config.prompt)
    return {
      command: "stub",
      args: [],
      env: { STUB_DIRECTIVE: JSON.stringify(directive) },
      cwd: input.cwd,
      timeoutMs: input.config.timeoutMs ?? 300_000,
    }
  },
  async *execute(run, signal): AsyncIterable<RunEvent> {
    const runId = crypto.randomUUID()
    const ts = () => new Date().toISOString()
    yield { type: "start", runId, nodeId: "stub", timestamp: ts() }
    const directive = JSON.parse(run.env.STUB_DIRECTIVE || '{"kind":"success"}') as StubDirective
    if (directive.hook) {
      const hook = stubHooks.get(directive.hook)
      if (hook) await hook()
    }

    if (directive.kind === "hang") {
      yield { type: "stdout", runId, data: "working", timestamp: ts() }
      await new Promise<void>((resolve) => {
        if (signal?.aborted) return resolve()
        signal?.addEventListener("abort", () => resolve(), { once: true })
      })
      yield { type: "cancelled", runId, timestamp: ts() }
      return
    }
    if (directive.kind === "cancelled") {
      yield { type: "cancelled", runId, timestamp: ts() }
      return
    }
    if (directive.kind === "fail") {
      yield { type: "error", runId, error: directive.error ?? "stub failure", timestamp: ts() }
      return
    }
    if (directive.kind === "transient") {
      const remaining = transientCounters.get(directive.key) ?? directive.failTimes
      if (remaining > 0) {
        transientCounters.set(directive.key, remaining - 1)
        yield { type: "error", runId, error: directive.error, timestamp: ts() }
        return
      }
    }
    const text = (directive as { text?: string }).text ?? "ok"
    yield { type: "stdout", runId, data: text, timestamp: ts() }
    yield { type: "complete", runId, result: makeOutput(text, runId), timestamp: ts() }
  },
  async parse(events): Promise<AgentNodeOutput> {
    const text = events
      .filter((e): e is Extract<RunEvent, { type: "stdout" }> => e.type === "stdout")
      .map((e) => e.data)
      .join("")
    return makeOutput(text, crypto.randomUUID())
  },
}

// ── Graph builders ─────────────────────────────────────────────────────────

export interface MakeNodeOptions {
  archetype?: string
  actionKind?: WorkflowAction["kind"] | "human-gate" | "inquiry" | "condition" | "llm-api"
  metadata?: Record<string, unknown>
  /** Merged into node.action.metadata (used by llm-api nodes for the llmApi binding). */
  actionMetadata?: Record<string, unknown>
}

export function makeNode(id: string, directive: StubDirective, opts: MakeNodeOptions = {}): WorkflowNode {
  const config = {
    provider: "custom" as const,
    mode: "build" as const,
    cwd: ".",
    prompt: encodeDirective(directive),
    contextMode: "fresh" as const,
  }
  const node: WorkflowNode = {
    id,
    label: id,
    config,
    metadata: { ...(opts.archetype ? { archetype: opts.archetype } : {}), ...(opts.metadata ?? {}) },
  }
  if (opts.actionKind) {
    const base = normalizeLegacyNodeConfig({ ...config }, { id, label: id })
    node.action = {
      ...base,
      kind: opts.actionKind,
      ...(opts.actionMetadata ? { metadata: { ...(base as { metadata?: unknown }).metadata as object, ...opts.actionMetadata } } : {}),
    } as WorkflowAction
  }
  return node
}

export function edge(from: string, to: string, contextMode: WorkflowEdge["contextMode"] = "fresh"): WorkflowEdge {
  return { from, to, contextMode }
}

export function makeGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { nodes, edges }
}

// ── Engine builder ───────────────────────────────────────────────────────

export interface Engine {
  runner: WorkflowRunRunner
  store: FileWorkflowRunStore
  events: FileWorkflowRunEventLog
  runtime: AgentRuntime
  dataDir: string
  homeDir: string
  cleanup: () => void
}

/**
 * Build an isolated engine. Redirects `~/.drawmoon` to a temp HOME so workspace
 * seeding never touches the real profile, and stops the global execution queue
 * so retry/continue never spawn the real worker thread — tests drive execution
 * directly via `runner.runExecution`.
 */
export function createEngine(): Engine {
  const homeDir = mkdtempSync(join(tmpdir(), "wf-home-"))
  const dataDir = mkdtempSync(join(tmpdir(), "wf-data-"))

  const prevHome = process.env.HOME
  const prevUserProfile = process.env.USERPROFILE
  const prevPaperCwd = process.env.WORKFLOW_PAPER_CWD
  process.env.HOME = homeDir
  process.env.USERPROFILE = homeDir
  delete process.env.WORKFLOW_PAPER_CWD

  workflowExecutionQueue.requestGracefulStop()

  const runtime = new AgentRuntime({ dataDir, cacheMode: "off" })
  runtime.registerProvider(stubProvider)
  const store = new FileWorkflowRunStore({ dataDir })
  const events = new FileWorkflowRunEventLog({ dataDir })
  const runner = new WorkflowRunRunner({ runtime, store, events, dataDir, cacheMode: "off" })

  return {
    runner,
    store,
    events,
    runtime,
    dataDir,
    homeDir,
    cleanup() {
      // cancel/interrupt lazily spawn the execution worker via the bridge; reap it.
      try { void runner.shutdown("test-cleanup") } catch { /* ignore */ }
      workflowExecutionQueue.resetGracefulStop()
      resetStubState()
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
      if (prevUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = prevUserProfile
      if (prevPaperCwd !== undefined) process.env.WORKFLOW_PAPER_CWD = prevPaperCwd
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/**
 * Create a queued run from a graph (no auto-execution because the queue is
 * gracefully stopped) and return its id.
 */
export function startRun(engine: Engine, graph: WorkflowGraph, templateId = "engine-test"): string {
  const record = engine.runner.startWorkflowRun(graph, { templateId })
  return record.id
}

/** Convenience: statuses of every node keyed by id. */
export function nodeStatuses(engine: Engine, id: string): Record<string, string> {
  const record = engine.store.get(id)!
  return Object.fromEntries(Object.entries(record.nodeStates).map(([nid, s]) => [nid, s!.status]))
}

/** Convenience: lifecycle event types emitted for a run. */
export function eventTypes(engine: Engine, id: string): string[] {
  return engine.events.read(id).map((e) => (e as { type?: string }).type ?? "?")
}
