import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { BACKEND_OPENCODE_DIR, VENDORED_OPENCODE_CLI_DIR } from "./product-paths.js"

/** Resolve the `xy/` monorepo root from any file under `backend/opencode/`. */
export function xyMonorepoRoot(fromModuleUrl = import.meta.url): string {
  const here = typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : dirname(fileURLToPath(fromModuleUrl))
  return resolve(here, "..", "..", "..", "..")
}

export function backendOpencodeDir(fromModuleUrl = import.meta.url): string {
  return resolve(xyMonorepoRoot(fromModuleUrl), ...BACKEND_OPENCODE_DIR.split("/"))
}

/** Vendored upstream OpenCode CLI (`backend/opencode/vendor/opencode/packages/opencode`). */
export function vendoredOpencodeCliDir(fromModuleUrl = import.meta.url): string {
  return resolve(xyMonorepoRoot(fromModuleUrl), ...VENDORED_OPENCODE_CLI_DIR.split("/"))
}

/** @deprecated Use {@link vendoredOpencodeCliDir}. */
export function opencodePackageDir(fromModuleUrl = import.meta.url): string {
  return vendoredOpencodeCliDir(fromModuleUrl)
}

export function defaultWorkflowCwd(fromModuleUrl = import.meta.url): string {
  return process.env.WORKFLOW_CWD?.trim() || xyMonorepoRoot(fromModuleUrl)
}
