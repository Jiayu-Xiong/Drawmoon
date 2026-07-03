/** Minimal md handoff schema: front-matter anchors + slice by heading. */

export interface HandoffKeyEntry {
  key: string
  anchor: string
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/

function parseKeysBlock(fm: string): HandoffKeyEntry[] {
  const lines = fm.split("\n")
  const out: HandoffKeyEntry[] = []
  let inKeys = false
  for (const line of lines) {
    if (/^keys:\s*$/.test(line.trim())) { inKeys = true; continue }
    if (inKeys && /^\S/.test(line) && !line.trim().startsWith("-")) break
    const m = line.match(/^\s*-\s*key:\s*(\S+)\s+anchor:\s*(.+)$/i)
      ?? line.match(/^\s*-\s*(\S+)\s*->\s*(.+)$/)
    if (m) out.push({ key: m[1]!.trim(), anchor: m[2]!.trim() })
  }
  return out
}

export function parseHandoffKeys(text: string): HandoffKeyEntry[] {
  const fm = text.match(FRONTMATTER_RE)?.[1]
  return fm ? parseKeysBlock(fm) : []
}

export function sliceByAnchor(text: string, anchor?: string): string {
  if (!anchor?.trim()) return text
  const keys = parseHandoffKeys(text)
  const entry = keys.find((k) => k.key === anchor || k.anchor === anchor)
  const heading = entry?.anchor ?? anchor
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const byHeading = text.match(new RegExp(`(^|\\n)#+\\s*${escaped}[\\s\\S]*?(?=\\n#+\\s|$)`, "i"))
  if (byHeading?.[0]) return byHeading[0].trim()
  try {
    const re = new RegExp(heading, "i")
    const match = text.match(re)
    if (match?.[0]) return match[0].trim()
  } catch { /* bad regex */ }
  return text
}

/** Strip front-matter; ensure body starts with content (not task instructions). */
export function normalizeHandoff(text: string): string {
  const body = text.replace(FRONTMATTER_RE, "").trim()
  if (parseHandoffKeys(text).length) return body
  const headings = [...body.matchAll(/^(#{1,3})\s+(.+)$/gm)].map((m) => m[2]!.trim())
  if (!headings.length) return body
  const keysYaml = headings.map((h, i) => `  - key: section${i + 1}\n    anchor: ${h}`).join("\n")
  return `---\nkeys:\n${keysYaml}\n---\n\n${body}`
}

export function oneLineSummary(text: string | null, max = 120): string {
  if (!text) return "(missing)"
  const line = text.replace(FRONTMATTER_RE, "").split("\n").find((l) => {
    const t = l.trim()
    return t && !t.startsWith("#") && !t.startsWith("---")
  })
  return (line ?? text).trim().slice(0, max)
}
