import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface BlackboardEntry {
  key: string
  path: string
  producerNodeId?: string
  mime?: string
  reconciled?: boolean
}

export interface BlackboardState {
  version: 1
  entries: Record<string, BlackboardEntry>
  updatedAt: string
}

const DIR = ".workflow"
const FILE = "blackboard.json"

export class Blackboard {
  constructor(private readonly workspaceDir: string) {}

  private filePath() {
    return join(this.workspaceDir, DIR, FILE)
  }

  load(): BlackboardState {
    const path = this.filePath()
    if (!existsSync(path)) {
      return { version: 1, entries: {}, updatedAt: new Date().toISOString() }
    }
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as BlackboardState
      return { version: 1, entries: raw.entries ?? {}, updatedAt: raw.updatedAt ?? new Date().toISOString() }
    } catch {
      return { version: 1, entries: {}, updatedAt: new Date().toISOString() }
    }
  }

  save(state: BlackboardState) {
    const dir = join(this.workspaceDir, DIR)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath(), JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), "utf-8")
  }

  get(key: string): BlackboardEntry | null {
    return this.load().entries[key] ?? null
  }

  put(entry: BlackboardEntry) {
    const state = this.load()
    state.entries[entry.key] = entry
    this.save(state)
  }

  resolvePath(key: string): string | null {
    const entry = this.get(key)
    if (!entry) return null
    const abs = join(this.workspaceDir, entry.path.replace(/^\/+/, "").replace(/\\/g, "/"))
    return existsSync(abs) ? entry.path.replace(/\\/g, "/") : null
  }
}
