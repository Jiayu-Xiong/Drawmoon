/**
 * Workflow node execution runtime.
 *
 * Orchestrates the execution of a single workflow node:
 * 1. Provider detection
 * 2. Cache check
 * 3. Session context resolution
 * 4. Prompt preparation
 * 5. Process execution
 * 6. Event collection
 * 7. Result parsing
 * 8. Cache storage
 * 9. Trace recording
 */

import { AgentCache } from "./cache.js"
import { SessionManager } from "./session.js"
import { TraceStore } from "./trace.js"
import { customProvider, opencodeProvider, codexProvider, openaiProvider, kiroProvider, copilotProvider } from "./providers/index.js"
import type {
  AgentProviderAdapter,
  AgentNodeConfig,
  AgentNodeOutput,
  RunEvent,
  ProviderInfo,
  ProviderId,
  SessionState,
  WorkflowGraph,
  WorkflowRun,
} from "./schema/types.js"

interface NodeRunResult {
  event: RunEvent
  session?: SessionState
}

export interface RuntimeOptions {
  dataDir: string
  cacheMode?: "off" | "input-only" | "files-aware"
}

export class AgentRuntime {
  private providers: Map<ProviderId, AgentProviderAdapter>
  private cache: AgentCache
  private sessions: SessionManager
  private traces: TraceStore

  constructor(options: RuntimeOptions) {
    this.providers = new Map()
    this.cache = new AgentCache({ mode: options.cacheMode ?? "input-only", dataDir: options.dataDir })
    this.sessions = new SessionManager({ dataDir: options.dataDir })
    this.traces = new TraceStore({ dataDir: options.dataDir })

    // Register built-in providers
    this.registerProvider(customProvider)
    this.registerProvider(opencodeProvider)
    this.registerProvider(codexProvider)
    this.registerProvider(openaiProvider)
    this.registerProvider(kiroProvider)
    this.registerProvider(copilotProvider)
  }

  /**
   * Register a provider adapter.
   */
  registerProvider(adapter: AgentProviderAdapter): void {
    this.providers.set(adapter.id, adapter)
  }

  /**
   * Get a provider by ID.
   */
  getProvider(id: ProviderId): AgentProviderAdapter | undefined {
    return this.providers.get(id)
  }

  /**
   * Detect all registered providers.
   */
  async detectProviders(): Promise<ProviderInfo[]> {
    const results: ProviderInfo[] = []
    for (const adapter of this.providers.values()) {
      try {
        results.push(await adapter.detect())
      } catch {
        results.push({
          id: adapter.id,
          name: adapter.id,
          version: null,
          available: false,
          path: null,
          capabilities: adapter.capabilities,
        })
      }
    }
    return results
  }

  /**
   * Execute a single workflow node.
   */
  async *runNodeWithSession(
    config: AgentNodeConfig,
    upstreamOutput?: AgentNodeOutput,
    upstreamSession?: SessionState,
    bypassCache?: boolean,
    signal?: AbortSignal,
  ): AsyncIterable<NodeRunResult> {
    const runId = crypto.randomUUID()

    // Create trace
    const trace = this.traces.create(config)

    yield { event: { type: "start", runId, nodeId: config.provider, timestamp: new Date().toISOString() } }

    // Resolve provider
    const provider = this.providers.get(config.provider)
    if (!provider) {
      const error = `Provider '${config.provider}' is not registered`
      yield { event: { type: "error", runId, error, timestamp: new Date().toISOString() } }
      this.traces.setResult(trace.id, {
        text: error,
        traceId: trace.id,
        cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
        metadata: {
          startedAt: trace.startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          exitCode: -1,
          cancelled: false,
          timedOut: false,
          iterations: 0,
          provider: config.provider,
          providerVersion: null,
        },
      })
      return
    }

    // Resolve session context
    const { session, policy } = this.sessions.buildUpstreamContext(
      upstreamSession,
      upstreamOutput,
      config.contextMode,
      trace.id,
      config.sessionPolicy,
      config.sessionKey,
      config.sessionId,
    )
    const userMessage = { role: "user" as const, content: config.prompt, timestamp: new Date().toISOString() }
    this.sessions.addMessage(session.id, userMessage)
    session.messages.push(userMessage)

    yield {
      event: {
        type: "session",
        runId,
        sessionId: session.id,
        policy,
        sessionKey: config.sessionKey,
        timestamp: new Date().toISOString(),
      },
      session,
    }

    // Check cache
    const upstreamHash = upstreamOutput?.traceId
    const cacheResult = this.cache.check(config, upstreamHash, bypassCache)

    yield { event: { type: "cache", runId, info: cacheResult.info, timestamp: new Date().toISOString() }, session }

    if (cacheResult.result) {
      cacheResult.result.runtimeSessionId = session.id
      this.sessions.updateFromOutput(session, cacheResult.result)
      this.traces.setResult(trace.id, cacheResult.result)
      yield { event: { type: "complete", runId, result: cacheResult.result, timestamp: new Date().toISOString() }, session }
      return
    }

    // Prepare the run
    const abortController = new AbortController()
    const runSignal = signal ?? abortController.signal

    let prepared
    try {
      prepared = await provider.prepare({ config, session, cwd: config.cwd, signal: runSignal })
    } catch (err) {
      const error = `Failed to prepare run: ${err instanceof Error ? err.message : String(err)}`
      yield { event: { type: "error", runId, error, timestamp: new Date().toISOString() }, session }
      this.traces.setResult(trace.id, {
        text: error,
        traceId: trace.id,
        cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
        metadata: {
          startedAt: trace.startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          exitCode: -1,
          cancelled: false,
          timedOut: false,
          iterations: 0,
          provider: config.provider,
          providerVersion: null,
        },
      })
      return
    }

    // Execute and collect events
    const events: RunEvent[] = []

    try {
      for await (const event of provider.execute(prepared, runSignal)) {
        events.push(event)
        this.traces.appendEvent(trace.id, event)
        yield { event, session }
      }
    } catch (err) {
      if (runSignal.aborted) {
        const cancelledEvent: RunEvent = { type: "cancelled", runId, timestamp: new Date().toISOString() }
        events.push(cancelledEvent)
        this.traces.appendEvent(trace.id, cancelledEvent)
        yield { event: cancelledEvent, session }
      } else {
        const error = `Execution error: ${err instanceof Error ? err.message : String(err)}`
        const errorEvent: RunEvent = { type: "error", runId, error, timestamp: new Date().toISOString() }
        events.push(errorEvent)
        this.traces.appendEvent(trace.id, errorEvent)
        yield { event: errorEvent, session }
      }
    }

    if (runSignal.aborted || events.some((event) => event.type === "cancelled")) {
      return
    }

    // Parse result
    const output = await provider.parse(events)
    output.traceId = trace.id
    output.runtimeSessionId = session.id

    // Update session
    this.sessions.updateFromOutput(session, output)

    // Store in cache
    this.cache.store(config, output, upstreamHash)

    // Store trace result
    this.traces.setResult(trace.id, output)

    // Emit final complete event if not already emitted
    const hasComplete = events.some((e) => e.type === "complete")
    if (!hasComplete) {
      yield { event: { type: "complete", runId, result: output, timestamp: new Date().toISOString() }, session }
    }
  }

  async *runNode(
    config: AgentNodeConfig,
    upstreamOutput?: AgentNodeOutput,
    upstreamSession?: SessionState,
    bypassCache?: boolean,
  ): AsyncIterable<RunEvent> {
    for await (const item of this.runNodeWithSession(config, upstreamOutput, upstreamSession, bypassCache)) {
      yield item.event
    }
  }

  /**
   * Run a full workflow graph.
   */
  async *runWorkflow(graph: WorkflowGraph, bypassCache?: boolean): AsyncIterable<RunEvent> {
    const workflowId = crypto.randomUUID()
    const nodeResults = new Map<string, AgentNodeOutput>()
    const nodeSessions = new Map<string, SessionState>()
    const sharedSessionIds = new Map<string, string>(Object.entries(graph.sessionGroups ?? {}))

    // Topological sort: simple BFS from nodes with no incoming edges
    const inDegree = new Map<string, number>()
    for (const node of graph.nodes) {
      inDegree.set(node.id, 0)
    }
    for (const edge of graph.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
    }

    const queue = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    const visited = new Set<string>()

    while (queue.length > 0) {
      const node = queue.shift()!
      if (visited.has(node.id)) continue
      visited.add(node.id)

      // Find upstream edge
      const incomingEdge = graph.edges.find((e) => e.to === node.id)
      const upstreamNodeId = incomingEdge?.from
      const edgeContextMode = incomingEdge?.contextMode ?? node.config.contextMode

      // Use the edge context mode if available
      const config = { ...node.config, contextMode: edgeContextMode }
      if (config.sessionPolicy === "shared" && config.sessionKey && !config.sessionId) {
        config.sessionId = sharedSessionIds.get(config.sessionKey)
      }

      const upstreamOutput = upstreamNodeId ? nodeResults.get(upstreamNodeId) : undefined
      const upstreamSession = upstreamNodeId ? nodeSessions.get(upstreamNodeId) : undefined

      // Run the node
      let actualSession: SessionState | undefined
      for await (const item of this.runNodeWithSession(config, upstreamOutput, upstreamSession, bypassCache)) {
        const event = item.event
        if (item.session) actualSession = item.session
        // Capture result for downstream
        if (event.type === "complete") {
          nodeResults.set(node.id, event.result)
        }
        yield event
      }

      if (actualSession) {
        nodeSessions.set(node.id, actualSession)
        if (config.sessionPolicy === "shared" && config.sessionKey) {
          sharedSessionIds.set(config.sessionKey, actualSession.id)
        }
      }

      // Enqueue downstream nodes
      const outgoingEdges = graph.edges.filter((e) => e.from === node.id)
      for (const edge of outgoingEdges) {
        const target = graph.nodes.find((n) => n.id === edge.to)
        if (target && !visited.has(target.id)) {
          queue.push(target)
        }
      }
    }
  }

  /**
   * Cancel a running node (to be called via abort controller management).
   * In production, maintain a Map<runId, AbortController>.
   */
  cancel(): void {
    // Placeholder - in production, look up the AbortController for the run ID
  }

  // Accessors for cache, sessions, traces
  getCache(): AgentCache {
    return this.cache
  }

  getSessionManager(): SessionManager {
    return this.sessions
  }

  getTraceStore(): TraceStore {
    return this.traces
  }
}
