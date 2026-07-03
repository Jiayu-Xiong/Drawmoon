import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import type { CliProbe } from "./types.js"

export function probeCopilotExtensions(): CliProbe {
  const started = Date.now()
  const roots = [
    join(homedir(), ".vscode", "extensions"),
    join(homedir(), ".vscode-insiders", "extensions"),
    join(homedir(), ".cursor", "extensions"),
  ]
  const matches: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    try {
      for (const item of readdirSync(root, { withFileTypes: true })) {
        if (item.isDirectory() && /copilot/i.test(item.name)) {
          matches.push(join(root, item.name))
        }
      }
    } catch {
      // Extension directory probing is best-effort.
    }
  }
  return {
    id: "copilot-editor-extensions",
    label: "Editor Copilot extensions",
    command: "scan VS Code/Cursor extension folders",
    available: matches.length > 0,
    exitCode: matches.length > 0 ? 0 : 1,
    stdout: matches.join("\n"),
    stderr: matches.length > 0 ? "" : "No Copilot-like editor extensions found in standard folders.",
    durationMs: Date.now() - started,
  }
}
