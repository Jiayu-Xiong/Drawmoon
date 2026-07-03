/** Normalize workflow-output URLs to a stable file identity. */
function normalizeWorkflowOutputPath(pathname: string): string {
  const runs = pathname.match(/\/workflow-output\/runs\/[^/]+\/(.+)$/i)
  if (runs?.[1]) return runs[1].replace(/\\/g, "/").toLowerCase()
  const workspace = pathname.match(/\/workflow-output\/workflow\/[^/]+\/(.+)$/i)
  if (workspace?.[1]) return workspace[1].replace(/\\/g, "/").toLowerCase()
  const direct = pathname.match(/\/workflow-output\/(.+)$/i)
  if (direct?.[1]) return direct[1].replace(/\\/g, "/").toLowerCase()
  return pathname.replace(/\\/g, "/").toLowerCase()
}

/** Stable viewer identity — ignores volatile query params and run/workspace path prefixes. */
export function canonicalViewerKey(href: string): string {
  const raw = href.trim()
  if (!raw) return ""
  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost")
    const params = new URLSearchParams(url.search)
    params.delete("runId")
    params.delete("_")
    params.delete("t")
    const query = params.toString()
    const path = normalizeWorkflowOutputPath(url.pathname)
    return query ? `${path}?${query}` : path
  } catch {
    const stripped = raw
      .replace(/[?&]runId=[^&]*/g, "")
      .replace(/[?&]_=[^&]*/g, "")
      .replace(/[?&]t=[^&]*/g, "")
      .replace(/\?$/, "")
    const pathOnly = stripped.split("?")[0] ?? stripped
    const query = stripped.includes("?") ? stripped.slice(stripped.indexOf("?") + 1) : ""
    const path = normalizeWorkflowOutputPath(pathOnly)
    return query ? `${path}?${query}` : path
  }
}

export function artifactViewerKey(artifact: { href: string; label?: string; kind?: string; nodeId?: string }): string {
  const pathKey = canonicalViewerKey(artifact.href)
  if (pathKey) return artifact.nodeId ? `${artifact.nodeId}:${pathKey}` : pathKey
  return `${artifact.nodeId ?? "file"}:${artifact.kind ?? "file"}:${artifact.label ?? "artifact"}`
}

/**
 * Preserve object identity for unchanged artifacts across reactive ticks.
 *
 * Solid's built-in `<For>` keys by object reference (it has no `by` prop), so an
 * artifact list rebuilt with fresh objects on every stream tick makes `<For>`
 * tear down and recreate its children — which remounts the PDF iframe (a DOM
 * re-insertion reloads it) and re-runs the markdown `createResource`, causing the
 * "appear/disappear" flicker and jank. Reuse the previous object whenever its
 * viewer key + content are unchanged so `<For>` keeps the existing DOM, and
 * return the previous array wholesale when nothing changed.
 */
export function reuseArtifactIdentities<T extends { href: string; label?: string; kind?: string; nodeId?: string }>(
  prev: readonly T[] | undefined,
  next: T[],
): T[] {
  if (!prev || prev.length === 0) return next
  const prevByKey = new Map(prev.map((item) => [artifactViewerKey(item), item] as const))
  let changed = next.length !== prev.length
  const merged = next.map((item, index) => {
    const reused = prevByKey.get(artifactViewerKey(item))
    if (
      reused
      && reused.href === item.href
      && reused.kind === item.kind
      && reused.label === item.label
      && reused.nodeId === item.nodeId
    ) {
      if (reused !== prev[index]) changed = true
      return reused
    }
    changed = true
    return item
  })
  return changed ? merged : (prev as T[])
}
