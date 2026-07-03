import { createSignal } from "solid-js"

import type { RuntimeSnapshot } from "../api"
import { fetchRuntimeSnapshotInDisplayThread } from "../runtime-bridge/display-bridge"
import { getCliInfo } from "../api/runtime-api"
import { markRuntimeSuccess } from "../api/http-client"

let cachedSnapshot: RuntimeSnapshot | null = null
let loadPromise: Promise<RuntimeSnapshot | null> | null = null

export const [runtimeCacheVersion, setRuntimeCacheVersion] = createSignal(0)
export const [runtimeCacheRevalidating, setRuntimeCacheRevalidating] = createSignal(false)

export function getCachedRuntimeSnapshot(): RuntimeSnapshot | null {
  return cachedSnapshot
}

export function invalidateRuntimeCache() {
  cachedSnapshot = null
  loadPromise = null
  setRuntimeCacheVersion((value) => value + 1)
}

export async function ensureRuntimeCache(options?: { force?: boolean; refreshCli?: boolean }): Promise<RuntimeSnapshot | null> {
  if (cachedSnapshot && !options?.force && !options?.refreshCli) return cachedSnapshot
  if (loadPromise && !options?.force && !options?.refreshCli) return loadPromise

  const revalidating = Boolean(cachedSnapshot)
  if (revalidating) setRuntimeCacheRevalidating(true)

  loadPromise = (async () => {
    try {
      const snapshot = await fetchRuntimeSnapshotInDisplayThread()
      if (snapshot) {
        cachedSnapshot = snapshot
        markRuntimeSuccess()
      }
      if (options?.refreshCli) {
        const cli = await getCliInfo().catch(() => null)
        if (cli && cachedSnapshot) {
          cachedSnapshot = {
            ...cachedSnapshot,
            cliInfo: cli.info,
            cliRefreshing: cli.refreshing,
            cliRefreshActive: cli.refreshActive,
          }
        }
      }
      setRuntimeCacheVersion((value) => value + 1)
      return cachedSnapshot
    } catch {
      return cachedSnapshot
    } finally {
      setRuntimeCacheRevalidating(false)
      loadPromise = null
    }
  })()

  return loadPromise
}

export function patchRuntimeCache(patch: Partial<RuntimeSnapshot>) {
  if (!cachedSnapshot) return
  cachedSnapshot = { ...cachedSnapshot, ...patch }
  setRuntimeCacheVersion((value) => value + 1)
}
