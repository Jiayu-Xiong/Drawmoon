import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { getLocalCliInfoFast } from "./cli-info.js"
import { BUILTIN_COMMANDS, getAllCommands, registerBuiltinCommands } from "./command-registry.js"

/**
 * Cross-machine CLI auto-detection smoke tests.
 *
 * The live per-provider probes spawn real CLIs and are therefore
 * machine-dependent (documented as manual smoke steps in the findings). These
 * tests pin down the machine-independent surfaces: the fast snapshot contract
 * returned immediately by GET /cli/info, the codex config-file detection, and
 * the platform-branch behavior for Copilot detection.
 */

function withHome(): { dir: string; restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "cli-home-"))
  const prevHome = process.env.HOME
  const prevUser = process.env.USERPROFILE
  process.env.HOME = dir
  process.env.USERPROFILE = dir
  return {
    dir,
    restore() {
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome
      if (prevUser === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUser
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
  return () => Object.defineProperty(process, "platform", original)
}

describe("CLI fast snapshot contract", () => {
  let home: { dir: string; restore: () => void }
  beforeEach(() => { home = withHome() })
  afterEach(() => { home.restore() })

  test("fast snapshot returns all four providers as not-yet-probed", async () => {
    const info = await getLocalCliInfoFast()
    // The immediate snapshot must never claim a live-probed CLI is available.
    expect(info.opencode.available).toBe(false)
    expect(info.kiro.available).toBe(false)
    // No codex config in the isolated HOME.
    expect(info.codex.available).toBe(false)
    // Shape present for every provider so the UI can render immediately.
    expect(info.codex).toBeDefined()
    expect(info.copilot).toBeDefined()
    expect(info.kiro).toBeDefined()
    expect(info.opencode).toBeDefined()
    const providerIds = info.liveSnapshots.map((s) => s.providerId).sort()
    expect(providerIds).toEqual(["codex", "copilot", "kiro", "opencode"])
  })

  test("codex is detected from ~/.codex/config.toml without spawning", async () => {
    mkdirSync(join(home.dir, ".codex"), { recursive: true })
    writeFileSync(
      join(home.dir, ".codex", "config.toml"),
      'model = "o3"\nmodel_reasoning_effort = "high"\nsandbox = "workspace-write"\n',
      "utf-8",
    )
    const info = await getLocalCliInfoFast()
    expect(info.codex.available).toBe(true)
    expect(info.codex.configExists).toBe(true)
    expect(info.codex.model).toBe("o3")
    expect(info.codex.reasoningEffort).toBe("high")
  })
})

describe("Copilot detection platform branches (BUG#12)", () => {
  let home: { dir: string; restore: () => void }
  beforeEach(() => { home = withHome() })
  afterEach(() => { home.restore() })

  test("non-Windows fast snapshot never detects Copilot (even if on PATH)", async () => {
    const restore = withPlatform("linux")
    try {
      const info = await getLocalCliInfoFast()
      // Confirmed defect: on macOS/Linux the fast snapshot hardcodes copilot as
      // unavailable regardless of a `copilot` binary on PATH.
      expect(info.copilot.available).toBe(false)
      const snap = info.liveSnapshots.find((s) => s.providerId === "copilot")!
      expect(snap.path).toBe("copilot")
    } finally {
      restore()
    }
  })

  test("Windows fast snapshot looks only in the npm global path", async () => {
    const restore = withPlatform("win32")
    try {
      const info = await getLocalCliInfoFast()
      const snap = info.liveSnapshots.find((s) => s.providerId === "copilot")!
      // Windows-only assumption: copilot.cmd under the npm global directory.
      expect(String(snap.path).replace(/\\/g, "/")).toContain("npm/copilot.cmd")
      // Not present in the isolated HOME, so unavailable.
      expect(info.copilot.available).toBe(false)
    } finally {
      restore()
    }
  })
})

describe("provider command registry", () => {
  test("built-in bound commands exist for the CLI providers", () => {
    registerBuiltinCommands()
    const commands = getAllCommands()
    // At least one CLI provider ships built-in detection/status commands.
    const builtinKeys = Object.keys(BUILTIN_COMMANDS)
    expect(builtinKeys.length).toBeGreaterThan(0)
    for (const provider of builtinKeys) {
      expect(Array.isArray(commands[provider])).toBe(true)
      expect(commands[provider]!.length).toBeGreaterThan(0)
    }
  })
})
