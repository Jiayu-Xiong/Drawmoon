import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadApiFileProviderBlocks, resolveApiFileKeyByEnv } from "./kuaipao-config.js"
import { getLlmWireAdapter } from "./adapters/registry.js"
import { unifiedChatCompletionStream } from "./client.js"
import type { LlmClientConfig } from "./unified/types.js"
import {
  createEngine,
  makeGraph,
  makeNode,
  nodeStatuses,
  startRun,
  type Engine,
} from "../workflow-runs/engine-harness.js"

// ── Mock LLM server ─────────────────────────────────────────────────────────

interface MockServer {
  url: string
  lastHeaders: Headers | null
  stop: () => void
}

function startMockLlm(): MockServer {
  const state: { lastHeaders: Headers | null } = { lastHeaders: null }
  const server = Bun.serve({
    port: 0,
    async fetch(req: Request) {
      state.lastHeaders = req.headers
      const body = (await req.json().catch(() => ({}))) as { model?: string }
      const model = body.model ?? ""
      if (model === "reject-401") {
        return new Response("invalid api key", { status: 401 })
      }
      if (model === "rate-429") {
        return new Response("rate limited", { status: 429 })
      }
      // OpenAI-compatible SSE stream.
      const sse =
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}\n\n` +
        `data: ${JSON.stringify({ usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\n` +
        `data: [DONE]\n\n`
      return new Response(sse, { headers: { "Content-Type": "text/event-stream" } })
    },
  })
  return {
    url: `http://127.0.0.1:${server.port}`,
    get lastHeaders() { return state.lastHeaders },
    stop: () => server.stop(true),
  }
}

// ── (4.1) API-file key onboarding ───────────────────────────────────────────

describe("LLM API key onboarding (api file)", () => {
  let tmpDir: string
  let prevAgentApiConfig: string | undefined
  let prevCustomKey: string | undefined
  const uniqueKey = `sk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-api-"))
    prevAgentApiConfig = process.env.AGENT_API_CONFIG
    prevCustomKey = process.env.CUSTOM_LLM_1_API_KEY
    delete process.env.CUSTOM_LLM_1_API_KEY
    const apiFile = join(tmpDir, "api")
    // A "custom" provider block: a key + a non-kuaipao/deepseek base url.
    writeFileSync(apiFile, `${uniqueKey}\nhttp://127.0.0.1:9/v1\nmy-model 128000\n`, "utf-8")
    process.env.AGENT_API_CONFIG = apiFile
  })
  afterEach(() => {
    if (prevAgentApiConfig === undefined) delete process.env.AGENT_API_CONFIG
    else process.env.AGENT_API_CONFIG = prevAgentApiConfig
    if (prevCustomKey === undefined) delete process.env.CUSTOM_LLM_1_API_KEY
    else process.env.CUSTOM_LLM_1_API_KEY = prevCustomKey
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("api file key is parsed into a provider block and resolvable by env name", () => {
    const blocks = loadApiFileProviderBlocks()
    const mine = blocks.find((b) => b.apiKey === uniqueKey)
    expect(mine).toBeDefined()
    expect(mine!.provider).toBe("custom")
    expect(mine!.apiKeyEnv).toBe("CUSTOM_LLM_1_API_KEY")
    // The backend resolves the actual secret at runtime from the env-var name.
    expect(resolveApiFileKeyByEnv(mine!.apiKeyEnv)).toBe(uniqueKey)
    // Model catalog parsed from the file.
    expect(mine!.models.some((m) => m.id === "my-model")).toBe(true)
  })

  test("unknown env var resolves to null (no silent secret)", () => {
    expect(resolveApiFileKeyByEnv("DEFINITELY_NOT_SET_ENV_XYZ")).toBeNull()
  })
})

// ── (4.3) Protocol / auth matrix ────────────────────────────────────────────

describe("LLM protocol adapters: url + auth header matrix", () => {
  const base: LlmClientConfig = { protocol: "openai-chat", endpoint: "https://example.com/v1", model: "m", apiKey: "sk-x" }

  test("openai-chat uses Bearer auth and /chat/completions", () => {
    const a = getLlmWireAdapter("openai-chat")
    expect(a.resolveUrl(base)).toBe("https://example.com/v1/chat/completions")
    expect(a.buildHeaders(base).Authorization).toBe("Bearer sk-x")
  })

  test("anthropic-messages uses x-api-key and /messages", () => {
    const cfg = { ...base, protocol: "anthropic-messages" as const, endpoint: "https://example.com" }
    const a = getLlmWireAdapter("anthropic-messages")
    expect(a.resolveUrl(cfg)).toBe("https://example.com/v1/messages")
    expect(a.buildHeaders(cfg)["x-api-key"]).toBe("sk-x")
    expect(a.buildHeaders(cfg).Authorization).toBeUndefined()
  })

  test("azure-openai-chat uses api-key header", () => {
    const cfg = { ...base, protocol: "azure-openai-chat" as const }
    const a = getLlmWireAdapter("azure-openai-chat")
    expect(a.buildHeaders(cfg)["api-key"]).toBe("sk-x")
  })

  test("deepseek-chat uses Bearer auth", () => {
    const a = getLlmWireAdapter("deepseek-chat")
    expect(a.buildHeaders({ ...base, protocol: "deepseek-chat" as const }).Authorization).toBe("Bearer sk-x")
  })

  test("unknown protocol falls back to custom-http", () => {
    const a = getLlmWireAdapter("totally-made-up")
    expect(a.protocol).toBe("custom-http")
  })
})

// ── (4.5) Unified client over a mock server ─────────────────────────────────

describe("unified LLM client (mock server)", () => {
  let mock: MockServer
  beforeEach(() => { mock = startMockLlm() })
  afterEach(() => { mock.stop() })

  async function collect(model: string) {
    const cfg: LlmClientConfig = { protocol: "openai-chat", endpoint: `${mock.url}/v1`, model, apiKey: "sk-valid" }
    const events: string[] = []
    let text = ""
    let error: string | undefined
    for await (const ev of unifiedChatCompletionStream(cfg, { model, messages: [{ role: "user", content: "hi" }], stream: true })) {
      events.push(ev.type)
      if (ev.type === "delta" && ev.delta) text += ev.delta
      if (ev.type === "done") text = ev.response?.text ?? text
      if (ev.type === "error") error = ev.error
    }
    return { events, text, error }
  }

  test("valid request streams deltas and completes", async () => {
    const r = await collect("good-model")
    expect(r.error).toBeUndefined()
    expect(r.text).toBe("Hello world")
    expect(r.events).toContain("done")
    expect(mock.lastHeaders?.get("authorization")).toBe("Bearer sk-valid")
  })

  test("401 surfaces an error event (caller must NOT retry)", async () => {
    const r = await collect("reject-401")
    expect(r.error).toContain("401")
    expect(r.events).toContain("error")
  })

  test("429 surfaces an error event (caller MAY retry as transient)", async () => {
    const r = await collect("rate-429")
    expect(r.error).toContain("429")
  })
})

// ── (4.4) llm-api node run through the engine over a mock server ─────────────

describe("llm-api workflow node (engine + mock server)", () => {
  let engine: Engine
  let mock: MockServer
  beforeEach(() => {
    engine = createEngine()
    mock = startMockLlm()
    process.env.TEST_LLM_KEY = "sk-valid"
  })
  afterEach(() => {
    mock.stop()
    delete process.env.TEST_LLM_KEY
    engine.cleanup()
  })

  function llmNode(id: string, model: string) {
    return makeNode(id, { kind: "success" }, {
      actionKind: "llm-api",
      actionMetadata: {
        modality: "text",
        llmApi: { id: "mock", endpoint: `${mock.url}/v1`, model, protocol: "openai-chat", apiKeyEnv: "TEST_LLM_KEY" },
      },
    })
  }

  test("valid llm-api node streams and completes", async () => {
    const g = makeGraph([llmNode("gen", "good-model")], [])
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    const rec = engine.store.get(id)!
    expect(nodeStatuses(engine, id).gen).toBe("completed")
    expect(rec.status).toBe("completed")
    expect(rec.nodeResults.gen?.text).toBe("Hello world")
  })

  test("server auth rejection fails the node fast (non-transient)", async () => {
    const start = Date.now()
    const g = makeGraph([llmNode("gen", "reject-401")], [])
    const id = startRun(engine, g)
    await engine.runner.runExecution(id)
    expect(Date.now() - start).toBeLessThan(2500)
    expect(nodeStatuses(engine, id).gen).toBe("failed")
    expect(engine.store.get(id)!.status).toBe("failed")
  })
})
