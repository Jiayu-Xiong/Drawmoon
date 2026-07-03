/**
 * Local Agent Runtime HTTP/WebSocket server.
 *
 * Exposes a REST API for the workflow frontend to:
 * - Detect available providers
 * - Run workflow nodes
 * - Stream run events
 * - Inspect traces and cache
 * - Manage sessions
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { Hono } from "hono"
import { cors } from "hono/cors"
import { compress } from "hono/compress"
import { stream } from "hono/streaming"

import { AgentRuntime } from "./runtime.js"
import type { AgentNodeConfig, WorkflowGraph, CommandRunResult } from "./schema/types.js"
import { createWorkflowRunSystem } from "./workflow-runs/index.js"
import { WorkflowOutputRoute } from "./workflow-runs/workflow-output-route.js"
import { drawmoonRuntimeDir } from "./drawmoon/paths.js"
import { registerDrawmoonRoutes } from "./drawmoon/routes.js"
import { listDrawmoonWorkflowTemplateMetas } from "./drawmoon/workflow-templates.js"
import { listTemplates, getTemplate } from "./workflow-templates/index.js"
import { codexProvider } from "./providers/codex.js"
import {
  bindCommands,
  getAllCommands,
  getCommands,
  runCommand,
  runCommandSync,
  registerBuiltinCommands,
} from "./command-registry.js"
import { getLocalCliInfoFast, refreshCliProvider, CLI_REFRESH_PROVIDERS, type CliRefreshProvider, type LocalCliInfo } from "./cli-info.js"
import { buildOpencodeDerivedAgentMode } from "./cli-probes/opencode-derived-mode.js"
import { previewOpencodeRuntimePayload, opencodeStrategySchemaOnly, type OpencodeConfigPreviewInput } from "./cli-probes/opencode-config-preview.js"
import { previewCliStrategy, type CliStrategyPreviewInput } from "./cli-probes/cli-strategy-preview.js"
import { unifiedChatCompletion } from "./llm-api/client.js"
import { buildCopilotKuaipaoBind, sanitizeCopilotBindResult } from "./llm-api/copilot-bind.js"
import { LLM_PROTOCOL_CATALOG } from "./llm-api/adapters/registry.js"
import { loadKuaipaoConfig } from "./llm-api/kuaipao-config.js"
import type { LlmClientConfig, UnifiedChatRequest } from "./llm-api/unified/types.js"

// ── Kuaipao Models Cache ──────────────────────────────────────────────
const KUAIPAO_CACHE_TTL = 300_000 // 5 min
let kuaipaoModelsCache: { data: unknown; at: number } | null = null
let copilotBindCache: { data: unknown; at: number } | null = null
let cliInfoCache: { data: LocalCliInfo; at: number } | null = null
let cliInfoRefreshing: CliRefreshProvider[] = []
let cliRefreshRunning = false
const cliProviderRefreshTimers = new Map<CliRefreshProvider, ReturnType<typeof setTimeout>>()

function toCliRefreshProvider(provider?: string): CliRefreshProvider | null {
  if (provider === "opencode") return "opencode"
  if (provider === "codex") return "codex"
  if (provider === "copilot") return "copilot"
  if (provider === "kiro") return "kiro"
  return null
}

async function refreshSingleCliProvider(provider: CliRefreshProvider): Promise<void> {
  if (!cliInfoCache) {
    cliInfoCache = { data: await getLocalCliInfoFast(), at: Date.now() }
  }
  if (!cliInfoRefreshing.includes(provider)) {
    cliInfoRefreshing = [...cliInfoRefreshing, provider]
  }
  try {
    cliInfoCache = {
      data: await refreshCliProvider(cliInfoCache.data, provider),
      at: Date.now(),
    }
  } finally {
    cliInfoRefreshing = cliInfoRefreshing.filter((item) => item !== provider)
  }
}

function scheduleCliInfoRefreshForProvider(provider?: string): void {
  const mapped = toCliRefreshProvider(provider)
  if (!mapped) return
  const existing = cliProviderRefreshTimers.get(mapped)
  if (existing) clearTimeout(existing)
  cliProviderRefreshTimers.set(mapped, setTimeout(() => {
    cliProviderRefreshTimers.delete(mapped)
    void refreshSingleCliProvider(mapped)
  }, 900))
}

function bindHasUsableModels(bind: unknown): boolean {
  const candidate = bind as { models?: unknown[]; templates?: Array<{ model?: unknown }> } | null
  if (!candidate) return false
  if (Array.isArray(candidate.models) && candidate.models.length > 0) return true
  return Array.isArray(candidate.templates) && candidate.templates.some((template) => typeof template.model === "string" && template.model.trim())
}

function loadKuaipaoModelsCache(dataDir: string): unknown | null {
  const cachePath = join(dataDir, "kuaipao-models-cache.json")
  if (!existsSync(cachePath)) return null
  try {
    const raw = readFileSync(cachePath, "utf-8")
    const cached = JSON.parse(raw) as { data: unknown; at: number }
    if (Date.now() - cached.at < KUAIPAO_CACHE_TTL) return cached.data
  } catch { /* expired or corrupt */ }
  return null
}

function saveKuaipaoModelsCache(dataDir: string, data: unknown): void {
  const cachePath = join(dataDir, "kuaipao-models-cache.json")
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ data, at: Date.now() }), "utf-8")
  } catch { /* best-effort */ }
}

function loadCopilotBindCache(dataDir: string): unknown | null {
  const cachePath = join(dataDir, "copilot-llm-bind-cache.json")
  if (!existsSync(cachePath)) return null
  try {
    const raw = readFileSync(cachePath, "utf-8")
    const cached = JSON.parse(raw) as { data: unknown; at: number }
    if (Date.now() - cached.at < KUAIPAO_CACHE_TTL) return cached.data
  } catch { /* expired or corrupt */ }
  return null
}

function saveCopilotBindCache(dataDir: string, data: unknown): void {
  const cachePath = join(dataDir, "copilot-llm-bind-cache.json")
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ data, at: Date.now() }), "utf-8")
  } catch { /* best-effort */ }
}

declare const Bun: {
  serve(options: { hostname: string; port: number; fetch: (request: Request) => Response | Promise<Response>; idleTimeout?: number }): unknown
}

export interface ServerOptions {
  port?: number
  dataDir?: string
  cacheMode?: "off" | "input-only" | "files-aware"
}

export function createRuntimeServer(options: ServerOptions = {}) {
  const port = options.port ?? 3456
  const dataDir = options.dataDir ?? drawmoonRuntimeDir()
  const runtime = new AgentRuntime({
    dataDir,
    cacheMode: options.cacheMode ?? "input-only",
  })
  const workflowRuns = createWorkflowRunSystem({ dataDir, runtime, cacheMode: options.cacheMode, onRunStarted: scheduleCliInfoRefreshAfterWorkflow })
  const workflowOutputRoute = new WorkflowOutputRoute(dataDir, workflowRuns.store)
  let shutdownHandlersInstalled = false

  function refreshCliInfoSequential(): void {
    if (cliRefreshRunning) return
    cliRefreshRunning = true
    cliInfoRefreshing = [...CLI_REFRESH_PROVIDERS]
    void (async () => {
      try {
        if (!cliInfoCache) {
          cliInfoCache = { data: await getLocalCliInfoFast(), at: Date.now() }
        }
        for (const provider of CLI_REFRESH_PROVIDERS) {
          cliInfoCache = {
            data: await refreshCliProvider(cliInfoCache.data, provider),
            at: Date.now(),
          }
          cliInfoRefreshing = CLI_REFRESH_PROVIDERS.slice(CLI_REFRESH_PROVIDERS.indexOf(provider) + 1)
        }
      } finally {
        cliInfoRefreshing = []
        cliRefreshRunning = false
      }
    })()
  }

  function scheduleCliInfoRefresh(): void {
    refreshCliInfoSequential()
  }

  function scheduleCliInfoRefreshAfterWorkflow(runId: string): void {
    const unsubscribe = workflowRuns.events.subscribe(runId, (event) => {
      if (event.type === "node_started" && event.nodeId) {
        const record = workflowRuns.store.get(runId)
        const node = record?.graph.nodes.find((item) => item.id === event.nodeId)
        scheduleCliInfoRefreshForProvider(node?.config.provider)
        return
      }
      if (event.type !== "workflow_completed" && event.type !== "workflow_failed" && event.type !== "workflow_cancelled") return
      unsubscribe()
      scheduleCliInfoRefresh()
    })
  }

  const app = new Hono()

  // Register built-in provider commands
  registerBuiltinCommands()

  // CORS for frontend
  app.use("*", cors())
  app.use("*", compress())

  app.get("/workflow-output/*", (c) => workflowOutputRoute.handle(c))

  app.route("/", workflowRuns.routes.toApp())

  // ── Provider Endpoints ──────────────────────────────────────────────

  app.get("/providers", async (c) => {
    const providers = await runtime.detectProviders()
    return c.json({ providers })
  })

  // ── Workflow Template Endpoints ─────────────────────────────────────

  app.get("/templates", (c) => {
    return c.json({ templates: listTemplates() })
  })

  app.get("/templates/:id", (c) => {
    const entry = getTemplate(c.req.param("id"))
    if (!entry) return c.json({ error: "Template not found" }, 404)
    return c.json({ template: entry.info, graph: entry.graph })
  })

  // ── Codex Status (non-token-consuming) ──────────────────────────────

  app.get("/codex/status", async (c) => {
    try {
      const status = await codexProvider.getStatus()
      return c.json({ status })
    } catch (err) {
      return c.json({
        error: err instanceof Error ? err.message : String(err),
        status: null,
      }, 500)
    }
  })

  app.get("/cli/info", async (c) => {
    try {
      if (!cliInfoCache) {
        const info = await getLocalCliInfoFast()
        cliInfoCache = { data: info, at: Date.now() }
      }
      return c.json({ info: cliInfoCache.data, refreshing: [...cliInfoRefreshing], refreshActive: cliRefreshRunning })
    } catch (err) {
      return c.json({
        error: err instanceof Error ? err.message : String(err),
      }, 500)
    }
  })

  app.post("/cli/info/refresh", async (c) => {
    try {
      if (!cliInfoCache) {
        cliInfoCache = { data: await getLocalCliInfoFast(), at: Date.now() }
      }
      const body = await c.req.json().catch(() => ({})) as { provider?: string }
      const mapped = toCliRefreshProvider(body.provider)
      if (mapped) {
        void refreshSingleCliProvider(mapped)
        return c.json({ started: true, refreshing: [...cliInfoRefreshing], refreshActive: cliRefreshRunning || cliInfoRefreshing.length > 0 })
      }
      refreshCliInfoSequential()
      return c.json({ started: true, refreshing: [...cliInfoRefreshing], refreshActive: cliRefreshRunning })
    } catch (err) {
      return c.json({
        error: err instanceof Error ? err.message : String(err),
      }, 500)
    }
  })

  app.get("/llm/api-concurrency", async (c) => {
    const { loadApiConcurrencyConfig } = await import("./llm-api/api-concurrency.js")
    return c.json({ config: loadApiConcurrencyConfig() })
  })

  app.put("/llm/api-concurrency", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { limits?: Record<string, number> }
    const { saveApiConcurrencyConfig } = await import("./llm-api/api-concurrency.js")
    const config = saveApiConcurrencyConfig({ limits: body.limits ?? {} })
    return c.json({ config })
  })

  app.get("/llm/kuaipao-config", async (c) => {
    const config = loadKuaipaoConfig()
    const { resolveKuaipaoApiKey } = await import("./llm-api/kuaipao-config.js")
    return c.json({
      config: {
        configPath: config.configPath,
        apiKeyEnv: config.apiKeyEnv,
        openaiBaseUrl: config.openaiBaseUrl,
        anthropicBaseUrl: config.anthropicBaseUrl,
        chatCompletionsUrl: config.chatCompletionsUrl,
        modelsEndpoint: `${config.openaiBaseUrl.replace(/\/$/, "")}/models`,
        hasKeyFile: config.hasKeyFile,
        keyConfigured: Boolean(resolveKuaipaoApiKey(config)),
      },
    })
  })

  app.get("/llm/kuaipao-models", async (c) => {
    const refresh = c.req.query("refresh") === "true"
    if (!refresh) {
      const cached = kuaipaoModelsCache ?? loadKuaipaoModelsCache(dataDir)
      if (cached) return c.json({ result: cached })
    }
    const { fetchKuaipaoModels } = await import("./llm-api/kuaipao-models.js")
    const result = await fetchKuaipaoModels()
    kuaipaoModelsCache = { data: result, at: Date.now() }
    saveKuaipaoModelsCache(dataDir, result)
    return c.json({ result })
  })

  app.get("/llm/copilot-bind", async (c) => {
    const refresh = c.req.query("refresh") === "true"
    if (!refresh && copilotBindCache && Date.now() - copilotBindCache.at < KUAIPAO_CACHE_TTL && bindHasUsableModels(copilotBindCache.data)) {
      return c.json({ bind: sanitizeCopilotBindResult(copilotBindCache.data as import("./llm-api/copilot-bind.js").CopilotBindResult) })
    }
    if (!refresh) {
      const cached = loadCopilotBindCache(dataDir)
      if (cached && bindHasUsableModels(cached)) {
        const bind = sanitizeCopilotBindResult(cached as import("./llm-api/copilot-bind.js").CopilotBindResult)
        copilotBindCache = { data: bind, at: Date.now() }
        return c.json({ bind })
      }
      const fallback = await buildCopilotKuaipaoBind()
      const bind = {
        ...sanitizeCopilotBindResult(fallback),
        kuaipao: {
          ...fallback.kuaipao,
          modelsEndpoint: fallback.discovery?.endpoint ?? `${fallback.kuaipao.openaiBaseUrl.replace(/\/$/, "")}/models`,
          keyConfigured: Boolean(process.env[fallback.kuaipao.apiKeyEnv]),
        },
      }
      copilotBindCache = { data: bind, at: Date.now() }
      saveCopilotBindCache(dataDir, bind)
      return c.json({ bind })
    }
    const bind = await buildCopilotKuaipaoBind()
    const result = {
      bind: {
        ...bind,
        kuaipao: {
          ...bind.kuaipao,
          modelsEndpoint: bind.discovery?.endpoint ?? `${bind.kuaipao.openaiBaseUrl.replace(/\/$/, "")}/models`,
          keyConfigured: Boolean(process.env[bind.kuaipao.apiKeyEnv]),
        },
      },
    }
    copilotBindCache = { data: result.bind, at: Date.now() }
    saveCopilotBindCache(dataDir, result.bind)
    return c.json(result)
  })

  app.get("/cli/opencode-derived-mode", async (c) => {
    const mode = (c.req.query("mode") ?? "build") as "chat" | "plan" | "build" | "agent"
    try {
      const spec = await buildOpencodeDerivedAgentMode(mode)
      return c.json({ spec })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  app.post("/cli/opencode-config-preview", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
      const preview = previewOpencodeRuntimePayload({
        model: typeof body.model === "string" ? body.model : undefined,
        mode: typeof body.mode === "string" ? body.mode : undefined,
        systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
        userPromptBias: typeof body.userPromptBias === "string" ? body.userPromptBias : undefined,
        constraints: body.constraints as import("./schema/types.js").AgentNodeConfig["constraints"],
        workspaceDir: typeof body.workspaceDir === "string" ? body.workspaceDir : undefined,
        readRoots: Array.isArray(body.readRoots) ? body.readRoots.filter((v): v is string => typeof v === "string") : undefined,
        flatWriteOnly: body.flatWriteOnly === true,
        editableOverlayKeys: Array.isArray(body.editableOverlayKeys)
          ? body.editableOverlayKeys.filter((v): v is string => typeof v === "string")
          : undefined,
      })
      return c.json({ preview })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  app.get("/cli/opencode-strategy-schema", (c) => {
    return c.json({ schema: opencodeStrategySchemaOnly() })
  })

  app.post("/cli/strategy-preview", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
      const preview = await previewCliStrategy({
        provider: typeof body.provider === "string" ? body.provider : "opencode",
        cliTemplateId: typeof body.cliTemplateId === "string" ? body.cliTemplateId : undefined,
        mode: typeof body.mode === "string" ? body.mode : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
        systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
        userPromptBias: typeof body.userPromptBias === "string" ? body.userPromptBias : undefined,
        controlSurface: body.controlSurface === "cli-owned" || body.controlSurface === "customizable"
          ? body.controlSurface
          : undefined,
        constraints: body.constraints as import("./schema/types.js").AgentNodeConfig["constraints"],
        allowedTools: Array.isArray(body.allowedTools)
          ? body.allowedTools.filter((v): v is string => typeof v === "string")
          : undefined,
        editableOverlayKeys: Array.isArray(body.editableOverlayKeys)
          ? body.editableOverlayKeys.filter((v): v is string => typeof v === "string")
          : undefined,
        workspaceDir: typeof body.workspaceDir === "string" ? body.workspaceDir : undefined,
        readRoots: Array.isArray(body.readRoots) ? body.readRoots.filter((v): v is string => typeof v === "string") : undefined,
        flatWriteOnly: body.flatWriteOnly === true,
      } satisfies CliStrategyPreviewInput)
      return c.json({ preview })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  app.get("/llm/protocols", (c) => {
    return c.json({ protocols: LLM_PROTOCOL_CATALOG })
  })

  app.post("/llm/chat", async (c) => {
    try {
      const body = await c.req.json() as {
        config: LlmClientConfig
        request: UnifiedChatRequest
      }
      const result = await unifiedChatCompletion(body.config, body.request)
      return c.json({ result })
    } catch (err) {
      return c.json({
        error: err instanceof Error ? err.message : String(err),
      }, 500)
    }
  })

  // ── Provider Command Endpoints ─────────────────────────────────────

  /** List all bound commands (optionally filtered by provider) */
  app.get("/commands", (c) => {
    const providerId = c.req.query("provider")
    if (providerId) {
      return c.json({ commands: getCommands(providerId) })
    }
    return c.json({ commands: getAllCommands() })
  })

  /** Bind a new command to a provider (user-defined) */
  app.post("/commands/bind", async (c) => {
    const body = await c.req.json()
    const { providerId, command } = body as {
      providerId: string
      command: import("./schema/types.js").ProviderCommandBinding
    }
    bindCommands(providerId, [command])
    return c.json({ ok: true, providerId, commandId: command.id })
  })

  /** Run a bound command (streaming) */
  app.post("/commands/run", async (c) => {
    const body = await c.req.json()
    const { providerId, commandId, cwd } = body as {
      providerId: string
      commandId: string
      cwd?: string
    }

    return stream(c, async (stream) => {
      try {
        for await (const chunk of runCommand(providerId, commandId, cwd)) {
          stream.write(JSON.stringify(chunk) + "\n")
        }
      } catch (err) {
        stream.write(JSON.stringify({
          type: "error",
          data: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        }) + "\n")
      } finally {
        scheduleCliInfoRefresh()
      }
    })
  })

  /** Run a bound command (sync, returns full result) */
  app.post("/commands/run-sync", async (c) => {
    try {
      const body = await c.req.json()
      const { providerId, commandId, cwd } = body as {
        providerId: string
        commandId: string
        cwd?: string
      }
      const result: CommandRunResult = await runCommandSync(providerId, commandId, cwd)
      scheduleCliInfoRefresh()
      return c.json({ result })
    } catch (err) {
      return c.json({
        error: err instanceof Error ? err.message : String(err),
      }, 500)
    }
  })

  // ── Node Execution Endpoints ────────────────────────────────────────

  app.post("/nodes/run", async (c) => {
    const body = await c.req.json()
    const config = body.config as AgentNodeConfig
    const bypassCache = body.bypassCache === true

    return stream(c, async (stream) => {
      try {
        for await (const event of runtime.runNode(config, undefined, undefined, bypassCache)) {
          stream.write(JSON.stringify(event) + "\n")
        }
      } catch (err) {
        stream.write(
          JSON.stringify({
            type: "error",
            runId: "unknown",
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          }) + "\n",
        )
      } finally {
        scheduleCliInfoRefresh()
      }
    })
  })

  app.post("/workflow/run", async (c) => {
    const body = await c.req.json()
    const graph = body.graph as WorkflowGraph
    const bypassCache = body.bypassCache === true
    const budgetOverride = body.budgetOverride === true
    const budgetBlocked = body.budgetBlocked === true
    const run = workflowRuns.runner.startWorkflowRun(graph, {
      templateId: body.templateId,
      templateVersion: body.templateVersion,
      name: body.name,
      prompt: body.prompt,
      selectedAgentModes: body.selectedAgentModes,
      bypassCache,
      budgetOverride,
      budgetBlocked,
      budgetBlockReason: typeof body.budgetBlockReason === "string" ? body.budgetBlockReason : undefined,
    })

    return stream(c, async (stream) => {
      try {
        for (const event of workflowRuns.events.read(run.id)) {
          stream.write(JSON.stringify(event) + "\n")
          if (event.type === "workflow_completed" || event.type === "workflow_failed" || event.type === "workflow_cancelled") {
            scheduleCliInfoRefresh()
            return
          }
        }
        await new Promise<void>((resolve) => {
          const unsubscribe = workflowRuns.events.subscribe(run.id, (event) => {
            void stream.write(JSON.stringify(event) + "\n")
            if (event.type === "workflow_completed" || event.type === "workflow_failed" || event.type === "workflow_cancelled") {
              unsubscribe()
              scheduleCliInfoRefresh()
              resolve()
            }
          })
          stream.onAbort(() => {
            unsubscribe()
            resolve()
          })
        })
      } catch (err) {
        stream.write(
          JSON.stringify({
            type: "error",
            runId: "unknown",
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          }) + "\n",
        )
      }
    })
  })

  // ── Session Endpoints ───────────────────────────────────────────────

  app.get("/sessions", (c) => {
    const sessions = runtime.getSessionManager().list()
    return c.json({ sessions })
  })

  app.get("/sessions/:id", (c) => {
    const id = c.req.param("id")
    const session = runtime.getSessionManager().get(id)
    if (!session) return c.json({ error: "Session not found" }, 404)
    return c.json({ session })
  })

  // ── Trace Endpoints ─────────────────────────────────────────────────

  app.get("/traces", (c) => {
    const traces = runtime.getTraceStore().list()
    return c.json({ traces })
  })

  app.get("/traces/:id", (c) => {
    const id = c.req.param("id")
    const trace = runtime.getTraceStore().get(id)
    if (!trace) return c.json({ error: "Trace not found" }, 404)
    return c.json({ trace })
  })

  // ── Cache Endpoints ─────────────────────────────────────────────────

  app.get("/cache", (c) => {
    const entries = runtime.getCache().list()
    return c.json({ entries })
  })

  app.delete("/cache", (c) => {
    const count = runtime.getCache().clear()
    return c.json({ cleared: count })
  })

  registerDrawmoonRoutes(app)

  app.get("/bootstrap", async (c) => {
    try {
      if (!cliInfoCache) {
        cliInfoCache = { data: await getLocalCliInfoFast(), at: Date.now() }
      }
      const providers = await runtime.detectProviders()
      return c.json({
        health: { status: "ok", timestamp: new Date().toISOString() },
        providers,
        commands: getAllCommands(),
        cliInfo: cliInfoCache.data,
        cliRefreshing: [...cliInfoRefreshing],
        cliRefreshActive: cliRefreshRunning,
        templates: listTemplates(),
        drawmoonWorkflowTemplates: listDrawmoonWorkflowTemplateMetas(),
      })
    } catch (err) {
      return c.json({
        error: err instanceof Error ? err.message : String(err),
      }, 500)
    }
  })

  // ── Health ──────────────────────────────────────────────────────────

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() })
  })

  void (async () => {
    cliInfoCache = { data: await getLocalCliInfoFast(), at: Date.now() }
    refreshCliInfoSequential()
  })()

  return {
    app,
    runtime,
    workflowRuns,
    start() {
      console.log(`[Agent Runtime] Starting on http://localhost:${port}`)
      console.log(`[Agent Runtime] Data directory: ${dataDir}`)
      if (!shutdownHandlersInstalled) {
        shutdownHandlersInstalled = true
        const shutdown = (signal: NodeJS.Signals) => {
          const stopped = workflowRuns.runner.shutdown(`runtime-${signal.toLowerCase()}`)
          if (stopped.length) {
            console.log(`[Agent Runtime] Stopped ${stopped.length} queued workflow run(s); running runs will pause after current nodes (${signal}).`)
          }
          process.exit(signal === "SIGINT" ? 130 : 143)
        }
        process.once("SIGINT", shutdown)
        process.once("SIGTERM", shutdown)
      }
      return Bun.serve({
        hostname: "127.0.0.1",
        port,
        fetch: app.fetch,
        idleTimeout: 255, // allow long-running LLM requests (max 255s)
      })
    },
    port,
  }
}
