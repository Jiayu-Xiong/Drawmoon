/**
 * Codex CLI provider adapter.
 *
 * Adapts the codex CLI (https://github.com/openai/codex) for workflow node execution.
 * Supports non-interactive exec mode with JSONL streaming.
 * Detects codex availability, version, model config, and features.
 *
 * Non-token-consuming commands used for detection:
 *   codex --version
 *   codex features list
 *   cat ~/.codex/config.toml (config parsing)
 */

import { spawn } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parse as parseTOML } from "smol-toml"

import type {
  AgentProviderAdapter,
  AgentRunSpec,
  PreparedRun,
  RunEvent,
  AgentNodeOutput,
  ProviderInfo,
  ProviderCapabilities,
} from "../schema/types.js"

// ── Config Parsing ──────────────────────────────────────────────────────

interface CodexConfig {
  model?: string
  model_reasoning_effort?: string
  windows?: { sandbox?: string }
  shell_environment_policy?: { inherit?: string }
  features?: Record<string, boolean>
}

interface CodexStatus {
  version: string
  model: string
  sandbox: string
  reasoningEffort: string
  features: Record<string, { stage: string; enabled: boolean }>
  path: string
  configExists: boolean
}

function readCodexConfig(): CodexConfig | null {
  const configPath = join(homedir(), ".codex", "config.toml")
  if (!existsSync(configPath)) return null
  try {
    const raw = readFileSync(configPath, "utf-8")
    return parseTOML(raw) as CodexConfig
  } catch {
    return null
  }
}

// ── Capabilities ────────────────────────────────────────────────────────

const CAPABILITIES: ProviderCapabilities = {
  nonInteractive: true,
  sessionResume: true,
  streaming: true,
  cancellation: true,
  fileOps: true,
  fork: true,
  maxIterations: 50,
  contextModes: ["fresh", "inherit", "fork", "summary", "artifacts"],
  inputModalities: {
    filesByPath: true,
    images: true,
    pdf: true,
    attachmentChannel: "path",
  },
  metadata: {},
}

// ── Provider ────────────────────────────────────────────────────────────

export const codexProvider = {
  id: "codex",

  async detect(): Promise<ProviderInfo> {
    // Find codex
    let path: string | null = null
    let version: string | null = null

    try {
      const { spawnSync } = await import("node:child_process")
      const verResult = spawnSync("codex", ["--version"], {
        stdio: "pipe",
        encoding: "utf-8",
        timeout: 5000,
        ...(process.platform === "win32" ? { shell: "cmd.exe" } : {}),
      })
      if (verResult.status === 0) {
        version = verResult.stdout.trim().split("\n")[0] ?? null
        path = "codex"
      }
    } catch {
      // Fallback: try full path
      const candidates = [
        join(homedir(), "AppData", "Roaming", "npm", "codex"),
        join(homedir(), "AppData", "Roaming", "npm", "codex.cmd"),
      ]
      for (const c of candidates) {
        if (existsSync(c)) {
          path = c
          break
        }
      }
    }

    // Augment metadata with config-derived info
    const config = readCodexConfig()
    const metadata: Record<string, unknown> = {}
    if (config) {
      metadata.model = config.model ?? "unknown"
      metadata.reasoningEffort = config.model_reasoning_effort ?? "unknown"
      metadata.sandbox = config.windows?.sandbox ?? config.shell_environment_policy?.inherit ?? "unknown"
    }

    return {
      id: "codex",
      name: "Codex",
      version,
      available: path !== null,
      path,
      capabilities: CAPABILITIES,
      ...{ extra: metadata },
    } as ProviderInfo
  },

  /**
   * Get extended status info about the codex installation.
   * Non-token-consuming – only reads version + config + features.
   */
  async getStatus(): Promise<CodexStatus> {
    const { spawnSync } = await import("node:child_process")

    // Version
    let version = "unknown"
    try {
      const v = spawnSync("codex", ["--version"], {
        stdio: "pipe",
        encoding: "utf-8",
        timeout: 5000,
        ...(process.platform === "win32" ? { shell: "cmd.exe" } : {}),
      })
      if (v.status === 0) version = v.stdout.trim().split("\n")[0] ?? "unknown"
    } catch { /* best-effort */ }

    // Config
    const config = readCodexConfig()
    const model = config?.model ?? "unknown"
    const reasonEffort = config?.model_reasoning_effort ?? "unknown"
    const sandbox = config?.windows?.sandbox ?? "unknown"

    // Features
    let features: Record<string, { stage: string; enabled: boolean }> = {}
    try {
      const f = spawnSync("codex", ["features", "list"], {
        stdio: "pipe",
        encoding: "utf-8",
        timeout: 10000,
        ...(process.platform === "win32" ? { shell: "cmd.exe" } : {}),
      })
      if (f.status === 0) {
        for (const line of f.stdout.split("\n")) {
          const match = line.match(/^(\S+)\s+(\S+(?:\s+\S+)*?)\s+(true|false)\s*$/)
          if (match) {
            const [, name, stage, enabled] = match
            if (name && stage && enabled) {
              features[name] = { stage: stage.trim(), enabled: enabled === "true" }
            }
          }
        }
      }
    } catch { /* best-effort */ }

    return {
      version,
      model,
      sandbox,
      reasoningEffort: reasonEffort,
      features,
      path: this.id,
      configExists: config !== null,
    }
  },

  async prepare(input: AgentRunSpec): Promise<PreparedRun> {
    const { config } = input

    const args: string[] = [
      "exec",
      "--json",           // JSONL streaming output
      "--ephemeral",      // Don't persist session
      ...(config.allowFileWrites ? ["--sandbox", "workspace-write"] : ["--sandbox", "read-only"]),
      ...(config.maxIterations ? ["--max-iterations", String(config.maxIterations)] : []),
      "--cd", config.cwd,
      "--skip-git-repo-check",
    ]

    // Build the main prompt with upstream context
    let prompt = config.prompt
    if (input.session?.summary) {
      prompt = `[Upstream Summary]\n${input.session.summary}\n\n---\n\n${prompt}`
    }
    if (input.session?.diff) {
      prompt = `[Upstream Diff]\n${input.session.diff}\n\n---\n\n${prompt}`
    }
    if (input.session?.artifacts?.length) {
      const artSummary = input.session.artifacts.map((a) => `- ${a.name} (${a.mime})`).join("\n")
      prompt = `[Upstream Artifacts]\n${artSummary}\n\n---\n\n${prompt}`
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      AGENT_CWD: config.cwd,
      AGENT_MODE: config.mode,
    }

    return {
      command: "codex",
      args: [...args, prompt],
      env,
      cwd: config.cwd,
      timeoutMs: config.timeoutMs ?? 600_000,
    }
  },

  async *execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent> {
    const runId = crypto.randomUUID()
    const startTime = new Date().toISOString()

    yield { type: "start", runId, nodeId: "codex", timestamp: startTime }

    const child = spawn(run.command, run.args, {
      cwd: run.cwd,
      env: run.env,
      stdio: ["pipe", "pipe", "pipe"],
      ...(process.platform === "win32" ? { shell: "cmd.exe" } : {}),
      signal,
    })

    const cancelHandler = () => child.kill("SIGTERM")
    signal?.addEventListener("abort", cancelHandler, { once: true })

    const timeout = setTimeout(() => child.kill("SIGTERM"), run.timeoutMs)

    let stdout = ""
    let stderr = ""
    let jsonlEvents: unknown[] = []
    const pending: RunEvent[] = []
    let notify: (() => void) | null = null
    const push = (event: RunEvent) => {
      pending.push(event)
      notify?.()
      notify = null
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stdout += text

      // Parse JSONL lines for structured events
      const lines = text.split("\n")
      for (const line of lines) {
        try {
          if (line.trim().startsWith("{")) {
            const parsed = JSON.parse(line.trim())
            jsonlEvents.push(parsed)

            // Extract message content from codex JSONL events
            const msgType = parsed?.type
            if (msgType === "assistant" || msgType === "response") {
              const content = parsed?.message?.content ?? parsed?.output ?? JSON.stringify(parsed)
              push({ type: "stdout", runId, data: typeof content === "string" ? content : JSON.stringify(content), timestamp: new Date().toISOString() })
            } else if (msgType === "tool_call" || msgType === "tool_use") {
              push({ type: "progress", runId, message: `Tool: ${parsed?.tool ?? parsed?.name ?? "unknown"}`, timestamp: new Date().toISOString() })
            } else if (msgType === "error") {
              push({ type: "error", runId, error: parsed?.message ?? JSON.stringify(parsed), timestamp: new Date().toISOString() })
            }
          }
        } catch {
          // Not JSON – push as raw stdout
          push({ type: "stdout", runId, data: line, timestamp: new Date().toISOString() })
        }
      }
    })

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stderr += text
      push({ type: "stderr", runId, data: text, timestamp: new Date().toISOString() })
    })

    let finished = false
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
      await new Promise<void>((resolve) => { notify = resolve })
    }
    await exitPromise

    clearTimeout(timeout)
    signal?.removeEventListener("abort", cancelHandler)

    if (signal?.aborted) {
      yield { type: "cancelled", runId, timestamp: new Date().toISOString() }
      return
    }

    if (exitCode === null) {
      yield { type: "error", runId, error: "Process failed to start", timestamp: new Date().toISOString() }
      return
    }

    yield {
      type: "complete",
      runId,
      result: {
        text: stdout,
        summary: stdout.length > 500 ? stdout.slice(0, 500) + "..." : stdout,
        traceId: runId,
        cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
        metadata: {
          startedAt: startTime,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - new Date(startTime).getTime(),
          exitCode,
          cancelled: false,
          timedOut: false,
          iterations: jsonlEvents.length || 1,
          provider: "codex",
          providerVersion: null,
        },
      },
      timestamp: new Date().toISOString(),
    }
  },

  async parse(events: RunEvent[]): Promise<AgentNodeOutput> {
    const stdoutParts: string[] = []
    let runId = ""
    let startTime = ""
    let endTime = new Date().toISOString()
    let cancelled = false
    let exitCode: number | null = null
    let result: AgentNodeOutput | undefined

    for (const ev of events) {
      switch (ev.type) {
        case "start":
          runId = ev.runId
          startTime = ev.timestamp
          break
        case "stdout":
          stdoutParts.push(ev.data ?? "")
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
          endTime = ev.timestamp
          break
      }
    }

    if (result) return result

    const text = stdoutParts.join("")
    return {
      text,
      summary: text.length > 500 ? text.slice(0, 500) + "..." : text,
      traceId: runId,
      cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
      metadata: {
        startedAt: startTime,
        finishedAt: endTime,
        durationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
        exitCode,
        cancelled,
        timedOut: false,
        iterations: 1,
        provider: "codex",
        providerVersion: null,
      },
    }
  },

  capabilities: CAPABILITIES,
} satisfies AgentProviderAdapter & { getStatus(): Promise<CodexStatus> }
