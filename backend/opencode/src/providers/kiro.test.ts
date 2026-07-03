import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"

import { kiroProvider, normalizeKiroTrustToolsArg } from "./kiro.js"

describe("normalizeKiroTrustToolsArg", () => {
  test("adds fs_write when only fs_read is trusted", () => {
    expect(normalizeKiroTrustToolsArg("--trust-tools=fs_read")).toBe("--trust-tools=fs_read,fs_write")
  })

  test("leaves fs_write when already present", () => {
    expect(normalizeKiroTrustToolsArg("--trust-tools=fs_read,fs_write")).toBe("--trust-tools=fs_read,fs_write")
  })

  test("passes through unrelated args", () => {
    expect(normalizeKiroTrustToolsArg("--no-interactive")).toBe("--no-interactive")
  })
})

describe("kiroProvider", () => {
  test("detect finds kiro-cli without sending a chat prompt", async () => {
    const info = await kiroProvider.detect()
    if (!info.available) {
      console.warn("kiro-cli not on PATH — skipping availability assertion")
      return
    }
    expect(info.path).toBeTruthy()
    expect(info.id).toBe("kiro")
  })

  test("prepare injects model and upgrades trust-tools for review", async () => {
    const prepared = await kiroProvider.prepare({
      config: {
        provider: "kiro",
        mode: "review",
        cwd: process.cwd(),
        prompt: "dry-run prompt — do not execute",
        contextMode: "fresh",
        customCommand: "kiro-cli",
        customArgs: [
          "chat",
          "--no-interactive",
          "--wrap",
          "never",
          "--trust-tools=fs_read",
          "--agent",
          "kiro_default",
          "{{prompt}}",
        ],
        model: "deepseek-3.2",
      },
      cwd: process.cwd(),
    })
    expect(prepared.command).toContain("kiro")
    expect(prepared.args).toContain("--model")
    expect(prepared.args).toContain("deepseek-3.2")
    const trust = prepared.args.find((arg) => arg.startsWith("--trust-tools="))
    expect(trust).toContain("fs_write")
    expect(prepared.stdin).toContain("dry-run prompt")
    expect(prepared.args).not.toContain("{{prompt}}")
  })

  test("kiro-cli --version exits 0 without chat", () => {
    const result = spawnSync("kiro-cli", ["--version"], {
      encoding: "utf-8",
      timeout: 10_000,
      ...(process.platform === "win32" ? { shell: true } : {}),
    })
    if (result.status !== 0) {
      console.warn("kiro-cli --version unavailable — skipping")
      return
    }
    expect(result.stdout).toMatch(/kiro-cli/i)
  })
})
