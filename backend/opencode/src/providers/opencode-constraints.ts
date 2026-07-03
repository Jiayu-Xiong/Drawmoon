import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type { DrawmoonLibraryManifest, DrawmoonMcpEntry, DrawmoonSkillEntry } from "../drawmoon/library.js"
import { readLibraryManifest } from "../drawmoon/library.js"
import { normalizeSystemToolToOpencode } from "../cli-probes/tool-mapping.js"
import type { AgentNodeConfig } from "../schema/types.js"
import {
  constrainToolTogglesToAllowed,
  nativeToolTogglesForModel,
  resolveModelId,
  WORKFLOW_DELEGATION_TOOLS,
} from "./opencode-native-defaults.js"

type NodeConstraints = NonNullable<AgentNodeConfig["constraints"]>

function normalizeToolId(toolId: string) {
  return normalizeSystemToolToOpencode(toolId)
}

function toOpencodeSkillDirectory(manifestPath: string): string {
  const normalized = manifestPath.replace(/\\/g, "/")
  if (normalized.endsWith("/SKILL.md")) return dirname(manifestPath)
  if (normalized.endsWith(".md")) {
    const parent = dirname(manifestPath)
    const id = manifestPath.split(/[/\\]/).pop()?.replace(/\.md$/i, "") ?? ""
    return join(parent, id)
  }
  return manifestPath
}

function pickIds(constraints: NodeConstraints, forcedKey: keyof NodeConstraints, allowedKey: keyof NodeConstraints) {
  if (constraints[forcedKey] !== undefined) return constraints[forcedKey]!
  if (constraints[allowedKey] !== undefined) return constraints[allowedKey]!
  return null
}

export function resolveSkillPaths(
  constraints: NodeConstraints | undefined,
  manifest: DrawmoonLibraryManifest,
): string[] | undefined {
  if (!constraints) return undefined
  const ids = pickIds(constraints, "forcedSkills", "allowedSkills")
  if (ids === null) return undefined
  const lookup = new Map(manifest.skills.map((skill) => [skill.id, skill]))
  return ids.map((id) => {
    const entry = lookup.get(id)
    return entry ? toOpencodeSkillDirectory(entry.path) : undefined
  }).filter((path): path is string => Boolean(path))
}

export interface WorkflowMcpEnvOptions {
  readRoots?: string[]
  flatWriteOnly?: boolean
}

export function resolveMcpServers(
  constraints: NodeConstraints | undefined,
  manifest: DrawmoonLibraryManifest,
  workspaceDir?: string,
  mcpEnv?: WorkflowMcpEnvOptions,
): Record<string, Record<string, unknown>> | undefined {
  if (!constraints) return undefined
  const ids = pickIds(constraints, "forcedMcpServers", "allowedMcpServers")
  if (ids === null) return undefined
  const lookup = new Map(manifest.mcp.map((entry) => [entry.id, entry]))
  const servers: Record<string, Record<string, unknown>> = {}
  for (const id of ids) {
    const entry = lookup.get(id)
    if (!entry) continue
    const config = readMcpConfig(entry)
    if (!config) continue
    if (workspaceDir && (id === "workflow-io" || id === "workflow-web")) {
      const env: Record<string, string> = {
        ...(config.environment as Record<string, string> | undefined),
        WORKFLOW_WORKSPACE_ROOT: workspaceDir,
      }
      if (mcpEnv?.readRoots?.length) {
        env.WORKFLOW_ALLOWED_READ_ROOTS = mcpEnv.readRoots.join(";")
      }
      if (mcpEnv?.flatWriteOnly) {
        env.WORKFLOW_FLAT_WRITE_ONLY = "1"
      }
      servers[id] = { ...config, environment: env }
    } else {
      servers[id] = config
    }
  }
  return servers
}

function readMcpConfig(entry: DrawmoonMcpEntry): Record<string, unknown> | null {
  if (!existsSync(entry.path)) return null
  try {
    const parsed = JSON.parse(readFileSync(entry.path, "utf-8")) as Record<string, unknown>
    const { id: _id, name: _name, description: _description, ...server } = parsed
    if (server.type === "local" || server.type === "remote") return server
    if (typeof server.command !== "undefined" || typeof server.url === "string") return server
    return null
  } catch {
    return null
  }
}

export function applyToolConstraintsToOpencodeConfig(
  config: Record<string, unknown>,
  constraints: NodeConstraints | undefined,
  manifest: DrawmoonLibraryManifest = readLibraryManifest(),
  workspaceDir?: string,
  mcpEnv?: WorkflowMcpEnvOptions,
) {
  const skillPaths = resolveSkillPaths(constraints, manifest)
  if (skillPaths !== undefined) {
    config.skills = { paths: skillPaths }
  }

  const mcpServers = resolveMcpServers(constraints, manifest, workspaceDir, mcpEnv)
  if (mcpServers !== undefined) {
    config.mcp = mcpServers
  }

  const toolIds = pickIds(constraints ?? {}, "forcedTools", "allowedTools")
  if (toolIds !== null) {
    const allowed = new Set(toolIds.map(normalizeToolId))
    const modelId = resolveModelId(typeof config.model === "string" ? config.model : undefined)
    const base = nativeToolTogglesForModel(modelId)
    config.tools = constrainToolTogglesToAllowed(base, allowed)
    config.permission = {
      ...(config.permission as Record<string, unknown> | undefined),
      ...Object.fromEntries(WORKFLOW_DELEGATION_TOOLS.map((tool) => [tool, "deny"])),
    }
  }

  return config
}
