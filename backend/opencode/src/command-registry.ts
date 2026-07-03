/**
 * Provider Command Registry
 *
 * Manages bound commands for each provider. A "bound command" is a CLI command
 * that a provider exposes for data queries — e.g. listing models, checking
 * context size, fetching pricing, reading config.
 *
 * Users can manually bind arbitrary CLI commands to any provider, making the
 * system extensible without writing TypeScript.
 */

import { spawn } from "node:child_process"
import type {
  ProviderCommandBinding,
  ProviderCommandBinding as ProviderCommand,
  CommandOutputChunk,
  CommandRunResult,
  CommandOutputStyle,
  CommandColumn,
  ProviderId,
} from "./schema/types.js"

// ── In-Memory Registry ──────────────────────────────────────────────────

const registry = new Map<string, ProviderCommandBinding[]>()

/**
 * Bind one or more commands to a provider.
 */
export function bindCommands(providerId: string, commands: ProviderCommandBinding[]): void {
  const existing = registry.get(providerId) ?? []
  registry.set(providerId, [...existing, ...commands])
}

/**
 * Get all commands bound to a provider.
 */
export function getCommands(providerId: string): ProviderCommandBinding[] {
  return registry.get(providerId) ?? []
}

/**
 * Get all commands across all providers, keyed by providerId.
 */
export function getAllCommands(): Record<string, ProviderCommandBinding[]> {
  const result: Record<string, ProviderCommandBinding[]> = {}
  for (const [id, cmds] of registry) {
    result[id] = cmds
  }
  return result
}

/**
 * Remove all commands for a provider.
 */
export function clearCommands(providerId: string): void {
  registry.delete(providerId)
}

/**
 * Remove all commands.
 */
export function clearAllCommands(): void {
  registry.clear()
}

// ── Execution ────────────────────────────────────────────────────────────

/**
 * Run a bound command and yield output chunks.
 */
export async function* runCommand(
  providerId: string,
  commandId: string,
  cwd?: string,
  extraEnv?: Record<string, string>,
): AsyncIterable<CommandOutputChunk> {
  const commands = registry.get(providerId)
  if (!commands) {
    yield { type: "error", data: `Provider "${providerId}" has no bound commands`, timestamp: new Date().toISOString() }
    return
  }

  const binding = commands.find((c) => c.id === commandId)
  if (!binding) {
    yield { type: "error", data: `Command "${commandId}" not found for provider "${providerId}"`, timestamp: new Date().toISOString() }
    return
  }

  const isWindows = process.platform === "win32"
  const shell = binding.shell ?? (isWindows ? "cmd.exe" : undefined)
  const command = binding.command
  const args = binding.args ?? []

  yield { type: "stdout", data: `$ ${command} ${args.join(" ")}\n`, timestamp: new Date().toISOString() }

  const child = spawn(command, args, {
    cwd: cwd ?? process.cwd(),
    env: { ...process.env as Record<string, string>, ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"],
    ...(shell ? { shell } : {}),
  })

  let stdout = ""
  let stderr = ""
  const pending: CommandOutputChunk[] = []
  let notify: (() => void) | null = null
  const push = (chunk: CommandOutputChunk) => {
    pending.push(chunk)
    notify?.()
    notify = null
  }

  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf-8")
  })

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8")
    stderr += text
    push({ type: "stderr", data: text, timestamp: new Date().toISOString() })
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
    const item = pending.shift()
    if (item) {
      yield item
      continue
    }
    await new Promise<void>((resolve) => { notify = resolve })
  }
  await exitPromise

  if (exitCode === null) {
    yield { type: "error", data: "Command failed to start", timestamp: new Date().toISOString() }
    return
  }

  // Yield the full stdout as a single chunk for display
  // But split if it's large to not overwhelm
  if (stdout.length > 0) {
    // If JSON output, try to pretty-print
    if (binding.outputStyle === "json") {
      try {
        const parsed = JSON.parse(stdout)
        const formatted = JSON.stringify(parsed, null, 2)
        yield { type: "stdout", data: formatted, timestamp: new Date().toISOString() }
      } catch {
        yield { type: "stdout", data: stdout, timestamp: new Date().toISOString() }
      }
    } else {
      yield { type: "stdout", data: stdout, timestamp: new Date().toISOString() }
    }
  }

  yield { type: "complete", data: JSON.stringify({ exitCode, stdout, stderr }), timestamp: new Date().toISOString() }
}

/**
 * Execute a command and return the full result (non-streaming).
 */
export async function runCommandSync(
  providerId: string,
  commandId: string,
  cwd?: string,
): Promise<CommandRunResult> {
  const commands = registry.get(providerId)
  const binding = commands?.find((c) => c.id === commandId)
  if (!binding) {
    throw new Error(`Command "${commandId}" not found for provider "${providerId}"`)
  }

  const startTime = Date.now()
  const chunks: CommandOutputChunk[] = []

  for await (const chunk of runCommand(providerId, commandId, cwd)) {
    chunks.push(chunk)
  }

  const durationMs = Date.now() - startTime
  const stdout = chunks.filter((c) => c.type === "stdout").map((c) => c.data).join("")
  const stderr = chunks.filter((c) => c.type === "stderr").map((c) => c.data).join("")
  const completeChunk = chunks.find((c) => c.type === "complete")
  const exitCode = completeChunk ? (JSON.parse(completeChunk.data) as { exitCode: number | null }).exitCode : null
  const errorChunk = chunks.find((c) => c.type === "error")

  const raw = stdout + (stderr ? `\n--- stderr ---\n${stderr}` : "")
  const parsed = tryParseOutput(raw, binding.outputStyle)

  return {
    commandId,
    providerId,
    label: binding.label,
    raw,
    parsed,
    displayStyle: binding.outputStyle,
    columns: binding.columns,
    exitCode,
    durationMs,
    timestamp: new Date().toISOString(),
  }
}

// ── Output Parsing Helpers ──────────────────────────────────────────────

function tryParseOutput(raw: string, style: CommandOutputStyle): unknown {
  if (style === "json" || style === "table") {
    try {
      return JSON.parse(raw)
    } catch {
      // Try to find JSON within the output
      const jsonMatch = raw.match(/\{.*\}/s) ?? raw.match(/\[.*\]/s)
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]) } catch { /* fall through */ }
      }
    }
  }
  if (style === "table") {
    // Return lines for table parsing
    return raw.split("\n").filter((l) => l.trim()).map((l) => ({ line: l }))
  }
  return raw
}

// ── Built-in Command Templates ──────────────────────────────────────────

export const BUILTIN_COMMANDS: Record<string, ProviderCommandBinding[]> = {
  kiro: [
    {
      id: "models",
      label: "Model List",
      description: "List KIRO models without sending a chat prompt.",
      command: "kiro-cli",
      args: ["chat", "--list-models", "--format", "json"],
      outputStyle: "json",
      columns: [
        { key: "model_name", label: "Model" },
        { key: "description", label: "Description" },
        { key: "context_window_tokens", label: "Context" },
      ],
      consumesTokens: false,
      category: "Models",
    },
    {
      id: "usage",
      label: "Usage Balance",
      description: "Read KIRO usage and balance without sending a chat prompt.",
      command: "kiro-cli",
      args: ["whoami"],
      outputStyle: "text",
      consumesTokens: false,
      category: "Billing",
    },
    {
      id: "pricing",
      label: "Pricing",
      description: "Read KIRO price table without sending a chat prompt.",
      command: "kiro-cli",
      args: ["settings"],
      outputStyle: "text",
      consumesTokens: false,
      category: "Billing",
    },
  ],
  codex: [
    {
      id: "version",
      label: "Version",
      description: "Show codex CLI version",
      command: "codex",
      args: ["--version"],
      outputStyle: "text",
      consumesTokens: false,
      icon: "🔢",
      category: "Info",
    },
    {
      id: "features",
      label: "Feature Flags",
      description: "List all codex feature flags and their status",
      command: "codex",
      args: ["features", "list"],
      outputStyle: "table",
      columns: [
        { key: "name", label: "Feature" },
        { key: "stage", label: "Stage" },
        { key: "enabled", label: "Enabled" },
      ],
      consumesTokens: false,
      icon: "⚙️",
      category: "Info",
    },
    {
      id: "model-config",
      label: "Model Config",
      description: "Read ~/.codex/config.toml for model info",
      command: process.platform === "win32" ? "cmd.exe" : "cat",
      args: process.platform === "win32"
        ? ["/c", `type "${process.env.USERPROFILE}\\.codex\\config.toml"`]
        : ["~/.codex/config.toml"],
      outputStyle: "code",
      consumesTokens: false,
      icon: "📋",
      category: "Config",
    },
    {
      id: "help-exec",
      label: "Exec Flags",
      description: "Show all codex exec flags",
      command: "codex",
      args: ["exec", "--help"],
      outputStyle: "text",
      consumesTokens: false,
      icon: "📖",
      category: "Help",
    },
  ],
}

/**
 * Register built-in commands for all known providers.
 */
export function registerBuiltinCommands(): void {
  for (const [providerId, commands] of Object.entries(BUILTIN_COMMANDS)) {
    bindCommands(providerId, commands)
  }
}
