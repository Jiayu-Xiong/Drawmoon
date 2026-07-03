import { describe, expect, test } from "bun:test"
import { previewCliStrategy } from "./cli-strategy-preview.js"
import { lookupSystemToolMapping, toolMappingCatalog } from "./tool-mapping.js"

describe("tool mapping catalog", () => {
  test("maps workflow system tools to OpenCode builtins", () => {
    expect(lookupSystemToolMapping("read_file")?.opencodeToolId).toBe("read")
    expect(lookupSystemToolMapping("read_file")?.source).toBe("systemed")
    expect(lookupSystemToolMapping("latex_patch")?.opencodeToolId).toBe("patch")
    expect(lookupSystemToolMapping("artifact_link")?.opencodeToolId).toBe("read")
    expect(lookupSystemToolMapping("codex_exec")?.source).toBe("static")
    expect(lookupSystemToolMapping("read")?.source).toBe("opencode-native")
  })

  test("catalog exposes all mappings", () => {
    const catalog = toolMappingCatalog()
    expect(catalog.systemTools.some((m) => m.systemToolId === "edit_file")).toBe(true)
    expect(catalog.opencodeNativeTools.some((m) => m.systemToolId === "patch")).toBe(true)
  })
})

describe("cli strategy preview", () => {
  test("codex preview exposes config.toml not placeholder text", async () => {
    const preview = await previewCliStrategy({
      provider: "codex",
      mode: "build",
      controlSurface: "cli-owned",
      allowedTools: ["codex_exec", "read_file", "edit_file"],
    })
    expect(preview.cliLabel).toBe("Codex")
    expect(preview.exposedKv.some((kv) => kv.key === "config.toml" || kv.key.startsWith("config."))).toBe(true)
    expect(preview.exposedKv.some((kv) => kv.value.includes("Use the local Codex CLI default"))).toBe(false)
    expect(preview.tools.some((t) => t.systemToolId === "read_file" && t.source === "systemed")).toBe(true)
  })

  test("kiro preview exposes runtime envelope", async () => {
    const preview = await previewCliStrategy({
      provider: "kiro",
      mode: "chat",
      model: "kiro/kiro_default",
      controlSurface: "cli-owned",
    })
    expect(preview.cliLabel).toBe("KIRO")
    expect(preview.exposedKv.some((kv) => kv.key === "runtime.argv")).toBe(true)
  })

  test("opencode preview still loads vendor content", async () => {
    const preview = await previewCliStrategy({
      provider: "opencode",
      mode: "build",
      model: "kuaipao/gpt-4o",
      controlSurface: "customizable",
      constraints: { allowedTools: ["read_file", "latex_patch"] },
      editableOverlayKeys: ["defaultSystemPrompt"],
    })
    expect(preview.opencodeAgent).toBe("build")
    expect(preview.exposedKv.length).toBeGreaterThan(10)
    expect(preview.tools.some((t) => t.systemToolId === "latex_patch" && t.opencodeToolId === "patch")).toBe(true)
  })
})
