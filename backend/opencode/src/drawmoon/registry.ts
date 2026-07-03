import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { drawmoonRegistryDir } from "./paths.js"

export type DrawmoonRegistryBucket = "cli-templates" | "agent-mode-templates" | "llm-api-templates"

export interface DrawmoonRegistryFile<T = unknown> {
  version: 1
  updatedAt: string
  items: T[]
}

function registryPath(bucket: DrawmoonRegistryBucket) {
  return join(drawmoonRegistryDir(), `${bucket}.json`)
}

function emptyFile<T>(): DrawmoonRegistryFile<T> {
  return { version: 1, updatedAt: new Date().toISOString(), items: [] }
}

export function readRegistryBucket<T>(bucket: DrawmoonRegistryBucket): DrawmoonRegistryFile<T> {
  const path = registryPath(bucket)
  if (!existsSync(path)) return emptyFile<T>()
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as DrawmoonRegistryFile<T>
    if (!Array.isArray(parsed.items)) return emptyFile<T>()
    return { version: 1, updatedAt: parsed.updatedAt ?? new Date().toISOString(), items: parsed.items }
  } catch {
    return emptyFile<T>()
  }
}

export function writeRegistryBucket<T>(bucket: DrawmoonRegistryBucket, items: T[]) {
  const payload: DrawmoonRegistryFile<T> = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  }
  writeFileSync(registryPath(bucket), JSON.stringify(payload, null, 2), "utf-8")
  return payload
}

export function readDrawmoonRegistry() {
  return {
    cliTemplates: readRegistryBucket("cli-templates"),
    agentModeTemplates: readRegistryBucket("agent-mode-templates"),
    llmApiTemplates: readRegistryBucket("llm-api-templates"),
  }
}
