/**
 * Cache system for workflow agent nodes.
 *
 * Supports three cache modes:
 * - off: always execute, never cache
 * - input-only: hash node config and upstream values
 * - files-aware: also hash selected file contents
 */

import { createHash } from "node:crypto"
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from "node:fs"
import { join, resolve, relative } from "node:path"
import { globSync } from "glob"

import type { AgentNodeConfig, CacheInfo, CacheMode, CacheEntry, AgentNodeOutput } from "./schema/types.js"

export interface CacheOptions {
  /** Cache mode */
  mode: CacheMode
  /** Data directory for cache storage */
  dataDir: string
  /** Whether to allow manual bypass */
  allowBypass?: boolean
}

export class AgentCache {
  private dataDir: string
  private mode: CacheMode
  private allowBypass: boolean

  constructor(options: CacheOptions) {
    this.dataDir = join(options.dataDir, "cache")
    this.mode = options.mode
    this.allowBypass = options.allowBypass ?? true

    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }
  }

  /**
   * Generate a cache key from a node config and optional upstream output hash.
   */
  generateKey(config: AgentNodeConfig, upstreamHash?: string): string {
    if (this.mode === "off") {
      return ""
    }

    const hash = createHash("sha256")

    // Provider and mode
    hash.update(config.provider)
    hash.update(config.mode)
    hash.update(config.contextMode)

    // Prompt
    hash.update(config.prompt)

    // Working directory
    hash.update(config.cwd)

    // Max iterations and timeout
    if (config.maxIterations) hash.update(String(config.maxIterations))
    if (config.timeoutMs) hash.update(String(config.timeoutMs))
    hash.update(String(config.allowFileWrites ?? false))

    // Custom command/args
    if (config.customCommand) hash.update(config.customCommand)
    if (config.customArgs) hash.update(JSON.stringify(config.customArgs))

    // Upstream hash
    if (upstreamHash) hash.update(upstreamHash)

    // File hashes (for files-aware mode)
    if (this.mode === "files-aware") {
      this.hashConfigFiles(config, hash)
    }

    return hash.digest("hex")
  }

  /**
   * Hash files referenced in the node config.
   */
  private hashConfigFiles(config: AgentNodeConfig, hash: ReturnType<typeof createHash>): void {
    const filePaths: string[] = []

    if (config.systemPromptFile) filePaths.push(config.systemPromptFile)
    if (config.buildPromptFile) filePaths.push(config.buildPromptFile)
    if (config.plannerFile) filePaths.push(config.plannerFile)
    if (config.subagentFiles) filePaths.push(...config.subagentFiles)
    if (config.cacheFiles) {
      for (const pattern of config.cacheFiles) {
        const resolved = resolve(config.cwd, pattern)
        const matches = globSync(resolved)
        filePaths.push(...matches)
      }
    }

    for (const fp of filePaths) {
      try {
        const content = readFileSync(fp)
        const rel = relative(config.cwd, fp)
        hash.update(rel)
        hash.update(content)
      } catch {
        // File not found or not readable – hash the path as a marker
        hash.update(`__missing:${fp}`)
      }
    }
  }

  /**
   * Try to get a cached result for the given key.
   */
  get(key: string): CacheEntry | null {
    if (!key) return null

    const entryPath = join(this.dataDir, `${key}.json`)
    if (!existsSync(entryPath)) return null

    try {
      const raw = readFileSync(entryPath, "utf-8")
      return JSON.parse(raw) as CacheEntry
    } catch {
      return null
    }
  }

  /**
   * Store a result in the cache.
   */
  set(key: string, output: AgentNodeOutput, configHash: string, fileHashes: Record<string, string>): void {
    if (!key) return

    const entry: CacheEntry = {
      key,
      output,
      configHash,
      fileHashes,
      createdAt: new Date().toISOString(),
    }

    const entryPath = join(this.dataDir, `${key}.json`)
    writeFileSync(entryPath, JSON.stringify(entry, null, 2), "utf-8")
  }

  /**
   * Check cache and return info + result if hit.
   */
  check(config: AgentNodeConfig, upstreamHash?: string, bypass?: boolean): { info: CacheInfo; result: AgentNodeOutput | null } {
    if (this.mode === "off") {
      return {
        info: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
        result: null,
      }
    }

    const key = this.generateKey(config, upstreamHash)

    if (bypass && this.allowBypass) {
      return {
        info: { hit: false, mode: this.mode, key, bypassed: true, createdAt: null },
        result: null,
      }
    }

    const entry = this.get(key)
    if (entry) {
      return {
        info: {
          hit: true,
          mode: this.mode,
          key,
          bypassed: false,
          createdAt: entry.createdAt,
        },
        result: entry.output,
      }
    }

    return {
      info: { hit: false, mode: this.mode, key, bypassed: false, createdAt: null },
      result: null,
    }
  }

  /**
   * Store result in cache after a successful run.
   */
  store(config: AgentNodeConfig, output: AgentNodeOutput, upstreamHash?: string): void {
    if (this.mode === "off") return

    const key = this.generateKey(config, upstreamHash)
    if (!key) return

    // Compute config hash
    const configHash = createHash("sha256")
      .update(JSON.stringify(config))
      .digest("hex")

    // Compute file hashes
    const fileHashes: Record<string, string> = {}
    if (this.mode === "files-aware") {
      const hash = createHash("sha256")
      this.hashConfigFiles(config, hash)
      fileHashes["_composite"] = hash.digest("hex")
    }

    this.set(key, output, configHash, fileHashes)
  }

  /**
   * List all cache entries for inspection.
   */
  list(): { key: string; createdAt: string }[] {
    if (!existsSync(this.dataDir)) return []

    const entries = readdirSync(this.dataDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const key = f.replace(/\.json$/, "")
        try {
          const raw = readFileSync(join(this.dataDir, f), "utf-8")
          const entry = JSON.parse(raw) as CacheEntry
          return { key, createdAt: entry.createdAt }
        } catch {
          return { key, createdAt: "unknown" }
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return entries
  }

  /**
   * Clear all cache entries.
   */
  clear(): number {
    if (!existsSync(this.dataDir)) return 0

    const entries = readdirSync(this.dataDir).filter((f) => f.endsWith(".json"))
    for (const f of entries) {
      try {
        unlinkSync(join(this.dataDir, f))
      } catch {
        // best-effort
      }
    }
    return entries.length
  }
}


