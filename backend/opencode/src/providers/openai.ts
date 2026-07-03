/**
 * OpenAI API provider adapter.
 *
 * Uses the unified LLM wire adapter layer (openai-chat / openai-responses / …).
 */

import { randomUUID } from "node:crypto"

import { unifiedChatCompletionStream } from "../llm-api/client.js"
import type { LlmClientConfig } from "../llm-api/unified/types.js"
import type {
  AgentProviderAdapter,
  AgentRunSpec,
  PreparedRun,
  RunEvent,
  AgentNodeOutput,
  CacheInfo,
  RunMetadata,
  ProviderInfo,
  ProviderCapabilities,
} from "../schema/types.js"

const CAPABILITIES: ProviderCapabilities = {
  nonInteractive: true,
  sessionResume: false,
  streaming: true,
  cancellation: true,
  fileOps: false,
  fork: false,
  maxIterations: 1,
  contextModes: ["fresh", "inherit", "summary"],
  inputModalities: {
    filesByPath: false,
    images: true,
    pdf: false,
    attachmentChannel: "base64",
  },
  metadata: {},
}

const OPENAI_API_BASE = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1"
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o"

export const openaiProvider: AgentProviderAdapter = {
  id: "openai",
  capabilities: CAPABILITIES,

  async detect(): Promise<ProviderInfo> {
    const apiKey = process.env.OPENAI_API_KEY
    const available = Boolean(apiKey && apiKey.length > 8)
    return {
      id: "openai",
      name: "OpenAI API",
      version: null,
      available,
      path: available ? `${OPENAI_API_BASE}` : null,
      capabilities: CAPABILITIES,
    }
  },

  async prepare(input: AgentRunSpec): Promise<PreparedRun> {
    const apiKey = process.env.OPENAI_API_KEY ?? ""
    const model = input.config.model ?? DEFAULT_MODEL

    const systemMessages: Array<{ role: string; content: string }> = []
    if (input.session?.summary) {
      systemMessages.push({ role: "system", content: `Previous session summary:\n${input.session.summary}` })
    }

    return {
      command: "openai",
      args: [],
      env: {
        _OPENAI_API_KEY: apiKey,
        _OPENAI_MODEL: model,
        _OPENAI_MESSAGES: JSON.stringify([...systemMessages, { role: "user", content: input.config.prompt }]),
        _OPENAI_API_BASE: OPENAI_API_BASE,
        _OPENAI_PROTOCOL: "openai-chat",
      },
      cwd: input.config.cwd,
      timeoutMs: input.config.timeoutMs ?? 120000,
    }
  },

  async *execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent> {
    const runId = randomUUID()
    const apiKey = (run.env._OPENAI_API_KEY ?? "") as string
    const model = (run.env._OPENAI_MODEL ?? DEFAULT_MODEL) as string
    const apiBase = (run.env._OPENAI_API_BASE ?? OPENAI_API_BASE) as string
    const protocol: LlmClientConfig["protocol"] = run.env._OPENAI_PROTOCOL === "openai-responses"
      ? "openai-responses"
      : "openai-chat"
    let messages: Array<{ role: string; content: string }> = []
    try { messages = JSON.parse(run.env._OPENAI_MESSAGES ?? "[]") } catch { return }

    yield { type: "start", runId, nodeId: "openai", timestamp: new Date().toISOString() }

    let fullContent = ""
    try {
      for await (const event of unifiedChatCompletionStream(
        {
          protocol,
          endpoint: apiBase,
          model,
          apiKey,
          timeoutMs: run.timeoutMs,
        },
        {
          model,
          messages: messages.map((message) => ({
            role: message.role as "system" | "user" | "assistant",
            content: message.content,
          })),
          stream: true,
          maxOutputTokens: 4096,
          temperature: 0.7,
        },
        signal,
      )) {
        if (event.type === "delta" && event.delta) {
          fullContent += event.delta
          yield { type: "stdout", runId, data: event.delta, timestamp: new Date().toISOString() }
        } else if (event.type === "error") {
          yield { type: "error", runId, error: event.error ?? "Unknown error", timestamp: new Date().toISOString() }
          return
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        yield { type: "cancelled", runId, timestamp: new Date().toISOString() }
        return
      }
      yield { type: "error", runId, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }
      return
    }

    const finishedAt = new Date().toISOString()
    const cacheInfo: CacheInfo = { key: runId, hit: false, mode: "off", bypassed: false, createdAt: finishedAt }
    const meta: RunMetadata = {
      startedAt: finishedAt, finishedAt, durationMs: 0, exitCode: 0, cancelled: false, timedOut: false,
      iterations: 0, provider: "openai", providerVersion: null,
    }
    yield {
      type: "complete", runId,
      result: { text: fullContent, traceId: runId, cache: cacheInfo, metadata: meta },
      timestamp: finishedAt,
    }
  },

  async parse(events: RunEvent[]): Promise<AgentNodeOutput> {
    const full = events.filter((e) => e.type === "stdout").map((e) => e.data).join("")
    const err = events.filter((e) => e.type === "error").map((e) => "error" in e ? (e as { error?: string }).error : "").filter(Boolean).join("; ")
    const now = new Date().toISOString()
    return {
      text: full || (err ? `Error: ${err}` : ""),
      traceId: randomUUID(),
      cache: { key: "", hit: false, mode: "off", bypassed: false, createdAt: now },
      metadata: { startedAt: now, finishedAt: now, durationMs: 0, exitCode: err ? 1 : 0, cancelled: false, timedOut: false, iterations: 0, provider: "openai", providerVersion: null },
    }
  },
}
