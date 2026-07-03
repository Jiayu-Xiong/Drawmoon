import { describe, expect, test } from "bun:test"
import { flattenOpencodePreviewToKv, OPENCODE_BUILTIN_TOOLS } from "./opencode-strategy-schema.js"
import { opencodeStrategySchemaOnly, previewOpencodeRuntimePayload } from "./opencode-config-preview.js"
import { resolveProviderSystemPrompt } from "./opencode-vendor-snapshot.js"

describe("opencode strategy exposure", () => {
  test("preview loads vendor provider prompt and tool descriptions", () => {
    const preview = previewOpencodeRuntimePayload({
      mode: "build",
      model: "kuaipao/gpt-4o",
      systemPrompt: "Custom workflow overlay",
      constraints: { allowedTools: ["read", "grep"], forcedMcpServers: ["workflow-io"] },
      editableOverlayKeys: ["defaultSystemPrompt", "forcedMcpServers"],
    })
    expect(preview.exposedKv.length).toBeGreaterThan(10)
    expect(preview.totals.providerPromptTokens).toBeGreaterThan(1000)
    expect(preview.exposedKv.some((kv) => kv.key.startsWith("system."))).toBe(true)
    expect(preview.exposedKv.some((kv) => kv.key.startsWith("tool.") && kv.tokens! > 0)).toBe(true)
    expect(preview.exposedKv.some((kv) => kv.key === "opencodeConfig")).toBe(true)
    expect(preview.exposedKv.some((kv) => kv.key === "overlay.defaultSystemPrompt" && kv.editable)).toBe(true)
    expect(preview.exposedKv.some((kv) => kv.key === "overlay.forcedMcpServers")).toBe(true)
    expect(preview.exposedKv.some((kv) => kv.key === "overlay.forcedTools")).toBe(false)
  })

  test("plan mode includes plan prompts", () => {
    const preview = previewOpencodeRuntimePayload({ mode: "plan", model: "anthropic/claude-sonnet-4-5" })
    expect(preview.opencodeAgent).toBe("plan")
    expect(preview.exposedKv.some((kv) => kv.group === "plan_mode")).toBe(true)
  })

  test("empty overlay keys are omitted", () => {
    const kv = flattenOpencodePreviewToKv({
      opencodeAgent: "build",
      providerPrompt: resolveProviderSystemPrompt("kuaipao/gpt-4o"),
      opencodeConfig: { model: "x/y", tools: { read: true } },
      runtimeEnvelope: { argv: ["opencode"] },
      workflowOverlay: { forcedTools: [] },
    })
    expect(kv.some((item) => item.key === "overlay.forcedTools")).toBe(false)
  })

  test("schema endpoint lists vendor catalog", () => {
    const schema = opencodeStrategySchemaOnly()
    expect(schema.builtinTools).toEqual(OPENCODE_BUILTIN_TOOLS)
    expect(schema.sessionPrompts.length).toBeGreaterThan(5)
    expect(schema.toolMappings.systemTools.some((m) => m.systemToolId === "read_file")).toBe(true)
  })
})
