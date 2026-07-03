import type { SessionMessage, SessionState } from "../schema/types.js"

export interface SessionCheckpoint {
  id: string
  frozenMessages: SessionMessage[]
  contextPackPath?: string
}

const checkpoints = new Map<string, SessionCheckpoint>()

/** Freeze deterministic prefix (no timestamps) for provider prefix-cache reuse. */
export function createSessionCheckpoint(
  sessionKey: string,
  systemContent: string,
  contextPackPath?: string,
): SessionCheckpoint {
  const cp: SessionCheckpoint = {
    id: sessionKey,
    frozenMessages: [{ role: "system", content: systemContent.trim(), timestamp: "1970-01-01T00:00:00.000Z" }],
    contextPackPath,
  }
  checkpoints.set(sessionKey, cp)
  return cp
}

export function getSessionCheckpoint(sessionKey: string): SessionCheckpoint | undefined {
  return checkpoints.get(sessionKey)
}

export function forkFromCheckpoint(parent: SessionCheckpoint, traceId: string, userTail: string): SessionState {
  return {
    id: traceId,
    contextMode: "fork",
    messages: [
      ...parent.frozenMessages,
      { role: "user", content: userTail, timestamp: new Date().toISOString() },
    ],
    artifacts: [],
    parentId: parent.id,
    traceId,
    sessionKey: parent.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
