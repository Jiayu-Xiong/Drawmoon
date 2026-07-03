import { describe, expect, test } from "bun:test"

import { previewOpencodeRuntimePayload } from "./opencode-config-preview.js"
import { buildOpencodeConfigObject } from "../providers/opencode-config-builder.js"
import {
  enabledToolsForRuntime,
  nativeToolTogglesForModel,
  usesPatchTool,
} from "../providers/opencode-native-defaults.js"
import { resolveProviderSystemPrompt } from "./opencode-vendor-snapshot.js"

/**
 * Parity invariant: xy-built OPENCODE_CONFIG_CONTENT + vendor prompts must match
 * what native `opencode run --agent build` would expose for the same model/workspace.
 */
describe("OpenCode native parity", () => {
  test("gpt-4o uses edit/write not patch (vendor registry rule)", () => {
    expect(usesPatchTool("gpt-4o")).toBe(false)
    expect(usesPatchTool("gpt-5")).toBe(true)
    const toggles = nativeToolTogglesForModel("gpt-4o")
    expect(toggles.edit).toBe(true)
    expect(toggles.write).toBe(true)
    expect(toggles.patch).toBe(false)
  })

  test("runner and preview share the same config object for build + gpt-4o", () => {
    const model = "kuaipao/gpt-4o"
    const workspaceDir = "/tmp/workflow-node"
    const constraints = { allowedTools: ["read_file", "grep"] as string[] }

    const runnerConfig = buildOpencodeConfigObject({
      model,
      constraints,
      workspaceDir,
      requireApiKey: false,
    })
    const preview = previewOpencodeRuntimePayload({
      mode: "build",
      model,
      constraints,
      workspaceDir,
    })

    expect(preview.opencodeConfig).toEqual(runnerConfig)
    expect(preview.opencodeAgent).toBe("build")
  })

  test("build agent preview loads vendor provider prompt and runtime file tools", () => {
    const preview = previewOpencodeRuntimePayload({
      mode: "build",
      model: "kuaipao/gpt-4o",
      workspaceDir: "/tmp/ws",
    })

    const providerPrompt = resolveProviderSystemPrompt("kuaipao/gpt-4o")
    expect(preview.totals.providerPromptTokens).toBe(providerPrompt.tokens)
    expect(preview.totals.providerPromptTokens).toBeGreaterThan(1000)

    const enabled = enabledToolsForRuntime(preview.opencodeConfig, "kuaipao/gpt-4o")
    expect(enabled).toContain("read")
    expect(enabled).toContain("edit")
    expect(enabled).toContain("write")
    expect(enabled).not.toContain("patch")
    expect(enabled).not.toContain("bash")

    expect(preview.runtimeToolMappings?.some((m) => m.opencodeToolId === "read" && m.source === "systemed")).toBe(true)
  })

  test("system tool constraints map read_file and latex_patch to OpenCode builtins", () => {
    const preview = previewOpencodeRuntimePayload({
      mode: "build",
      model: "kuaipao/gpt-5",
      workspaceDir: "/tmp/ws",
      constraints: { allowedTools: ["read_file", "latex_patch"] },
    })

    const enabled = enabledToolsForRuntime(preview.opencodeConfig, "kuaipao/gpt-5")
    expect(enabled).not.toContain("edit")
    expect(enabled).not.toContain("write")

    expect(preview.runtimeToolMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ systemToolId: "read_file", opencodeToolId: "read", source: "systemed" }),
        expect.objectContaining({ systemToolId: "latex_patch", opencodeToolId: "patch", source: "systemed" }),
      ]),
    )
  })
})
