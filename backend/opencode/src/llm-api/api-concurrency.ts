import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { drawmoonRoot } from "../drawmoon/paths.js"

export interface ApiConcurrencyConfig {
  /** apiKeyEnv → max in-flight calls; -1 = unlimited */
  limits: Record<string, number>
}

const CONFIG_PATH = join(drawmoonRoot(), "api-concurrency.json")

const slots = new Map<string, { inFlight: number; waiters: Array<() => void> }>()

function defaultLimit(apiKeyEnv: string): number {
  if (/^KUAIPAO/i.test(apiKeyEnv)) return 1
  return -1
}

export function loadApiConcurrencyConfig(): ApiConcurrencyConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { limits: { KUAIPAO_API_KEY: 1, KUAIPAO_CDK_1_API_KEY: 1 } }
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as ApiConcurrencyConfig
    return { limits: raw.limits ?? {} }
  } catch {
    return { limits: { KUAIPAO_API_KEY: 1, KUAIPAO_CDK_1_API_KEY: 1 } }
  }
}

export function saveApiConcurrencyConfig(config: ApiConcurrencyConfig): ApiConcurrencyConfig {
  const next = {
    limits: Object.fromEntries(
      Object.entries(config.limits).filter(([key]) => key.trim()).map(([key, value]) => [key.trim(), Number(value)]),
    ),
  }
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
  return next
}

export function getApiConcurrencyLimit(apiKeyEnv: string | undefined): number {
  const key = apiKeyEnv?.trim() || "default"
  const { limits } = loadApiConcurrencyConfig()
  if (limits[key] !== undefined) return limits[key]!
  return defaultLimit(key)
}

function slotFor(key: string) {
  let slot = slots.get(key)
  if (!slot) {
    slot = { inFlight: 0, waiters: [] }
    slots.set(key, slot)
  }
  return slot
}

function releaseSlot(key: string) {
  const slot = slotFor(key)
  slot.inFlight = Math.max(0, slot.inFlight - 1)
  const next = slot.waiters.shift()
  if (next) next()
}

/** Serialize (or cap) outbound LLM API calls per apiKeyEnv. limit -1 = no cap. */
export async function withLlmApiConcurrencySlot<T>(apiKeyEnv: string | undefined, fn: () => Promise<T>): Promise<T> {
  const release = await acquireLlmApiConcurrencySlot(apiKeyEnv)
  try {
    return await fn()
  } finally {
    release()
  }
}

export async function acquireLlmApiConcurrencySlot(apiKeyEnv: string | undefined): Promise<() => void> {
  const key = apiKeyEnv?.trim() || "default"
  const limit = getApiConcurrencyLimit(key)
  if (limit < 0) return () => {}

  const slot = slotFor(key)
  if (slot.inFlight >= limit) {
    await new Promise<void>((resolve) => slot.waiters.push(resolve))
  }
  slot.inFlight += 1
  return () => releaseSlot(key)
}
