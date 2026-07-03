import { describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { zipSync } from "fflate"

import { drawmoonRoot } from "./paths.js"
import { importLibraryZip } from "./library-import.js"

describe("importLibraryZip", () => {
  const root = drawmoonRoot()
  const skillsDir = join(root, "library", "skills")
  const mcpDir = join(root, "library", "mcp")
  const stamp = `import-test-${Date.now()}`

  test("extracts skill folder and mcp json from zip", () => {
    const skillFolder = `${stamp}-skill`
    const mcpId = `${stamp}-mcp`
    const zip = zipSync({
      [`skills/${skillFolder}/SKILL.md`]: new TextEncoder().encode("---\nname: Zip Skill\n---\n\nBody"),
      [`mcp/${mcpId}.json`]: new TextEncoder().encode(JSON.stringify({ name: "Zip MCP", transport: "stdio" })),
    })

    const result = importLibraryZip(zip)
    expect(result.skills).toBeGreaterThanOrEqual(1)
    expect(result.mcp).toBeGreaterThanOrEqual(1)
    expect(readFileSync(join(skillsDir, skillFolder, "SKILL.md"), "utf-8")).toContain("Zip Skill")
    expect(JSON.parse(readFileSync(join(mcpDir, `${mcpId}.json`), "utf-8"))).toMatchObject({ name: "Zip MCP" })

    rmSync(join(skillsDir, skillFolder), { recursive: true, force: true })
    rmSync(join(mcpDir, `${mcpId}.json`), { force: true })
  })
})
