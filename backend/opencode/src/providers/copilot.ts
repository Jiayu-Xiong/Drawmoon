import { spawn } from "node:child_process"
import { homedir } from "node:os"
import { existsSync } from "node:fs"
import { join } from "node:path"

import type {
  AgentNodeOutput,
  AgentProviderAdapter,
  AgentRunSpec,
  PreparedRun,
  ProviderCapabilities,
  ProviderInfo,
  RunEvent,
} from "../schema/types.js"

const COPILOT_PS1 = join(
  homedir(),
  "AppData", "Roaming", "Code", "User", "globalStorage",
  "github.copilot-chat", "copilotCli", "copilot.ps1",
)

const CAPABILITIES: ProviderCapabilities = {
  nonInteractive: true,
  sessionResume: false,
  streaming: true,
  cancellation: true,
  fileOps: false,
  fork: false,
  maxIterations: 1,
  contextModes: ["fresh", "artifacts"],
  inputModalities: {
    filesByPath: false,
    images: false,
    pdf: false,
    attachmentChannel: "none",
  },
  metadata: {
    promptless: true,
    commands: ["--version", "--help", "login"],
  },
}

export const copilotProvider: AgentProviderAdapter = {
  id: "copilot",

  async detect(): Promise<ProviderInfo> {
    const available = existsSync(COPILOT_PS1)
    let version: string | null = null
    if (available) {
      try {
        const { spawnSync } = await import("node:child_process")
        const result = spawnSync("powershell.exe", [
          "-ExecutionPolicy", "Bypass",
          "-File", COPILOT_PS1,
          "--version",
        ], {
          stdio: "pipe",
          encoding: "utf-8",
          timeout: 10000,
        })
        if (result.status === 0) {
          version = result.stdout.trim().split("\n")[0]?.replace("GitHub Copilot CLI ", "") ?? null
        }
      } catch { /* ignore */ }
    }
    return {
      id: "copilot",
      name: "GitHub Copilot CLI",
      version,
      available,
      path: available ? COPILOT_PS1 : null,
      capabilities: CAPABILITIES,
    }
  },

  async prepare(input: AgentRunSpec): Promise<PreparedRun> {
    const hasCustomArgs = input.config.customArgs?.length
    const prompt = input.config.prompt

    // Build args for the Copilot CLI .ps1 script
    let copilotArgs: string[]
    if (hasCustomArgs) {
      copilotArgs = input.config.customArgs!.map(
        (arg) => arg.replaceAll("{{prompt}}", prompt)
      )
    } else if (prompt) {
      // Prompt mode: non-interactive, silent, JSON output
      copilotArgs = [
        "-p", prompt,
        "-s",                       // silent: only output response
        "--output-format", "json",
      ]
    } else {
      // No prompt: just show version (safe, no credits)
      copilotArgs = ["--version"]
    }

    return {
      command: "powershell.exe",
      args: [
        "-ExecutionPolicy", "Bypass",
        "-File", COPILOT_PS1,
        ...copilotArgs,
      ],
      env: { ...process.env as Record<string, string> },
      cwd: input.config.cwd,
      timeoutMs: input.config.timeoutMs ?? 120_000,
    }
  },

  async *execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent> {
    const runId = crypto.randomUUID()
    const startTime = new Date().toISOString()
    yield { type: "start", runId, nodeId: "copilot", timestamp: startTime }

    const child = spawn(run.command, run.args, {
      cwd: run.cwd,
      env: run.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...(process.platform === "win32" ? { shell: "cmd.exe" } : {}),
      signal,
    })

    const timeout = setTimeout(() => child.kill("SIGTERM"), run.timeoutMs)
    let stdout = ""
    let stderr = ""
    let exitCode: number | null = null

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8")
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8")
    })

    await new Promise<void>((resolve) => {
      child.on("close", (code) => {
        exitCode = code
        resolve()
      })
      child.on("error", () => resolve())
    })
    clearTimeout(timeout)

    if (signal?.aborted) {
      yield { type: "cancelled", runId, timestamp: new Date().toISOString() }
      return
    }

    if (stdout) yield { type: "stdout", runId, data: stdout, timestamp: new Date().toISOString() }
    if (stderr) yield { type: "stderr", runId, data: stderr, timestamp: new Date().toISOString() }
    if (exitCode === null) {
      yield { type: "error", runId, error: "copilot CLI failed to start", timestamp: new Date().toISOString() }
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
          iterations: 1,
          provider: "copilot",
          providerVersion: null,
        },
      },
      timestamp: new Date().toISOString(),
    }
  },

  async parse(events: RunEvent[]): Promise<AgentNodeOutput> {
    const stdout = events.filter((e) => e.type === "stdout").map((e) => e.data).join("")
    const stderr = events.filter((e) => e.type === "stderr").map((e) => e.data).join("")
    const start = events.find((e) => e.type === "start")
    const end = [...events].reverse().find((e) => e.type === "complete" || e.type === "error" || e.type === "cancelled")
    return {
      text: stderr.trim() ? `${stdout}\n\n--- stderr ---\n${stderr}` : stdout,
      summary: stdout.length > 500 ? stdout.slice(0, 500) + "..." : stdout,
      traceId: start?.runId ?? crypto.randomUUID(),
      cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
      metadata: {
        startedAt: start?.timestamp ?? new Date().toISOString(),
        finishedAt: end?.timestamp ?? new Date().toISOString(),
        durationMs: 0,
        exitCode: null,
        cancelled: end?.type === "cancelled",
        timedOut: false,
        iterations: 1,
        provider: "copilot",
        providerVersion: null,
      },
    }
  },

  capabilities: CAPABILITIES,
}
