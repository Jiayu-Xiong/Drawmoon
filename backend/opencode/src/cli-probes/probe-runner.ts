import { spawnSync } from "node:child_process"

import type { CliProbe } from "./types.js"

function probeResult(
  id: string,
  label: string,
  command: string,
  started: number,
  result: ReturnType<typeof spawnSync>,
): CliProbe {
  return {
    id,
    label,
    command,
    available: !result.error && result.status === 0,
    exitCode: result.status,
    stdout: (result.stdout ?? "").toString().trim(),
    stderr: (result.stderr ?? result.error?.message ?? "").toString().trim(),
    durationMs: Date.now() - started,
    note: result.error?.message,
  }
}

function failedProbe(id: string, label: string, command: string, started: number, err: unknown): CliProbe {
  return {
    id,
    label,
    command,
    available: false,
    exitCode: null,
    stdout: "",
    stderr: err instanceof Error ? err.message : String(err),
    durationMs: Date.now() - started,
  }
}

export function runProbe(id: string, label: string, command: string, args: string[], timeoutMs = 5_000): CliProbe {
  const started = Date.now()
  const display = [command, ...args].join(" ")
  try {
    const result = spawnSync(command, args, {
      encoding: "utf-8",
      shell: process.platform === "win32" ? "cmd.exe" : false,
      timeout: timeoutMs,
      windowsHide: true,
    })
    return probeResult(id, label, display, started, result)
  } catch (err) {
    return failedProbe(id, label, display, started, err)
  }
}

export function runFileProbe(id: string, label: string, command: string, args: string[], timeoutMs = 5_000): CliProbe {
  const started = Date.now()
  const display = [command, ...args].join(" ")
  try {
    const result = spawnSync(command, args, {
      encoding: "utf-8",
      shell: false,
      timeout: timeoutMs,
      windowsHide: true,
    })
    return probeResult(id, label, display, started, result)
  } catch (err) {
    return failedProbe(id, label, display, started, err)
  }
}

export function providerInfoProbe(
  id: string,
  label: string,
  command: string,
  available: boolean,
  stdout: string | null,
  note?: string,
): CliProbe {
  return {
    id,
    label,
    command,
    available,
    exitCode: available ? 0 : 1,
    stdout: stdout ?? "",
    stderr: available ? "" : note ?? "unavailable",
    durationMs: 0,
    note,
  }
}

export function parseTableLikeRows(raw: string): Array<Record<string, string>> {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const markdownLines = lines.filter((line) => line.includes("|"))
  if (markdownLines.length >= 2) {
    const split = (line: string) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
    const header = split(markdownLines[0] ?? "").filter(Boolean)
    const rows = markdownLines.slice(1).filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    if (header.length >= 2 && rows.length > 0) {
      return rows.map((line) => {
        const cells = split(line)
        const row: Record<string, string> = {}
        header.forEach((key, index) => {
          row[key] = cells[index] ?? ""
        })
        return row
      })
    }
  }

  const header = (lines[0] ?? "").split(/\s{2,}|\t/).map((cell) => cell.trim()).filter(Boolean)
  if (header.length < 2) return []
  return lines.slice(1).map((line) => {
    const cells = line.split(/\s{2,}|\t/).map((cell) => cell.trim())
    const row: Record<string, string> = {}
    header.forEach((key, index) => {
      row[key] = cells[index] ?? ""
    })
    return row
  })
}
