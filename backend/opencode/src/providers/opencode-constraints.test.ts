import { describe, expect, test } from "bun:test"

import type { DrawmoonLibraryManifest } from "../drawmoon/library.js"
import { applyToolConstraintsToOpencodeConfig, resolveMcpServers, resolveSkillPaths } from "./opencode-constraints.js"

const manifest: DrawmoonLibraryManifest = {
  updatedAt: "2026-01-01T00:00:00.000Z",
  skills: [
    { id: "skill-a", name: "Skill A", path: "/library/skills/skill-a" },
    { id: "skill-b", name: "Skill B", path: "/library/skills/skill-b" },
  ],
  mcp: [
    { id: "mcp-a", name: "MCP A", path: "/library/mcp/mcp-a.json" },
    { id: "mcp-b", name: "MCP B", path: "/library/mcp/mcp-b.json" },
  ],
}

describe("resolveSkillPaths", () => {
  test("returns undefined when constraints inherit", () => {
    expect(resolveSkillPaths({}, manifest)).toBeUndefined()
  })

  test("maps forced skill ids to manifest paths", () => {
    expect(resolveSkillPaths({ forcedSkills: ["skill-b"] }, manifest)).toEqual(["/library/skills/skill-b"])
  })

  test("maps allowed skill ids to manifest paths", () => {
    expect(resolveSkillPaths({ allowedSkills: ["skill-a", "skill-b"] }, manifest)).toEqual([
      "/library/skills/skill-a",
      "/library/skills/skill-b",
    ])
  })
})

describe("resolveMcpServers", () => {
  test("returns undefined when constraints inherit", () => {
    expect(resolveMcpServers({}, manifest)).toBeUndefined()
  })
})

describe("applyToolConstraintsToOpencodeConfig", () => {
  test("injects per-node skill and tool restrictions", () => {
    const config: Record<string, unknown> = { model: "kuaipao/gpt-5.5" }
    applyToolConstraintsToOpencodeConfig(config, {
      forcedSkills: ["skill-a"],
      forcedTools: ["read", "grep"],
    }, manifest)

    expect(config.skills).toEqual({ paths: ["/library/skills/skill-a"] })
    expect(config.tools).toEqual({
      bash: false,
      edit: false,
      write: false,
      read: true,
      grep: true,
      glob: false,
      list: false,
      webfetch: false,
      websearch: false,
      task: false,
      todowrite: false,
      todoread: false,
      skill: false,
      lsp: false,
      patch: false,
    })
  })

  test("latex_build enables bash in sandbox", () => {
    const config: Record<string, unknown> = { model: "deepseek/deepseek-v4-flash" }
    applyToolConstraintsToOpencodeConfig(config, {
      forcedTools: ["latex_build", "read_file", "write_file"],
    }, manifest)
    expect(config.tools).toMatchObject({ bash: true, read: true })
  })

  test("different nodes can bind different skills", () => {
    const nodeA: Record<string, unknown> = {}
    const nodeB: Record<string, unknown> = {}
    applyToolConstraintsToOpencodeConfig(nodeA, { forcedSkills: ["skill-a"] }, manifest)
    applyToolConstraintsToOpencodeConfig(nodeB, { forcedSkills: ["skill-b"] }, manifest)
    expect(nodeA.skills).toEqual({ paths: ["/library/skills/skill-a"] })
    expect(nodeB.skills).toEqual({ paths: ["/library/skills/skill-b"] })
  })
})
