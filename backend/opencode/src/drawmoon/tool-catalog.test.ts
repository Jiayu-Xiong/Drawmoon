import { describe, expect, test } from "bun:test"

import { OPENCODE_BUILTIN_TOOLS } from "../cli-probes/opencode-strategy-schema.js"
import { buildOpencodeToolsCatalog, buildToolCatalog, buildUnifiedSystemToolsCatalog } from "./tool-catalog.js"

describe("buildToolCatalog", () => {
  test("returns opencodeTools with OPENCODE_BUILTIN_TOOLS length", () => {
    const catalog = buildToolCatalog()
    expect(catalog.opencodeTools).toHaveLength(OPENCODE_BUILTIN_TOOLS.length)
    expect(buildOpencodeToolsCatalog()).toHaveLength(OPENCODE_BUILTIN_TOOLS.length)
    for (const id of OPENCODE_BUILTIN_TOOLS) {
      expect(catalog.opencodeTools.some((tool) => tool.id === id)).toBe(true)
    }
  })

  test("systemTools include workflow-io parameters for read_file", () => {
    const catalog = buildToolCatalog()
    const readFile = catalog.systemTools.find((tool) => tool.systemToolId === "read_file")
    expect(readFile?.parameters?.some((p) => p.name === "path")).toBe(true)
    expect(readFile?.mappedOpencodeParameters?.some((p) => p.name === "filePath")).toBe(true)
  })

  test("buildUnifiedSystemToolsCatalog dedupes opencode mapping targets", () => {
    const unified = buildUnifiedSystemToolsCatalog()
    expect(unified.some((tool) => tool.systemToolId === "read_file")).toBe(true)
    expect(unified.some((tool) => tool.systemToolId === "read")).toBe(false)
    expect(unified.some((tool) => tool.systemToolId === "task")).toBe(true)
    const readFile = unified.find((tool) => tool.systemToolId === "read_file")
    expect(readFile?.mappedOpencodeParameters?.some((p) => p.name === "filePath")).toBe(true)
  })

  test("read_file includes MCP + OpenCode implementation", () => {
    const readFile = buildUnifiedSystemToolsCatalog().find((tool) => tool.systemToolId === "read_file")
    expect(readFile?.implementation?.runtime).toBe("hybrid")
    expect(readFile?.implementation?.mcpServer).toBe("workflow-io")
    expect(readFile?.implementation?.handlerCode).toContain("readFileSync")
    expect(readFile?.implementation?.sourceFiles.some((f) => f.path.includes("mcp-workflow-io"))).toBe(true)
  })
})
