import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { unzipSync } from "fflate"

import { scanLibraryManifest } from "../src/drawmoon/library.js"
import { drawmoonSkillsDir } from "../src/drawmoon/paths.js"

function agentRepoRoot() {
  return join(import.meta.dirname, "../../../..")
}

function writeEntry(dest: string, name: string, data: Uint8Array) {
  const out = join(dest, name)
  if (name.endsWith("/")) {
    mkdirSync(out, { recursive: true })
    return
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, data)
}

function extractHumanizer(skillsDir: string) {
  const zipPath = join(agentRepoRoot(), "humanizer-main.zip")
  if (!existsSync(zipPath)) throw new Error(`missing ${zipPath}`)
  const dest = join(skillsDir, "humanizer")
  const entries = unzipSync(readFileSync(zipPath))
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith("humanizer-main/")) continue
    const rel = name.slice("humanizer-main/".length)
    if (!rel) continue
    writeEntry(dest, rel, data)
  }
  console.log(`installed skill: humanizer -> ${dest}`)
}

function extractDrawSkill(skillsDir: string) {
  const zipPath = join(agentRepoRoot(), "jiayu-drawskill.zip")
  if (!existsSync(zipPath)) throw new Error(`missing ${zipPath}`)
  const dest = join(skillsDir, "drawio-grid-figures")
  const entries = unzipSync(readFileSync(zipPath))
  for (const [name, data] of Object.entries(entries)) {
    if (name === "SKILL.md" || name.startsWith("agents/") || name.startsWith("references/") || name.startsWith("scripts/")) {
      writeEntry(dest, name, data)
    }
  }
  console.log(`installed skill: drawio-grid-figures -> ${dest}`)
}

const skillsDir = drawmoonSkillsDir()
extractHumanizer(skillsDir)
extractDrawSkill(skillsDir)
const manifest = scanLibraryManifest()
console.log(`library rescan: ${manifest.skills.length} skills`)
