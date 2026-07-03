import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { drawmoonProfilesDir } from "./paths.js"

export interface PathAliasRule {
  prefix?: string
  stripPrefix?: string
  basenamePattern?: string
  aliases: string[]
}

export interface DrawmoonProfile {
  id: string
  pathAliases?: PathAliasRule[]
}

const DEFAULT_PROFILE_ID = "paper-aliases"

let cachedProfile: DrawmoonProfile | null | undefined

function profilePath(id: string) {
  return join(drawmoonProfilesDir(), `${id}.json`)
}

export function readDrawmoonProfile(id = DEFAULT_PROFILE_ID): DrawmoonProfile | null {
  if (cachedProfile !== undefined && id === DEFAULT_PROFILE_ID) return cachedProfile
  const path = profilePath(id)
  if (!existsSync(path)) {
    if (id === DEFAULT_PROFILE_ID) cachedProfile = null
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as DrawmoonProfile
    const profile = { id: parsed.id ?? id, pathAliases: parsed.pathAliases ?? [] }
    if (id === DEFAULT_PROFILE_ID) cachedProfile = profile
    return profile
  } catch {
    if (id === DEFAULT_PROFILE_ID) cachedProfile = null
    return null
  }
}

export function listDrawmoonProfiles(): string[] {
  return existsSync(profilePath(DEFAULT_PROFILE_ID)) ? [DEFAULT_PROFILE_ID] : []
}
