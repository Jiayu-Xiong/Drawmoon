import { existsSync, readdirSync, statSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"

import type { WorkflowRunRecord } from "./types.js"
import { WorkflowOutputPaths } from "./output-paths.js"
import {
  parseWorkspaceKeyFromPath,
  resolveWorkflowWorkspace,
  workflowWorkspaceAbsPath,
} from "./workspace-paths.js"

export class WorkflowArtifactFileResolver {
  private readonly paths: WorkflowOutputPaths

  constructor(
    dataDir: string,
    private readonly lookupRun?: (runId: string) => WorkflowRunRecord | null,
  ) {
    this.paths = new WorkflowOutputPaths(dataDir)
  }

  resolve(relativePath: string, runIdHint?: string): string | null {
    for (const candidate of this.candidates(relativePath, runIdHint)) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    }
    return null
  }

  private findByBasename(rootDir: string, baseName: string, depth = 0): string | null {
    if (depth > 8) return null
    const direct = join(rootDir, baseName)
    if (existsSync(direct) && statSync(direct).isFile()) return direct
    let entries: string[]
    try {
      entries = readdirSync(rootDir)
    } catch {
      return null
    }
    for (const entry of entries) {
      const full = join(rootDir, entry)
      try {
        if (!statSync(full).isDirectory()) continue
      } catch {
        continue
      }
      const found = this.findByBasename(full, baseName, depth + 1)
      if (found) return found
    }
    return null
  }

  private candidates(relativePath: string, runIdHint?: string): string[] {
    const normalized = relativePath.replace(/^\/+/, "").replace(/\\/g, "/")
    const out = new Set<string>()

    const workspaceKey = parseWorkspaceKeyFromPath(normalized)
    if (workspaceKey) {
      const tail = normalized.replace(/^workflow\/[^/]+\//, "")
      out.add(join(workflowWorkspaceAbsPath(workspaceKey), tail))
    }

    if (!normalized.includes("/")) {
      const runId = runIdHint ?? this.inferRunIdFromBareFile(normalized)
      if (runId) {
        const record = this.lookupRun?.(runId)
        const workspace = record ? resolveWorkflowWorkspace(record) : null
        if (workspace) out.add(join(workspace, normalized))
      }
    }

    out.add(this.paths.joinOutput(normalized))
    out.add(this.paths.legacyDataOutputPath(normalized))

    const envRoot = process.env.WORKFLOW_OUTPUT_ROOT?.trim()
    if (envRoot) out.add(join(resolve(envRoot), normalized))

    const runMatch = normalized.match(/^runs\/([^/]+)\/(.+)$/)
    if (runMatch) {
      const [, runId, fileName] = runMatch
      for (const dir of this.runDirectories(runId!)) {
        out.add(join(dir, fileName!))
      }
    }

    if (runIdHint) {
      const record = this.lookupRun?.(runIdHint)
      const workspace = record ? resolveWorkflowWorkspace(record) : null
      if (workspace) {
        const fileName = normalized
          .replace(/^workflow\/[^/]+\//, "")
          .replace(/^runs\/[^/]+\//, "")
        if (fileName) {
          out.add(join(workspace, fileName))
          const baseName = fileName.split("/").pop()
          if (baseName && baseName !== fileName) {
            const nested = this.findByBasename(workspace, baseName)
            if (nested) out.add(nested)
          }
        }
      }
    }

    const tail = normalized.replace(/^workflow\/[^/]+\//, "").replace(/^runs\/[^/]+\//, "")
    const workspaceFromPath = workspaceKey ? workflowWorkspaceAbsPath(workspaceKey) : null
    if (workspaceFromPath && tail) {
      const baseName = tail.split("/").pop()
      if (baseName && !tail.includes("/")) {
        const nested = this.findByBasename(workspaceFromPath, baseName)
        if (nested) out.add(nested)
      }
    }

    return [...out]
  }

  private inferRunIdFromBareFile(_fileName: string): string | null {
    return null
  }

  private runDirectories(runId: string): string[] {
    const dirs = new Set<string>([this.paths.runDir(runId)])
    const record = this.lookupRun?.(runId)
    const workspace = record ? resolveWorkflowWorkspace(record) : null
    if (workspace) dirs.add(workspace)

    const workingDirectory = record?.history?.workingDirectory?.trim()
    if (!workingDirectory) return [...dirs]

    if (isAbsolute(workingDirectory)) {
      dirs.add(workingDirectory)
      return [...dirs]
    }

    const normalized = workingDirectory.replace(/\\/g, "/").replace(/^\/+/, "")
    if (normalized.startsWith("workflow/")) {
      dirs.add(join(this.paths.outputRoot.replace(/workflow-output$/, ""), normalized))
    }
    dirs.add(resolve(this.paths.legacyDataOutputPath(".."), "..", workingDirectory))
    return [...dirs]
  }
}
