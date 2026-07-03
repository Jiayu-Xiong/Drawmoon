import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { scanLibraryManifest, type DrawmoonLibraryManifest } from "./library.js"
import {
  foreignSecrets,
  ISOLATION_PROBE_SECRETS,
  type IsolationProbeSide,
} from "./isolation-smoke-probes.js"
import { drawmoonMcpDir, drawmoonSkillsDir } from "./paths.js"

const probeServerScript = fileURLToPath(new URL("../../scripts/mcp-isolation-probe.ts", import.meta.url))

function writeProbeSkill(side: IsolationProbeSide) {
  const id = side === "alpha" ? "skill-alpha" : "skill-beta"
  const secrets = ISOLATION_PROBE_SECRETS[side]
  const foreign = foreignSecrets(side)
  const dir = join(drawmoonSkillsDir(), id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "SKILL.md"), `---
name: ${id}
description: Isolation probe skill for ${side} — reply token exists only in this file.
---

# ${id}

This skill is bound only to the ${side} node.

Your SKILL= reply value must be exactly: ${secrets.skillReplyToken}

You must NOT know or output ${foreign.foreignSkillToken} (belongs to the other node).

After loading this skill, call the MCP probe tool and include its return value as MCP=.
`, "utf-8")
}

function writeProbeMcp(side: IsolationProbeSide) {
  const id = side === "alpha" ? "mcp-alpha" : "mcp-beta"
  const secrets = ISOLATION_PROBE_SECRETS[side]
  writeFileSync(join(drawmoonMcpDir(), `${id}.json`), JSON.stringify({
    name: id,
    description: `Isolation MCP probe for ${side}. Tool returns a secret not present in prompts.`,
    type: "local",
    command: [process.execPath, probeServerScript],
    environment: {
      MCP_PROBE_TOOL: secrets.mcpTool,
      MCP_PROBE_TOKEN: secrets.mcpReplyToken,
    },
  }, null, 2), "utf-8")
}

export function ensureIsolationSmokeLibrary(options?: { force?: boolean }): DrawmoonLibraryManifest {
  mkdirSync(drawmoonSkillsDir(), { recursive: true })
  mkdirSync(drawmoonMcpDir(), { recursive: true })

  const skillAlpha = join(drawmoonSkillsDir(), "skill-alpha", "SKILL.md")
  const skillBeta = join(drawmoonSkillsDir(), "skill-beta", "SKILL.md")
  const mcpAlpha = join(drawmoonMcpDir(), "mcp-alpha.json")
  const mcpBeta = join(drawmoonMcpDir(), "mcp-beta.json")

  const needsSeed = options?.force
    || !existsSync(skillAlpha)
    || !existsSync(skillBeta)
    || !existsSync(mcpAlpha)
    || !existsSync(mcpBeta)

  if (needsSeed) {
    for (const legacy of ["skill-alpha.md", "skill-beta.md"]) {
      const legacyPath = join(drawmoonSkillsDir(), legacy)
      if (existsSync(legacyPath)) unlinkSync(legacyPath)
    }
    writeProbeSkill("alpha")
    writeProbeSkill("beta")
    writeProbeMcp("alpha")
    writeProbeMcp("beta")
  }

  return scanLibraryManifest()
}

export function isolationSmokeLibrarySeeded(): boolean {
  return existsSync(join(drawmoonSkillsDir(), "skill-alpha", "SKILL.md"))
    && existsSync(join(drawmoonSkillsDir(), "skill-beta", "SKILL.md"))
    && existsSync(join(drawmoonMcpDir(), "mcp-alpha.json"))
    && existsSync(join(drawmoonMcpDir(), "mcp-beta.json"))
}

export { ISOLATION_PROBE_NODE_PROMPT, ISOLATION_PROBE_SECRETS, evaluateIsolationOutput } from "./isolation-smoke-probes.js"
