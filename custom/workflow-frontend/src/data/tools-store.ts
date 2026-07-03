import { createSignal } from "solid-js"

import {
  fetchCustomToolSpec,
  fetchDrawmoonRoot,
  fetchLibraryManifest,
  fetchToolCatalog,
  type CustomToolSpec,
  type DrawmoonLibraryManifest,
  type ToolCatalog,
} from "../api/drawmoon"

export interface ToolsCacheSnapshot {
  manifest: DrawmoonLibraryManifest | null
  catalog: ToolCatalog | null
  root: string
  customToolSpec: CustomToolSpec | null
  loadedAt: number
}

let cache: ToolsCacheSnapshot | null = null
let loadPromise: Promise<ToolsCacheSnapshot> | null = null

export const [toolsCacheVersion, setToolsCacheVersion] = createSignal(0)
export const [toolsRevalidating, setToolsRevalidating] = createSignal(false)

export function getToolsCacheSnapshot(): ToolsCacheSnapshot | null {
  return cache
}

export function invalidateToolsCache() {
  cache = null
  loadPromise = null
  setToolsCacheVersion((value) => value + 1)
}

export async function ensureToolsLoaded(options?: { force?: boolean }): Promise<ToolsCacheSnapshot> {
  if (cache && !options?.force) return cache
  if (loadPromise && !options?.force) return loadPromise

  const revalidating = Boolean(cache)
  if (revalidating) setToolsRevalidating(true)

  loadPromise = (async () => {
    try {
      const [manifest, rootInfo, catalog, customToolSpec] = await Promise.all([
        fetchLibraryManifest(),
        fetchDrawmoonRoot().catch(() => ({ root: "~/.drawmoon" })),
        fetchToolCatalog().catch(() => null),
        fetchCustomToolSpec().catch(() => null),
      ])
      cache = {
        manifest,
        catalog,
        root: rootInfo.root,
        customToolSpec,
        loadedAt: Date.now(),
      }
      setToolsCacheVersion((value) => value + 1)
      return cache
    } catch (error) {
      if (cache) return cache
      throw error
    } finally {
      setToolsRevalidating(false)
      loadPromise = null
    }
  })()

  return loadPromise
}

export function patchToolsCache(patch: Partial<Omit<ToolsCacheSnapshot, "loadedAt">>) {
  if (!cache) {
    cache = {
      manifest: null,
      catalog: null,
      root: "~/.drawmoon",
      customToolSpec: null,
      loadedAt: Date.now(),
      ...patch,
    }
  } else {
    cache = { ...cache, ...patch, loadedAt: Date.now() }
  }
  setToolsCacheVersion((value) => value + 1)
}
