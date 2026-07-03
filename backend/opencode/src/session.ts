/**
 * Session manager for workflow agent nodes.
 *
 * Manages session state across workflow nodes, supporting:
 * - fresh: start a clean context
 * - inherit: continue upstream session
 * - fork: copy upstream context and branch
 * - summary: pass only the upstream summary
 * - artifacts: pass only explicit outputs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { ulid } from "ulid"

import type { SessionState, ContextMode, Artifact, SessionMessage, AgentNodeOutput, SessionPolicy } from "./schema/types.js"
import { forkFromCheckpoint, getSessionCheckpoint } from "./workflow-runs/context/checkpoints.js"

export interface SessionManagerOptions {
  dataDir: string
}

export class SessionManager {
  private dataDir: string
  private sharedSessions = new Map<string, string>()

  constructor(options: SessionManagerOptions) {
    this.dataDir = join(options.dataDir, "sessions")
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }
  }

  /**
   * Create a new session.
   */
  create(contextMode: ContextMode, traceId: string, parentId?: string): SessionState {
    const session: SessionState = {
      id: ulid(),
      contextMode,
      messages: [],
      artifacts: [],
      traceId,
      parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.save(session)
    return session
  }

  /**
   * Create or return a workflow-local shared session.
   */
  getOrCreateShared(sessionKey: string, traceId: string, existingSessionId?: string): SessionState {
    const knownId = existingSessionId ?? this.sharedSessions.get(sessionKey)
    if (knownId) {
      const existing = this.get(knownId)
      if (existing) {
        existing.contextMode = "inherit"
        existing.sessionKey = sessionKey
        existing.traceId = traceId
        existing.updatedAt = new Date().toISOString()
        this.sharedSessions.set(sessionKey, existing.id)
        this.save(existing)
        return existing
      }
    }

    const session = this.create("inherit", traceId)
    session.sessionKey = sessionKey
    this.sharedSessions.set(sessionKey, session.id)
    this.save(session)
    return session
  }

  /**
   * Fork an existing session.
   * Copies messages, summary, artifacts, and diff from the parent.
   */
  fork(parent: SessionState, traceId: string): SessionState {
    const session: SessionState = {
      id: ulid(),
      contextMode: "fork",
      messages: [...parent.messages],
      summary: parent.summary,
      artifacts: [...parent.artifacts],
      diff: parent.diff,
      parentId: parent.id,
      traceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.save(session)
    return session
  }

  /**
   * Create a session that inherits only the summary from upstream.
   */
  fromSummary(upstreamOutput: AgentNodeOutput, traceId: string): SessionState {
    const summary = upstreamOutput.summary?.trim()
    const session: SessionState = {
      id: ulid(),
      contextMode: "summary",
      messages: summary
        ? [
            {
              role: "user",
              content: `Upstream summary:\n${summary}`,
              timestamp: new Date().toISOString(),
            },
          ]
        : [
            {
              role: "user",
              content: "Upstream summary unavailable; read referenced workspace files with fs_read.",
              timestamp: new Date().toISOString(),
            },
          ],
      artifacts: upstreamOutput.artifacts ?? [],
      summary,
      diff: upstreamOutput.diff,
      traceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.save(session)
    return session
  }

  /**
   * Create a session that inherits only artifacts from upstream.
   */
  fromArtifacts(upstreamOutput: AgentNodeOutput, traceId: string): SessionState {
    const names = (upstreamOutput.artifacts ?? []).map((artifact) => artifact.name).join(", ")
    const session: SessionState = {
      id: ulid(),
      contextMode: "artifacts",
      messages: [
        {
          role: "system",
          content: names
            ? `Upstream workspace files: ${names}`
            : "No upstream workspace files were attached.",
          timestamp: new Date().toISOString(),
        },
      ],
      artifacts: upstreamOutput.artifacts ?? [],
      summary: upstreamOutput.summary,
      diff: upstreamOutput.diff,
      traceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.save(session)
    return session
  }

  /**
   * Build an upstream context for a child node based on the context mode.
   */
  buildUpstreamContext(
    parentSession: SessionState | undefined,
    parentOutput: AgentNodeOutput | undefined,
    contextMode: ContextMode,
    traceId: string,
    sessionPolicy?: SessionPolicy,
    sessionKey?: string,
    sessionId?: string,
  ): { session: SessionState; inherit: boolean; policy: SessionPolicy } {
    const explicitSession = sessionId ? this.get(sessionId) : null
    if (explicitSession) {
      explicitSession.traceId = traceId
      explicitSession.updatedAt = new Date().toISOString()
      this.save(explicitSession)
      return { session: explicitSession, inherit: true, policy: sessionPolicy ?? contextMode }
    }

    if (sessionPolicy === "shared") {
      const key = sessionKey || "default"
      return { session: this.getOrCreateShared(key, traceId), inherit: true, policy: "shared" }
    }

    if (sessionPolicy === "inherit" && parentSession) {
      const inherited: SessionState = {
        ...parentSession,
        id: ulid(),
        contextMode: "inherit",
        traceId,
        parentId: parentSession.id,
        updatedAt: new Date().toISOString(),
      }
      this.save(inherited)
      return { session: inherited, inherit: true, policy: "inherit" }
    }

    if (sessionPolicy === "fork" && parentSession) {
      return { session: this.fork(parentSession, traceId), inherit: true, policy: "fork" }
    }

    if (sessionPolicy === "fork" && sessionKey) {
      const checkpoint = getSessionCheckpoint(sessionKey)
      if (checkpoint) {
        const session = forkFromCheckpoint(checkpoint, ulid(), "")
        this.save(session)
        return { session, inherit: true, policy: "fork" }
      }
    }

    // New dialog: sessionPolicy=fresh starts a new KIRO thread; edge contextMode decides what to import.
    switch (contextMode) {
      case "summary":
        if (parentOutput) {
          return { session: this.fromSummary(parentOutput, traceId), inherit: true, policy: sessionPolicy ?? "fresh" }
        }
        break
      case "artifacts":
        if (parentOutput) {
          return { session: this.fromArtifacts(parentOutput, traceId), inherit: true, policy: sessionPolicy ?? "fresh" }
        }
        break
      case "inherit":
        if (parentSession) {
          const inherited: SessionState = {
            ...parentSession,
            id: ulid(),
            contextMode: "inherit",
            traceId,
            parentId: parentSession.id,
            updatedAt: new Date().toISOString(),
          }
          this.save(inherited)
          return { session: inherited, inherit: true, policy: sessionPolicy ?? "inherit" }
        }
        break
      case "fork":
        if (parentSession) {
          return { session: this.fork(parentSession, traceId), inherit: true, policy: sessionPolicy ?? "fork" }
        }
        break
    }

    return { session: this.create("fresh", traceId), inherit: false, policy: sessionPolicy ?? "fresh" }
  }

  /**
   * Add a message to a session.
   */
  addMessage(sessionId: string, message: SessionMessage): void {
    const session = this.get(sessionId)
    if (!session) return

    session.messages.push(message)
    session.updatedAt = new Date().toISOString()
    this.save(session)
  }

  /**
   * Update session with node output.
   */
  updateFromOutput(session: SessionState, output: AgentNodeOutput): void {
    if (output.sessionId) session.providerSessionId = output.sessionId
    if (output.summary) session.summary = output.summary
    session.messages.push({ role: "assistant", content: output.text, timestamp: new Date().toISOString() })
    if (output.diff) session.diff = output.diff
    if (output.artifacts?.length) {
      session.artifacts.push(...output.artifacts)
    }
    session.updatedAt = new Date().toISOString()
    this.save(session)
  }

  /**
   * Get a session by ID.
   */
  get(id: string): SessionState | null {
    const filePath = join(this.dataDir, `${id}.json`)
    try {
      const raw = readFileSync(filePath, "utf-8")
      return JSON.parse(raw) as SessionState
    } catch {
      return null
    }
  }

  /**
   * Save a session to disk.
   */
  save(session: SessionState): void {
    const filePath = join(this.dataDir, `${session.id}.json`)
    writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8")
  }

  /**
   * List all sessions.
   */
  list(): { id: string; contextMode: ContextMode; createdAt: string }[] {
    if (!existsSync(this.dataDir)) return []

    return readdirSync(this.dataDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const raw = readFileSync(join(this.dataDir, f), "utf-8")
          const s = JSON.parse(raw) as SessionState
          return { id: s.id, contextMode: s.contextMode, createdAt: s.createdAt }
        } catch {
          return { id: f.replace(/\.json$/, ""), contextMode: "fresh" as ContextMode, createdAt: "unknown" }
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
