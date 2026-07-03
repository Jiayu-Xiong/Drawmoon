/**
 * Custom CLI command provider adapter.
 *
 * Executes arbitrary CLI commands as agent nodes.
 * This is the simplest provider – it spawns a process,
 * streams output, and returns the full stdout as text.
 */

import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type {
  AgentProviderAdapter,
  AgentRunSpec,
  PreparedRun,
  RunEvent,
  AgentNodeOutput,
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
  contextModes: ["fresh", "summary", "artifacts"],
  inputModalities: {
    filesByPath: false,
    images: true,
    pdf: false,
    attachmentChannel: "base64",
  },
  metadata: {},
}

export const customProvider: AgentProviderAdapter = {
  id: "custom",

  async detect(): Promise<ProviderInfo> {
    // Check that cmd.exe (Windows) or sh (Unix) is available
    const shell = process.platform === "win32" ? "cmd.exe" : "sh"
    let available = false
    try {
      const { accessSync, constants } = await import("node:fs")
      accessSync(shell, constants.X_OK)
      available = true
    } catch {
      // Try via which/where
      try {
        const { spawnSync } = await import("node:child_process")
        const which = process.platform === "win32" ? "where" : "which"
        const result = spawnSync(which, [shell], { stdio: "ignore" })
        available = result.status === 0
      } catch {
        available = true // assume available as fallback
      }
    }

    return {
      id: "custom",
      name: "Custom Command",
      version: null,
      available,
      path: available ? shell : null,
      capabilities: CAPABILITIES,
    }
  },

  async prepare(input: AgentRunSpec): Promise<PreparedRun> {
    const { config } = input
    // Default to cmd.exe on Windows, sh on Unix
    const isWindows = process.platform === "win32"
    const command = config.customCommand || (isWindows ? "cmd.exe" : "sh")
    const args = config.customArgs ?? (isWindows ? ["/c", "echo %AGENT_PROMPT%"] : ["-c", "echo $AGENT_PROMPT"])

    // Build prompt file for long prompts (pass via file to avoid shell escaping issues)
    const tmpDir = mkdtempSync(join(tmpdir(), "agent-custom-"))
    const promptFile = join(tmpDir, "prompt.txt")
    writeFileSync(promptFile, config.prompt, "utf-8")

    // Build env with prompt file reference
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      AGENT_PROMPT: config.prompt,
      AGENT_PROMPT_FILE: promptFile,
      AGENT_CWD: config.cwd,
      AGENT_MODE: config.mode,
    }

    // If there's a session summary from upstream, pass it
    if (input.session?.summary) {
      env.AGENT_UPSTREAM_SUMMARY = input.session.summary
    }

    // If there's a parent session id
    if (input.session?.id) {
      env.AGENT_SESSION_ID = input.session.id
    }

    return {
      command,
      args,
      env,
      cwd: config.cwd,
      timeoutMs: config.timeoutMs ?? 300_000,
    }
  },

  async *execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent> {
    const runId = crypto.randomUUID()
    const startTime = new Date().toISOString()

    yield { type: "start", runId, nodeId: "custom", timestamp: startTime }

    const child = spawn(run.command, run.args, {
      cwd: run.cwd,
      env: run.env,
      stdio: ["pipe", "pipe", "pipe"],
      signal,
    })

    // Wire up cancellation
    const cancelHandler = () => {
      child.kill("SIGTERM")
    }
    signal?.addEventListener("abort", cancelHandler, { once: true })

    // Timeout handling
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
    }, run.timeoutMs)

    let stdout = ""
    let stderr = ""
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
      push({ type: "stdout", runId, data: text, timestamp: new Date().toISOString() })
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
      await new Promise<void>((resolve) => {
        notify = resolve
      })
    }
    await exitPromise

    clearTimeout(timeout)
    signal?.removeEventListener("abort", cancelHandler)

    // Clean up temp files
    try {
      const promptFile = run.env.AGENT_PROMPT_FILE
      if (promptFile) {
        unlinkSync(promptFile)
        rmSync(join(promptFile, ".."), { recursive: true, force: true })
      }
    } catch {
      // Temp file cleanup is best-effort
    }

    if (signal?.aborted) {
      yield { type: "cancelled", runId, timestamp: new Date().toISOString() }
      return
    }

    if (exitCode === null) {
      yield {
        type: "error",
        runId,
        error: "Process failed to start or was killed",
        timestamp: new Date().toISOString(),
      }
      return
    }

    // Emit collected stderr as error if present
    if (stderr.trim()) {
      yield { type: "stderr", runId, data: stderr, timestamp: new Date().toISOString() }
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
          iterations: 1,
          provider: "custom",
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
        case "cancelled":
          cancelled = true
          endTime = ev.timestamp
          break
        case "complete":
          endTime = ev.timestamp
          break
        case "error":
          stderrParts.push(ev.error)
          endTime = ev.timestamp
          break
      }
    }

    const text = stdoutParts.join("")
    const stderrText = stderrParts.join("")
    const fullOutput = stderrText.trim() ? `${text}\n\n--- stderr ---\n${stderrText}` : text

    return {
      text: fullOutput,
      summary: text.length > 500 ? text.slice(0, 500) + "..." : text,
      traceId: runId,
      cache: {
        hit: false,
        mode: "off",
        key: "",
        bypassed: false,
        createdAt: null,
      },
      metadata: {
        startedAt: startTime,
        finishedAt: endTime,
        durationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
        exitCode: null,
        cancelled,
        timedOut: false,
        iterations: 1,
        provider: "custom",
        providerVersion: null,
      },
    }
  },

  capabilities: CAPABILITIES,
}
