import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

import { drawmoonRuntimeDir, drawmoonWorkflowOutputDir } from "../drawmoon/paths.js"

/** Resolve agent project root when runtime uses a repo-local data dir (dev/tests). */
export function projectRootFromDataDir(dataDir: string) {
  const runtimeRoot = join(dataDir, "..")
  if (existsSync(join(runtimeRoot, "src", "workflow-runs")) || existsSync(join(runtimeRoot, "src", "server.ts"))) {
    return resolve(dataDir, "..", "..", "..", "..")
  }
  return resolve(dataDir, "..")
}

/** Canonical workflow artifact directories for a runtime data dir. */
export class WorkflowOutputPaths {
  constructor(private readonly dataDir: string) {}

  get outputRoot() {
    if (resolve(this.dataDir) === resolve(drawmoonRuntimeDir())) {
      return drawmoonWorkflowOutputDir()
    }
    return join(projectRootFromDataDir(this.dataDir), "workflow-output")
  }

  runDir(runId: string) {
    return join(this.outputRoot, "runs", runId)
  }

  legacyDataOutputPath(relative: string) {
    return join(this.dataDir, "output", relative)
  }

  joinOutput(relative: string) {
    return join(this.outputRoot, relative)
  }
}

export const DEFAULT_WORKFLOW_OUTPUT_CWD = "workflow-output"
