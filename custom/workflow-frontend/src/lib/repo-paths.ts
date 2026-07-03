import { BACKEND_OPENCODE_DIR } from "@opencode-ai/backend-opencode/lib/product-paths"

declare const __XY_MONOREPO_ROOT__: string | undefined

function joinPath(root: string, ...segments: string[]): string {
  const sep = root.includes("\\") ? "\\" : "/"
  const parts = [root.replace(/[/\\]+$/, ""), ...segments.map((s) => s.replace(/^[/\\]+|[/\\]+$/g, ""))]
  return parts.filter(Boolean).join(sep)
}

/** Resolve the `xy/` monorepo root (injected by Vite `define`). */
export function xyMonorepoRoot(): string {
  if (typeof __XY_MONOREPO_ROOT__ === "string" && __XY_MONOREPO_ROOT__.trim()) {
    return __XY_MONOREPO_ROOT__
  }
  return ""
}

/** Canonical workflow runtime package under `xy/backend/opencode`. */
export function backendOpencodeDir(): string {
  return joinPath(xyMonorepoRoot(), ...BACKEND_OPENCODE_DIR.split("/"))
}

function readEnv(name: string): string {
  if (typeof process === "undefined") return ""
  const value = process.env?.[name]
  return typeof value === "string" ? value.trim() : ""
}

export function defaultWorkflowCwd(): string {
  return readEnv("WORKFLOW_CWD") || xyMonorepoRoot()
}

export function paperWorkflowCwd(): string {
  const fromEnv = readEnv("WORKFLOW_PAPER_CWD")
  if (fromEnv) return fromEnv
  const fromWorkflow = readEnv("WORKFLOW_CWD")
  if (fromWorkflow) return joinPath(fromWorkflow, "paper")
  const xy = xyMonorepoRoot()
  if (xy) return joinPath(xy, "..", "paper")
  return "paper"
}
