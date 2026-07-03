import { existsSync, readFileSync, statSync } from "node:fs"

const BINARY_OUTPUT_EXT = /\.(pdf|png|jpe?g|gif|webp|zip|tar|gz|bin)$/i

export function isBinaryArtifactPath(path: string): boolean {
  return BINARY_OUTPUT_EXT.test(path.replace(/\\/g, "/"))
}

export function isValidPdfFile(absPath: string, minBytes = 1024): boolean {
  if (!existsSync(absPath)) return false
  try {
    const st = statSync(absPath)
    if (st.size < minBytes) return false
    const head = readFileSync(absPath).subarray(0, 5).toString("ascii")
    return head.startsWith("%PDF-")
  } catch {
    return false
  }
}

export function isValidPngFile(absPath: string, minBytes = 256): boolean {
  if (!existsSync(absPath)) return false
  try {
    const st = statSync(absPath)
    if (st.size < minBytes) return false
    const buf = readFileSync(absPath).subarray(0, 8)
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  } catch {
    return false
  }
}

/** Returns null if valid or not a checked binary type; otherwise an error fragment. */
export function validateBinaryArtifact(absPath: string, relPath: string): string | null {
  const norm = relPath.replace(/\\/g, "/")
  if (norm.endsWith(".pdf")) {
    if (!isValidPdfFile(absPath)) return `invalid or stub PDF (expected %PDF- header, >=1KB): ${norm}`
    return null
  }
  if (/\.png$/i.test(norm)) {
    if (!isValidPngFile(absPath)) return `invalid or stub PNG (expected PNG magic bytes): ${norm}`
    return null
  }
  return null
}

/** Stdout persistence target: never write chat log directly to binary artifact paths. */
export function stdoutPersistFileName(nodeId: string, outputFile: string): string {
  if (!isBinaryArtifactPath(outputFile)) return outputFile
  return `${nodeId}.md`
}
