import { spawn, spawnSync } from "node:child_process"

import type {
  AgentNodeOutput,
  AgentProviderAdapter,
  AgentRunSpec,
  PreparedRun,
  ProviderCapabilities,
  ProviderInfo,
  RunEvent,
  SessionState,
} from "../schema/types.js"

const CAPABILITIES: ProviderCapabilities = {
  nonInteractive: true,
  sessionResume: true,
  streaming: true,
  cancellation: true,
  fileOps: true,
  fork: false,
  maxIterations: 1,
  contextModes: ["fresh", "summary", "artifacts"],
  inputModalities: {
    filesByPath: true,
    images: true,
    pdf: true,
    attachmentChannel: "path",
  },
  metadata: {
    promptless: true,
    commands: ["/model", "/usage", "/pricing"],
  },
}

export const kiroProvider: AgentProviderAdapter = {
  id: "kiro",

  async detect(): Promise<ProviderInfo> {
    const { spawnSync } = await import("node:child_process")
    const result = spawnSync("kiro-cli", ["--version"], {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 5000,
      ...(process.platform === "win32" ? { shell: "cmd.exe" } : {}),
    })
    const available = result.status === 0
    return {
      id: "kiro",
      name: "KIRO CLI",
      version: available ? result.stdout.trim().split("\n")[0] ?? null : null,
      available,
      path: available ? "kiro-cli" : null,
      capabilities: CAPABILITIES,
    }
  },

  async prepare(input: AgentRunSpec): Promise<PreparedRun> {
    const prompt = buildChatPrompt(input)
    const resume = shouldResumeKiroSession(input)
    const args = buildKiroArgs(input, resume)
    const command = resolveKiroCommand(input.config.customCommand || "kiro-cli")
    return {
      command,
      args,
      env: { ...process.env as Record<string, string> },
      cwd: input.config.cwd,
      timeoutMs: input.config.timeoutMs ?? 120_000,
      stdin: prompt || undefined,
    }
  },

  async *execute(run: PreparedRun, signal?: AbortSignal): AsyncIterable<RunEvent> {
    const runId = crypto.randomUUID()
    const startTime = new Date().toISOString()
    yield { type: "start", runId, nodeId: "kiro", timestamp: startTime }

    const child = spawn(run.command, run.args, {
      cwd: run.cwd,
      env: run.env,
      stdio: ["pipe", "pipe", "pipe"],
      signal,
      windowsHide: true,
      ...(process.platform === "win32" ? { shell: false } : {}),
    })

    if (run.stdin) {
      child.stdin?.write(run.stdin)
      child.stdin?.end()
    }

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

    const cleanStdout = stripAnsi(stdout)
    const cleanStderr = stripAnsi(stderr)
    if (cleanStdout) yield { type: "stdout", runId, data: cleanStdout, timestamp: new Date().toISOString() }
    if (cleanStderr) yield { type: "stderr", runId, data: cleanStderr, timestamp: new Date().toISOString() }
    if (exitCode === null) {
      const detail = cleanStderr.trim() || cleanStdout.trim()
      yield {
        type: "error",
        runId,
        error: detail ? `kiro-cli process error: ${detail.slice(0, 500)}` : "kiro-cli failed to start or exited abnormally",
        timestamp: new Date().toISOString(),
      }
      return
    }
    if (exitCode !== 0) {
      yield { type: "error", runId, error: cleanStderr || cleanStdout || `kiro-cli exited with code ${exitCode}`, timestamp: new Date().toISOString() }
      return
    }

    const text = cleanStdout
    yield {
      type: "complete",
      runId,
      result: {
        text,
        summary: buildOutputSummary(text),
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
          provider: "kiro",
          providerVersion: null,
        },
      },
      timestamp: new Date().toISOString(),
    }
  },

  async parse(events: RunEvent[]): Promise<AgentNodeOutput> {
    const stdout = events.filter((event) => event.type === "stdout").map((event) => event.data).join("")
    const stderr = events.filter((event) => event.type === "stderr").map((event) => event.data).join("")
    const start = events.find((event) => event.type === "start")
    const end = [...events].reverse().find((event) => event.type === "complete" || event.type === "error" || event.type === "cancelled")
    const text = stderr.trim() ? `${stdout}\n\n--- stderr ---\n${stderr}` : stdout
    return {
      text,
      summary: buildOutputSummary(text),
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
        provider: "kiro",
        providerVersion: null,
      },
    }
  },

  capabilities: CAPABILITIES,
}

/**
 * Same KIRO conversation: --resume + only the new user turn (no history replay).
 * Cross-conversation: artifact file refs + fs_read; never inline full upstream text.
 */
function buildChatPrompt(input: AgentRunSpec): string {
  const prompt = input.config.prompt.trim()
  if (shouldResumeKiroSession(input)) {
    return appendArtifactManifest(prompt, input.session)
  }
  return appendArtifactManifest(prompt, input.session)
}

function shouldResumeKiroSession(input: AgentRunSpec): boolean {
  const policy = input.config.sessionPolicy
  if (policy !== "shared" && policy !== "inherit") return false
  const priorAssistant = input.session?.messages.filter((message) => message.role === "assistant") ?? []
  return priorAssistant.length > 0
}

function appendArtifactManifest(prompt: string, session?: SessionState): string {
  const artifacts = session?.artifacts?.filter((artifact) => artifact.isReference) ?? []
  const summary = session?.summary?.trim()
  const sections = [prompt]
  if (summary) {
    sections.push(`[上游摘要]\n${summary}`)
  }
  if (artifacts.length) {
    const manifest = artifacts.map((artifact) => `- ${artifact.name}`).join("\n")
    sections.push(
      `[工作区稿件]\n${manifest}\n请用 fs_read 阅读需要参考的完整文件，不要依赖摘要省略正文。`,
    )
  }
  return sections.filter(Boolean).join("\n\n")
}

function buildKiroArgs(input: AgentRunSpec, resume: boolean): string[] {
  const template = input.config.customArgs?.length
    ? input.config.customArgs.map((arg) => arg)
    : ["chat", "--no-interactive", "--wrap", "never", "{{prompt}}"]
  const args = template
    .map((arg) => arg.replaceAll("{{prompt}}", ""))
    .filter((arg) => arg.length > 0)
    .map((arg) => normalizeKiroTrustToolsArg(arg))
  const model = input.config.model?.trim()
  if (model && !model.startsWith("kiro/") && !args.some((arg, index) => arg === "--model" && args[index + 1])) {
    const chatIndex = args.indexOf("chat")
    const insertAt = chatIndex >= 0 ? chatIndex + 1 : 0
    args.splice(insertAt, 0, "--model", model)
  }
  if (resume && !args.includes("--resume")) {
    const chatIndex = args.indexOf("chat")
    if (chatIndex >= 0) args.splice(chatIndex + 1, 0, "--resume")
    else args.unshift("--resume")
  }
  return args
}

/** Non-interactive review nodes need fs_write to land reviews/*.md — auto-upgrade read-only trust. */
export function normalizeKiroTrustToolsArg(arg: string): string {
  const match = arg.match(/^--trust-tools=(.*)$/)
  if (!match) return arg
  const tools = match[1]!.split(",").map((t) => t.trim()).filter(Boolean)
  if (tools.includes("fs_read") && !tools.includes("fs_write")) tools.push("fs_write")
  return `--trust-tools=${tools.join(",")}`
}

function resolveKiroCommand(command: string): string {
  if (process.platform !== "win32") return command
  try {
    const result = spawnSync("where", [command], { encoding: "utf-8", shell: true })
    if (result.status === 0) {
      const line = result.stdout.trim().split(/\r?\n/).find(Boolean)
      if (line) return line.trim()
    }
  } catch {
    // fall through
  }
  return command
}

/** One-line label for optional summary edges — full text stays in落盘文件. */
function buildOutputSummary(text: string): string {
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean)
  return firstLine ?? "（空输出）"
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
}
