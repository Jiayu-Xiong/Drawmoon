/**
 * OpenCode CLI provider adapter.
 *
 * Adapts the opencode CLI for workflow node execution.
 * Supports both interactive and non-interactive modes.
 * Detects opencode availability and version.
 */

import { spawn } from "node:child_process"
import { accessSync, constants, existsSync } from "node:fs"
import { join, resolve } from "node:path"

import { unifiedChatCompletionStream } from "../llm-api/client.js"

import type {
  AgentProviderAdapter,
  AgentRunSpec,
  PreparedRun,
  RunEvent,
  AgentNodeOutput,
  ProviderInfo,
  ProviderCapabilities,
} from "../schema/types.js"
import { buildOpencodeConfigJson, resolveApiKey, resolveWorkflowModel } from "./opencode-config-builder.js"
import { opencodePackageDir } from "../lib/monorepo-paths.js"

/** Kill only after `idleMs` with no stdout/stderr/progress — active runs are not capped by wall clock. */
function createIdleTimeout(idleMs: number, onIdle: () => void) {
  if (!Number.isFinite(idleMs) || idleMs <= 0) {
    return { touch: () => {}, clear: () => {} }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const touch = () => {
    clearTimeout(timer)
    timer = setTimeout(onIdle, idleMs)
  }
  touch()
  return { touch, clear: () => clearTimeout(timer) }
}

interface OpencodeCommand {
  command: string
  argsPrefix: string[]
  path: string
  /** When set, bun is spawned from the vendored monorepo root (workspace resolution). */
  spawnCwd?: string
}

function localOpencodePackageDir(): string {
  return opencodePackageDir(import.meta.url)
}

function vendoredOpencodeMonorepoRoot(): string {
  return resolve(localOpencodePackageDir(), "..", "..")
}

function localOpencodeCommand(): OpencodeCommand | null {
  const packageDir = localOpencodePackageDir()
  const entry = resolve(packageDir, "src", "index.ts")
  if (!existsSync(entry)) return null
  const monorepoRoot = vendoredOpencodeMonorepoRoot()
  return {
    command: resolveBunCommand(),
    argsPrefix: ["run", "--cwd", "packages/opencode", "--conditions=browser", "src/index.ts"],
    path: entry,
    spawnCwd: monorepoRoot,
  }
}

function resolveBunCommand(): string {
  if (process.platform !== "win32") return "bun"
  const npmBin = process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules", "bun", "bin", "bun.exe") : ""
  if (npmBin && existsSync(npmBin)) return npmBin
  return "bun.cmd"
}

async function findOpencode(): Promise<OpencodeCommand | null> {
  const local = localOpencodeCommand()
  if (local) return local

  const candidates = ["opencode"]
  if (process.platform === "win32") {
    candidates.push("opencode.cmd")
  }

  for (const cmd of candidates) {
    try {
      const { spawnSync } = await import("node:child_process")
      const [base = cmd] = cmd.split(" ")
      const which = process.platform === "win32" ? "where" : "which"
      const result = spawnSync(which, [base], { stdio: "ignore" })
      if (result.status === 0) return { command: cmd, argsPrefix: [], path: cmd }
    } catch {
      continue
    }
  }

  // Fallback: try direct access check
  for (const p of candidates) {
    try {
      accessSync(p, constants.X_OK)
      return { command: p, argsPrefix: [], path: p }
    } catch {
      continue
    }
  }

  return null
}

const CAPABILITIES: ProviderCapabilities = {
  nonInteractive: true,
  sessionResume: true,
  streaming: true,
  cancellation: true,
  fileOps: true,
  fork: true,
  maxIterations: 25,
  contextModes: ["fresh", "inherit", "fork", "summary", "artifacts"],
  inputModalities: {
    filesByPath: true,
    images: true,
    pdf: true,
    attachmentChannel: "path",
  },
  metadata: {},
}

function opencodeAgentAlias(mode: string): string {
  if (mode === "agent") return "build"
  // OpenCode native `plan` agent denies workspace edits (only .opencode/plans/*).
  if (mode === "plan" || mode === "review") return "build"
  return mode
}

/** If CWD is under workflow-output/runs, use the Agent project root instead for file exchange */
function effectiveCwd(cwd: string): string {
  return cwd
}

function promptWithContext(input: AgentRunSpec): string {
  let prompt = input.config.prompt
  if (input.session?.summary && !input.session.providerSessionId) {
    prompt = `[Upstream Summary]\n${input.session.summary}\n\n---\n\n${prompt}`
  }
  if (input.session?.diff && !input.session.providerSessionId) {
    prompt = `[Upstream Diff]\n${input.session.diff}\n\n---\n\n${prompt}`
  }
  if (input.session?.artifacts?.length) {
    const artifactSummary = input.session.artifacts.map((artifact) => `- ${artifact.name} (${artifact.mime})`).join("\n")
    prompt = `[Upstream Artifacts]\n${artifactSummary}\n\n---\n\n${prompt}`
  }
  const pathAttachments = (input.config.inputAttachments ?? []).filter((a) => a.kind === "path" && a.path)
  if (pathAttachments.length) {
    const lines = pathAttachments.map((a) => `- ${a.key}: ${a.path}${a.mimeType ? ` (${a.mimeType})` : ""}`).join("\n")
    prompt = `${prompt}\n\n[Input files — read with your file tools]\n${lines}`
  }
  return prompt
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function partText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ""
  const part = value as Record<string, unknown>
  return typeof part.text === "string" ? part.text : ""
}

function errorText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return String(value)
  const error = value as Record<string, unknown>
  if (typeof error.message === "string") return error.message
  const data = error.data
  if (data && typeof data === "object" && !Array.isArray(data) && typeof (data as Record<string, unknown>).message === "string") {
    return String((data as Record<string, unknown>).message)
  }
  return typeof error.name === "string" ? error.name : JSON.stringify(error)
}

export const opencodeProvider: AgentProviderAdapter = {
  id: "opencode",

  async detect(): Promise<ProviderInfo> {
    const command = await findOpencode()
    let version: string | null = null
    if (command) {
      try {
        const { spawnSync } = await import("node:child_process")
        const result = spawnSync(command.command, [...command.argsPrefix, "--version"], {
          stdio: "pipe",
          encoding: "utf-8",
          shell: false,
        })
        if (result.status === 0 && result.stdout) {
          version = result.stdout.trim().split("\n")[0] ?? null
        }
      } catch {
        // version detection is best-effort
      }
    }
    return {
      id: "opencode",
      name: "OpenCode",
      version,
      available: command !== null,
      path: command?.path ?? null,
      capabilities: CAPABILITIES,
    }
  },

  async prepare(input: AgentRunSpec): Promise<PreparedRun> {
    const { config } = input
    const local = localOpencodeCommand()
    const cmd = config.customCommand || local?.command || "opencode"
    const model = resolveWorkflowModel(config.model, config.llmApi)

    const args = [...(config.customCommand ? [] : local?.argsPrefix ?? []), "run", "--format", "json", "--model", model, "--dir", effectiveCwd(config.cwd)]
    if (input.session?.providerSessionId) {
      args.push("--session", input.session.providerSessionId)
    }
    if (config.mode && config.mode !== "chat") {
      args.push("--agent", opencodeAgentAlias(config.mode))
    }
    if (config.allowFileWrites) {
      args.push("--dangerously-skip-permissions")
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      AGENT_CWD: config.cwd,
      AGENT_MODE: config.mode,
      WORKFLOW_WORKSPACE_ROOT: config.cwd,
      OPENCODE_CONFIG_CONTENT: buildOpencodeConfigJson({
        model,
        api: config.llmApi,
        constraints: config.constraints,
        workspaceDir: config.cwd,
        readRoots: config.readRoots,
        flatWriteOnly: config.flatWriteOnly,
      }),
    }

    return {
      command: cmd,
      args,
      env,
      cwd: local?.spawnCwd ?? config.cwd,
      timeoutMs: config.timeoutMs ?? 300_000,
      stdin: promptWithContext(input),
      llmApiFallback: config.llmApi?.endpoint && config.llmApi.model
        ? {
            protocol: config.llmApi.protocol ?? "openai-chat",
            endpoint: config.llmApi.endpoint,
            model: config.llmApi.model,
            apiKey: resolveApiKey(config.llmApi) ?? undefined,
            apiKeyEnv: config.llmApi.apiKeyEnv,
            timeoutMs: config.llmApi.timeoutMs ?? config.timeoutMs ?? 300_000,
            responseFormat: "markdown",
            provider: "opencode",
          }
        : undefined,
    }
  },

  async *execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent> {
    const runId = crypto.randomUUID()
    const startTime = new Date().toISOString()

    yield { type: "start", runId, nodeId: "opencode", timestamp: startTime }

    let child
    try {
      child = spawn(run.command, run.args, {
        cwd: run.cwd,
        env: run.env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        signal,
      })
    } catch (error) {
      if (run.llmApiFallback && /EPERM|EACCES|ENOENT|uv_spawn|spawn/i.test(error instanceof Error ? error.message : String(error))) {
        yield* executeLlmApiFallback(run, startTime, signal)
        return
      }
      throw error
    }

    let spawnFailed = false
    child.once("error", (error) => {
      if (run.llmApiFallback && /EPERM|EACCES|ENOENT|uv_spawn|spawn/i.test(error.message)) {
        spawnFailed = true
      }
    })

    if (run.stdin) {
      child.stdin?.end(run.stdin)
    } else {
      child.stdin?.end()
    }

    const terminateChild = () => {
      if (child.pid && process.platform === "win32") {
        try {
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" })
        } catch {
          child.kill("SIGTERM")
        }
      } else {
        child.kill("SIGTERM")
      }
    }
    const cancelHandler = () => terminateChild()
    signal?.addEventListener("abort", cancelHandler, { once: true })

    let timedOut = false
    let finished = false
    let stdout = ""
    let stderr = ""
    let jsonBuffer = ""
    let providerSessionId: string | undefined
    const pending: RunEvent[] = []
    let notify: (() => void) | null = null
    const push = (event: RunEvent) => {
      idleTimeout.touch()
      pending.push(event)
      notify?.()
      notify = null
    }

    const idleTimeout = createIdleTimeout(run.timeoutMs, () => {
      timedOut = true
      idleTimeout.clear()
      pending.push({
        type: "error",
        runId,
        error: `OpenCode idle timeout: no output for ${run.timeoutMs}ms`,
        timestamp: new Date().toISOString(),
      })
      finished = true
      terminateChild()
      notify?.()
      notify = null
    })

    child.stdout?.on("data", (chunk: Buffer) => {
      idleTimeout.touch()
      const text = chunk.toString("utf-8")
      stdout += text
      jsonBuffer += text
      const lines = jsonBuffer.split(/\r?\n/)
      jsonBuffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const event = parseJsonLine(line)
        if (!event) {
          push({ type: "stdout", runId, data: line + "\n", timestamp: new Date().toISOString() })
          continue
        }
        if (typeof event.sessionID === "string") providerSessionId = event.sessionID
        if (event.type === "text") {
          const data = partText(event.part)
          if (data) push({ type: "stdout", runId, data, timestamp: new Date().toISOString() })
          continue
        }
        if (event.type === "tool_use") {
          const part = event.part && typeof event.part === "object" && !Array.isArray(event.part) ? event.part as Record<string, unknown> : {}
          const tool = typeof part.tool === "string" ? part.tool : "tool"
          push({ type: "progress", runId, message: `opencode ${tool}`, timestamp: new Date().toISOString() })
          continue
        }
        if (event.type === "error") {
          push({ type: "error", runId, error: errorText(event.error), timestamp: new Date().toISOString() })
        }
      }
    })

    child.stderr?.on("data", (chunk: Buffer) => {
      idleTimeout.touch()
      const text = chunk.toString("utf-8")
      stderr += text
      push({ type: "stderr", runId, data: text, timestamp: new Date().toISOString() })
    })

    let exitCode: number | null = null
    const exitPromise = new Promise<void>((resolve) => {
      child.on("close", (code) => {
        exitCode = code
        finished = true
        notify?.()
        notify = null
        resolve()
      })
      child.on("error", () => {
        exitCode = null
        finished = true
        notify?.()
        notify = null
        resolve()
      })
    })

    while (!finished || pending.length > 0) {
      const event = pending.shift()
      if (event) {
        yield event
        continue
      }
      await new Promise<void>((resolve) => {
        notify = resolve
      })
    }
    await exitPromise

    idleTimeout.clear()
    signal?.removeEventListener("abort", cancelHandler)

    if (spawnFailed && run.llmApiFallback) {
      yield* executeLlmApiFallback(run, startTime, signal)
      return
    }

    if (signal?.aborted) {
      yield { type: "cancelled", runId, timestamp: new Date().toISOString() }
      return
    }

    if (timedOut) {
      return
    }

    if (exitCode === null) {
      yield { type: "error", runId, error: "Process failed to start", timestamp: new Date().toISOString() }
      return
    }

    if (exitCode !== 0) {
      const errText = eventsText(stdout, stderr)
      if (run.llmApiFallback && /preload not found|exited without assistant text|EPERM|EACCES|ENOENT|uv_spawn|spawn/i.test(errText)) {
        yield* executeLlmApiFallback(run, startTime, signal)
        return
      }
      yield { type: "error", runId, error: `OpenCode exited with code ${exitCode}: ${errText.slice(0, 500)}`, timestamp: new Date().toISOString() }
      return
    }

    yield {
      type: "complete",
      runId,
      result: {
        text: eventsText(stdout, stderr),
        sessionId: providerSessionId,
        traceId: runId,
        cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
        metadata: {
          startedAt: startTime,
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          exitCode,
          cancelled: false,
          timedOut: false,
          iterations: 1,
          provider: "opencode",
          providerVersion: null,
        },
      },
      timestamp: new Date().toISOString(),
    }
  },

  async parse(events: RunEvent[]): Promise<AgentNodeOutput> {
    const stdoutParts: string[] = []
    const stderrParts: string[] = []
    let runId = ""
    let startTime = ""
    let endTime = new Date().toISOString()
    let cancelled = false
    let timedOut = false
    let exitCode: number | null = null
    let result: AgentNodeOutput | undefined

    for (const ev of events) {
      switch (ev.type) {
        case "start":
          runId = ev.runId
          startTime = ev.timestamp
          break
        case "stdout":
          stdoutParts.push(ev.data)
          break
        case "stderr":
          stderrParts.push(ev.data)
          break
        case "complete":
          result = ev.result
          endTime = ev.timestamp
          break
        case "cancelled":
          cancelled = true
          endTime = ev.timestamp
          break
        case "error":
          stderrParts.push(ev.error)
          endTime = ev.timestamp
          break
      }
    }

    if (result) {
      return result
    }

    const text = stdoutParts.join("")
    const stderrText = stderrParts.join("")
    const fullOutput = stderrText.trim() ? `${text}\n\n--- stderr ---\n${stderrText}` : text
    return {
      text: fullOutput,
      summary: fullOutput.length > 500 ? fullOutput.slice(0, 500) + "..." : fullOutput,
      traceId: runId,
      cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
      metadata: {
        startedAt: startTime,
        finishedAt: endTime,
        durationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
        exitCode,
        cancelled,
        timedOut,
        iterations: 1,
        provider: "opencode",
        providerVersion: null,
      },
    }
  },

  capabilities: CAPABILITIES,
}

async function* executeLlmApiFallback(run: PreparedRun, startTime: string, signal?: AbortSignal): AsyncIterable<RunEvent> {
  const runId = crypto.randomUUID()
  const fallback = run.llmApiFallback
  if (!fallback) {
    yield { type: "error", runId, error: "OpenCode spawn failed and no LLM API fallback is configured.", timestamp: new Date().toISOString() }
    return
  }

  yield { type: "progress", runId, message: "opencode spawn unavailable; using bound LLM API fallback", timestamp: new Date().toISOString() }
  let fullText = ""
  let responseUsage: AgentNodeOutput["usage"]
  for await (const event of unifiedChatCompletionStream(
    {
      protocol: fallback.protocol as LlmClientConfig["protocol"],
      endpoint: fallback.endpoint,
      model: fallback.model,
      apiKey: fallback.apiKey,
      apiKeyEnv: fallback.apiKeyEnv,
      timeoutMs: fallback.timeoutMs,
    },
    {
      model: fallback.model,
      messages: [{ role: "user", content: run.stdin ?? "" }],
      responseFormat: fallback.responseFormat ?? "markdown",
      stream: true,
      metadata: { provider: "opencode", fallback: "llm-api" },
    },
    signal,
  )) {
    if (event.type === "delta" && event.delta) {
      fullText += event.delta
      yield { type: "stdout", runId, data: event.delta, timestamp: new Date().toISOString() }
    } else if (event.type === "usage" && event.usage) {
      responseUsage = {
        inputTokens: event.usage.inputTokens ?? 0,
        outputTokens: event.usage.outputTokens ?? 0,
        cacheReadTokens: event.usage.cacheReadTokens ?? 0,
        cacheWriteTokens: event.usage.cacheWriteTokens ?? 0,
        reasoningTokens: event.usage.reasoningTokens,
        totalTokens: event.usage.totalTokens ?? ((event.usage.inputTokens ?? 0) + (event.usage.outputTokens ?? 0)),
        source: "run-results",
      }
    } else if (event.type === "done" && event.response) {
      fullText = event.response.text || fullText
      if (event.response.usage) {
        responseUsage = {
          inputTokens: event.response.usage.inputTokens ?? 0,
          outputTokens: event.response.usage.outputTokens ?? 0,
          cacheReadTokens: event.response.usage.cacheReadTokens ?? 0,
          cacheWriteTokens: event.response.usage.cacheWriteTokens ?? 0,
          reasoningTokens: event.response.usage.reasoningTokens,
          totalTokens: event.response.usage.totalTokens ?? ((event.response.usage.inputTokens ?? 0) + (event.response.usage.outputTokens ?? 0)),
          source: "run-results",
        }
      }
    } else if (event.type === "error") {
      yield { type: "error", runId, error: event.error ?? "LLM API stream failed", timestamp: new Date().toISOString() }
      return
    }
  }
  const finishedAt = new Date().toISOString()
  yield {
    type: "complete",
    runId,
    result: {
      text: fullText,
      summary: fullText.slice(0, 1200),
      traceId: runId,
      cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
      metadata: {
        startedAt: startTime,
        finishedAt,
        durationMs: new Date(finishedAt).getTime() - new Date(startTime).getTime(),
        exitCode: 0,
        cancelled: false,
        timedOut: false,
        iterations: 1,
        provider: fallback.provider,
        providerVersion: "llm-api-fallback",
      },
      usage: responseUsage,
    },
    timestamp: finishedAt,
  }
}

function eventsText(stdout: string, stderr: string): string {
  const parts: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const event = parseJsonLine(line)
    if (event?.type !== "text") continue
    const text = partText(event.part)
    if (text) parts.push(text)
  }
  if (parts.length > 0) return parts.join("")

  const errors = stdout
    .split(/\r?\n/)
    .map(parseJsonLine)
    .filter((event): event is Record<string, unknown> => event !== null && event.type === "error")
    .map((event) => errorText(event.error))
    .filter(Boolean)
  if (errors.length > 0) return errors.join("\n")
  return stderr.trim() ? `OpenCode exited without assistant text.\n\n--- stderr ---\n${stderr}` : "OpenCode exited without assistant text."
}
