import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { vendoredOpencodeCliDir } from "../lib/monorepo-paths.js"

const VENDOR = () => vendoredOpencodeCliDir()

function readText(rel: string): string | undefined {
  const path = join(VENDOR(), rel)
  if (!existsSync(path)) return undefined
  return readFileSync(path, "utf8").trim()
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface OpencodeNativeAgent {
  name: string
  description: string
  mode: "primary" | "subagent" | "all"
  native: boolean
  hidden?: boolean
  prompt?: string
  promptSource?: string
}

/** Native OpenCode agents (from vendor agent.ts defaults). */
export function loadNativeAgents(): OpencodeNativeAgent[] {
  return [
    {
      name: "build",
      description: "The default agent. Executes tools based on configured permissions.",
      mode: "primary",
      native: true,
    },
    {
      name: "plan",
      description: "Plan mode. Disallows all edit tools.",
      mode: "primary",
      native: true,
    },
    {
      name: "general",
      description: "General-purpose agent for researching complex questions and executing multi-step tasks.",
      mode: "subagent",
      native: true,
    },
    {
      name: "explore",
      description: "Fast agent specialized for exploring codebases.",
      mode: "subagent",
      native: true,
      prompt: readText("src/agent/prompt/explore.txt"),
      promptSource: "src/agent/prompt/explore.txt",
    },
    {
      name: "compaction",
      description: "Session compaction agent.",
      mode: "primary",
      native: true,
      hidden: true,
      prompt: readText("src/agent/prompt/compaction.txt"),
      promptSource: "src/agent/prompt/compaction.txt",
    },
    {
      name: "title",
      description: "Session title agent.",
      mode: "primary",
      native: true,
      hidden: true,
      prompt: readText("src/agent/prompt/title.txt"),
      promptSource: "src/agent/prompt/title.txt",
    },
    {
      name: "summary",
      description: "Session summary agent.",
      mode: "primary",
      native: true,
      hidden: true,
      prompt: readText("src/agent/prompt/summary.txt"),
      promptSource: "src/agent/prompt/summary.txt",
    },
  ]
}

/** Provider-specific base system prompt (mirrors session/system.ts). */
export function resolveProviderSystemPrompt(model: string): { id: string; source: string; text: string; tokens: number } {
  const modelId = (model.includes("/") ? model.split("/").slice(1).join("/") : model).toLowerCase()
  let source = "src/session/prompt/default.txt"
  if (modelId.includes("gpt-4") || modelId.includes("o1") || modelId.includes("o3")) source = "src/session/prompt/beast.txt"
  else if (modelId.includes("gpt")) {
    source = modelId.includes("codex") ? "src/session/prompt/codex.txt" : "src/session/prompt/gpt.txt"
  } else if (modelId.includes("gemini-")) source = "src/session/prompt/gemini.txt"
  else if (modelId.includes("claude")) source = "src/session/prompt/anthropic.txt"
  else if (modelId.includes("trinity")) source = "src/session/prompt/trinity.txt"
  else if (modelId.includes("kimi")) source = "src/session/prompt/kimi.txt"
  const text = readText(source) ?? ""
  return { id: source.split("/").pop()?.replace(".txt", "") ?? "default", source, text, tokens: estimateTokens(text) }
}

export function loadPlanModePrompts(): Array<{ key: string; source: string; text: string; tokens: number }> {
  const files = [
    { key: "plan", source: "src/session/prompt/plan.txt" },
    { key: "plan-mode", source: "src/session/prompt/plan-mode.txt" },
    { key: "build-switch", source: "src/session/prompt/build-switch.txt" },
    { key: "max-steps", source: "src/session/prompt/max-steps.txt" },
  ]
  return files.flatMap(({ key, source }) => {
    const text = readText(source)
    if (!text) return []
    return [{ key, source, text, tokens: estimateTokens(text) }]
  })
}

const TOOL_TXT_MAP: Record<string, string> = {
  bash: "shell",
  read: "read",
  edit: "edit",
  write: "write",
  grep: "grep",
  glob: "glob",
  patch: "apply_patch",
  webfetch: "webfetch",
  websearch: "websearch",
  task: "task",
  skill: "skill",
  todowrite: "todowrite",
  lsp: "lsp",
}

export function loadBuiltinToolDescriptions(): Record<string, { source: string; text: string; tokens: number }> {
  const out: Record<string, { source: string; text: string; tokens: number }> = {}
  for (const [toolId, fileStem] of Object.entries(TOOL_TXT_MAP)) {
    const source = `src/tool/${fileStem}.txt`
    const text = readText(source)
    if (!text) continue
    out[toolId] = { source, text, tokens: estimateTokens(text) }
  }
  return out
}

export function loadSessionPromptCatalog(): Array<{ id: string; source: string; chars: number; tokens: number }> {
  const dir = join(VENDOR(), "src/session/prompt")
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".txt"))
    .map((name) => {
      const text = readText(`src/session/prompt/${name}`) ?? ""
      return { id: name.replace(".txt", ""), source: `src/session/prompt/${name}`, chars: text.length, tokens: estimateTokens(text) }
    })
    .sort((a, b) => b.chars - a.chars)
}

export function resolveOpencodeAgentId(mode: string | undefined): string {
  if (mode === "plan") return "plan"
  if (mode === "review") return "build"
  return mode === "chat" ? "build" : (mode ?? "build")
}
