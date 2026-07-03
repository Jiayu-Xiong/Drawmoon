import type { AgentModeTemplate } from "./console-model"

/** Native OpenCode CLI modes stay on the provider card, not the Custom card. */
const OPENCODE_NATIVE_MODE_IDS = new Set([
  "opencode-chat",
  "opencode-plan",
  "opencode-build",
  "opencode-default-agent",
])

export type OpencodeCustomRole =
  | "io-planner"
  | "planner"
  | "writer"
  | "section"
  | "reviewer"
  | "compile"
  | "chat"
  | "isolation"

export const OPENCODE_CUSTOM_MODE_ROLES: Record<string, OpencodeCustomRole> = {
  "custom-io-planner": "io-planner",
  "opencode-paper-planner": "planner",
  "opencode-paper-writer": "writer",
  "opencode-paper-section": "section",
  "opencode-objective-reviewer": "reviewer",
  "opencode-paper-reviewer": "reviewer",
  "opencode-layout-auditor": "compile",
  "opencode-paper-compile": "compile",
  "opencode-chat-kuaipao": "chat",
  "opencode-chat-isolation-alpha": "isolation",
  "opencode-chat-isolation-beta": "isolation",
}

/** Functionally similar modes merged under one canonical id in the Custom card. */
export const OPENCODE_CUSTOM_MODE_ALIASES: Record<string, string> = {
  "opencode-paper-reviewer": "opencode-objective-reviewer",
  "opencode-paper-compile": "opencode-layout-auditor",
}

const ROLE_ORDER: OpencodeCustomRole[] = [
  "io-planner",
  "planner",
  "writer",
  "section",
  "compile",
  "reviewer",
  "chat",
  "isolation",
]

export function isOpencodeCustomCardMode(mode: AgentModeTemplate): boolean {
  if (mode.provider !== "opencode") return false
  if (OPENCODE_NATIVE_MODE_IDS.has(mode.id)) return false
  if (mode.id.startsWith("opencode-derived-")) return false
  return (
    mode.id.startsWith("custom-")
    || mode.origin === "custom"
    || mode.strategyKind === "custom"
    || mode.id in OPENCODE_CUSTOM_MODE_ROLES
  )
}

export function canonicalOpencodeCustomModeId(id: string): string {
  return OPENCODE_CUSTOM_MODE_ALIASES[id] ?? id
}

export function opencodeCustomRole(mode: AgentModeTemplate): OpencodeCustomRole {
  return OPENCODE_CUSTOM_MODE_ROLES[mode.id] ?? "chat"
}

export interface OpencodeCustomRoleGroup {
  role: OpencodeCustomRole
  modes: AgentModeTemplate[]
}

/** Group custom OpenCode modes by role; aliases fold under their canonical mode chip. */
export function groupOpencodeCustomModes(modes: AgentModeTemplate[]): OpencodeCustomRoleGroup[] {
  const custom = modes.filter(isOpencodeCustomCardMode)
  const byRole = new Map<OpencodeCustomRole, AgentModeTemplate[]>()
  const seenCanonical = new Set<string>()

  for (const mode of custom) {
    const canonicalId = canonicalOpencodeCustomModeId(mode.id)
    if (mode.id !== canonicalId) continue
    if (seenCanonical.has(canonicalId)) continue
    seenCanonical.add(canonicalId)
    const role = opencodeCustomRole(mode)
    const bucket = byRole.get(role) ?? []
    bucket.push(mode)
    byRole.set(role, bucket)
  }

  return ROLE_ORDER
    .filter((role) => byRole.has(role))
    .map((role) => ({
      role,
      modes: [...(byRole.get(role) ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

export function aliasModesForCanonical(
  modes: AgentModeTemplate[],
  canonicalId: string,
): AgentModeTemplate[] {
  return modes.filter((mode) => OPENCODE_CUSTOM_MODE_ALIASES[mode.id] === canonicalId)
}
