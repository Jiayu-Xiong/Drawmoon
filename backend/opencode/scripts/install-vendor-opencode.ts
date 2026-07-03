import { existsSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

import { vendoredOpencodeCliDir, xyMonorepoRoot } from "../src/lib/monorepo-paths.js"

const monorepoRoot = join(xyMonorepoRoot(), "backend", "opencode", "vendor", "opencode")
const cliDir = vendoredOpencodeCliDir()
const corePkg = join(monorepoRoot, "packages", "core", "package.json")

if (!existsSync(corePkg)) {
  console.error(`[vendor-opencode] incomplete vendor tree: missing ${corePkg}`)
  console.error("Restore from git: git checkout HEAD -- packages && robocopy packages backend/opencode/vendor/opencode/packages /E")
  process.exit(1)
}

console.log(`[vendor-opencode] installing workspace in ${monorepoRoot}`)
const install = spawnSync(process.platform === "win32" ? "bun.cmd" : "bun", ["install"], {
  cwd: monorepoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
})
if (install.status !== 0) process.exit(install.status ?? 1)

console.log(`[vendor-opencode] CLI package: ${cliDir}`)
console.log("[vendor-opencode] headless bunfig: packages/opencode/bunfig.toml (no TUI preload)")
console.log("[vendor-opencode] done")
