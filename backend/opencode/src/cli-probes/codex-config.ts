import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export function readCodexConfig() {
  const configPath = join(homedir(), ".codex", "config.toml")
  if (!existsSync(configPath)) return { configPath, text: null }
  try {
    return { configPath, text: readFileSync(configPath, "utf-8") }
  } catch {
    return { configPath, text: null }
  }
}
