import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { readDrawmoonProfile, type PathAliasRule } from "../../drawmoon/profiles.js"
import type { Blackboard } from "./blackboard.js"

function normalizePath(name: string) {
  return name.replace(/^\/+/, "").replace(/\\/g, "/")
}

function basenameOf(name: string) {
  return normalizePath(name).split("/").pop() ?? name
}

function findByBasename(rootDir: string, baseName: string, depth = 0): string | null {
  if (depth > 8) return null
  const direct = join(rootDir, baseName)
  if (existsSync(direct) && statSync(direct).isFile()) return direct
  let entries: string[]
  try {
    entries = readdirSync(rootDir)
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = join(rootDir, entry)
    try {
      if (!statSync(full).isDirectory()) continue
    } catch {
      continue
    }
    const found = findByBasename(full, baseName, depth + 1)
    if (found) return found
  }
  return null
}

function applyAliasRules(fileName: string, rules: PathAliasRule[]): string[] {
  const normalized = normalizePath(fileName)
  const aliases = new Set<string>([normalized])
  for (const rule of rules) {
    const matchesPrefix = rule.prefix ? normalized.startsWith(normalizePath(rule.prefix)) : true
    const matchesBasename = rule.basenamePattern
      ? new RegExp(rule.basenamePattern, "i").test(basenameOf(normalized))
      : true
    if (!matchesPrefix || !matchesBasename) continue
    if (rule.stripPrefix && normalized.startsWith(normalizePath(rule.stripPrefix))) {
      aliases.add(normalizePath(normalized.slice(normalizePath(rule.stripPrefix).length)))
    }
    for (const alias of rule.aliases) {
      const rest = rule.prefix && normalized.startsWith(normalizePath(rule.prefix))
        ? normalized.slice(normalizePath(rule.prefix).length).replace(/^\//, "")
        : basenameOf(normalized)
      aliases.add(normalizePath(
        alias.replace(/\{normalized\}/g, normalized).replace(/\{rest\}/g, rest).replace(/\{basename\}/g, basenameOf(normalized)),
      ))
    }
  }
  return [...aliases]
}

export interface ResolvedFile {
  path: string
  exists: boolean
  reconciled?: boolean
}

export function resolveWorkspaceFile(
  workspaceDir: string,
  name: string,
  blackboard?: Blackboard,
  rules?: PathAliasRule[],
): ResolvedFile {
  const normalized = normalizePath(name)
  const bbPath = blackboard?.resolvePath(normalized) ?? blackboard?.resolvePath(basenameOf(normalized))
  if (bbPath) return { path: bbPath, exists: true }

  const aliasRules = rules ?? readDrawmoonProfile()?.pathAliases
  const aliases = aliasRules?.length ? applyAliasRules(name, aliasRules) : [normalized]

  for (const alias of aliases) {
    const candidate = join(workspaceDir, alias)
    if (existsSync(candidate)) return { path: alias, exists: true }
  }

  const baseName = basenameOf(name)
  if (baseName && baseName !== normalized) {
    const found = findByBasename(workspaceDir, baseName)
    if (found) {
      return {
        path: relative(workspaceDir, found).replace(/\\/g, "/"),
        exists: true,
        reconciled: true,
      }
    }
  }
  return { path: normalized, exists: false }
}

export function readWorkspaceFile(workspaceDir: string, resolved: ResolvedFile): string | null {
  if (!resolved.exists) return null
  try {
    return readFileSync(join(workspaceDir, resolved.path), "utf-8").trim()
  } catch {
    return null
  }
}

import { sliceByAnchor } from "./handoff.js"

export function sliceText(text: string, slice?: string): string {
  if (!slice?.trim()) return text
  return sliceByAnchor(text, slice)
}
