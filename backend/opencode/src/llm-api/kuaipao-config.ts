import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

import type { LlmWireProtocol } from "./unified/types.js"
import { inferWireProtocolFromModel } from "./unified/protocol.js"
import { drawmoonApiPath } from "../drawmoon/paths.js"
import { xyMonorepoRoot } from "../lib/monorepo-paths.js"

export interface KuaipaoModelEntry {
  id: string
  name: string
  contextWindow?: number
  wireProtocol?: LlmWireProtocol
  ownedBy?: string
  endpointTypes?: string[]
  raw?: Record<string, unknown>
}

export interface KuaipaoApiConfig {
  configPath: string | null
  apiKeyEnv: string
  openaiBaseUrl: string
  anthropicBaseUrl: string
  chatCompletionsUrl: string
  hasKeyFile: boolean
  models: KuaipaoModelEntry[]
}

export interface ApiFileProviderBlock {
  id: string
  provider: "kuaipao" | "deepseek" | "custom"
  apiKeyEnv: string
  apiKey: string
  openaiBaseUrl: string
  anthropicBaseUrl?: string
  chatCompletionsUrl?: string
  models: KuaipaoModelEntry[]
}

const DEFAULT_OPENAI = "https://kuaipao.pro/v1"
const DEFAULT_ANTHROPIC = "https://kuaipao.pro"
const DEFAULT_CHAT = "https://kuaipao.pro/v1/chat/completions"
const API_KEY_ENV = "KUAIPAO_API_KEY"

function projectApiPath(): string {
  return resolve(xyMonorepoRoot(), "..", "api")
}

function runtimeDevApiPaths(): string[] {
  return [join(xyMonorepoRoot(), "api")]
}

function candidateApiPaths(): string[] {
  const fromEnv = process.env.AGENT_API_CONFIG?.trim()
  const devRepoApi = process.env.DRAWMOON_ALLOW_REPO_API === "1"
  const paths = [
    fromEnv,
    projectApiPath(),
    drawmoonApiPath(),
    ...(devRepoApi ? runtimeDevApiPaths() : []),
  ].filter((value): value is string => Boolean(value))
  return [...new Set(paths)]
}

function parseApiFileBlockLines(text: string): string[][] {
  const rawLines = text.split(/\r?\n/)
  const blocks: string[][] = []
  let current: string[] = []
  for (const raw of rawLines) {
    const line = raw.trim()
    if (line.startsWith("sk-") && current.length) {
      blocks.push(current)
      current = [line]
    } else if (line) {
      current.push(line)
    }
  }
  if (current.length) blocks.push(current)
  return blocks
}

function blockFromLines(lines: string[], providerIndex: { kuaipao: number; custom: number }): ApiFileProviderBlock | null {
  const apiKey = lines.find((line) => line.startsWith("sk-"))
  if (!apiKey) return null
  const urls = lines.map(extractUrl).filter((url): url is string => Boolean(url))
  const provider = providerFromUrls(urls)
  const index = provider === "kuaipao" ? providerIndex.kuaipao++ : providerIndex.custom++
  const apiKeyEnv = envNameForProvider(provider, index)
  process.env[apiKeyEnv] = process.env[apiKeyEnv] || apiKey
  const openaiBaseUrl = openaiBaseFromUrls(urls, provider)
  const anthropicBaseUrl = urls.find((url) => !/\/v1/.test(url)) ?? (provider === "kuaipao" ? DEFAULT_ANTHROPIC : undefined)
  const chatCompletionsUrl = urls.find((url) => url.includes("chat/completions")) ?? `${openaiBaseUrl.replace(/\/$/, "")}/chat/completions`
  return {
    id: `${provider}-${index + 1}`,
    provider,
    apiKeyEnv,
    apiKey,
    openaiBaseUrl,
    anthropicBaseUrl,
    chatCompletionsUrl,
    models: parseModelCatalog(lines),
  }
}

function extractUrl(line: string): string | null {
  const match = line.trim().match(/https?:\/\/[^\s\u4e00-\u9fff]+/i)
  return match?.[0]?.replace(/\/$/, "") ?? null
}

function envNameForProvider(provider: ApiFileProviderBlock["provider"], index: number) {
  if (provider === "deepseek") return "DEEPSEEK_API_KEY"
  if (provider === "kuaipao") return index === 0 ? API_KEY_ENV : `KUAIPAO_CDK_${index}_API_KEY`
  return `CUSTOM_LLM_${index + 1}_API_KEY`
}

function providerFromUrls(urls: string[]): ApiFileProviderBlock["provider"] {
  if (urls.some((url) => /deepseek/i.test(url))) return "deepseek"
  if (urls.some((url) => /kuaipao/i.test(url))) return "kuaipao"
  return "custom"
}

function openaiBaseFromUrls(urls: string[], provider: ApiFileProviderBlock["provider"]) {
  const explicit = urls.find((url) => /\/v1\/?$/.test(url) && !url.includes("chat/completions"))
  if (explicit) return explicit
  const deepseek = urls.find((url) => /deepseek/i.test(url))
  if (deepseek) return deepseek.endsWith("/v1") ? deepseek : `${deepseek}/v1`
  return provider === "deepseek" ? "https://api.deepseek.com/v1" : DEFAULT_OPENAI
}

export function loadApiFileProviderBlocks(): ApiFileProviderBlock[] {
  const seenKeys = new Set<string>()
  const providerIndex = { kuaipao: 0, custom: 0 }
  const merged: ApiFileProviderBlock[] = []

  for (const configPath of candidateApiPaths()) {
    if (!existsSync(configPath)) continue
    let text = ""
    try {
      text = readFileSync(configPath, "utf-8")
    } catch {
      continue
    }
    for (const lines of parseApiFileBlockLines(text)) {
      const block = blockFromLines(lines, providerIndex)
      if (!block || seenKeys.has(block.apiKey)) continue
      seenKeys.add(block.apiKey)
      merged.push(block)
    }
  }

  return merged
}

function parseApiFile(text: string): Partial<KuaipaoApiConfig> & { models: KuaipaoModelEntry[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const urls = lines.map(extractUrl).filter((url): url is string => Boolean(url))
  const openai = urls.find((url) => /\/v1\/?$/.test(url) && !url.includes("chat/completions")) ?? DEFAULT_OPENAI
  const anthropic = urls.find((url) => !/\/v1/.test(url)) ?? DEFAULT_ANTHROPIC
  const chat = urls.find((url) => url.includes("chat/completions")) ?? DEFAULT_CHAT
  return {
    openaiBaseUrl: openai,
    anthropicBaseUrl: anthropic,
    chatCompletionsUrl: chat,
    models: parseModelCatalog(lines),
  }
}

/** Model lines in api file: `gpt-5.5-chat 272000` or `openai gpt-5.5-codex ctx=128000` */
export function parseModelCatalog(lines: string[]): KuaipaoModelEntry[] {
  const models: KuaipaoModelEntry[] = []
  const seen = new Set<string>()

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || line.startsWith("sk-") || /^https?:\/\//i.test(line)) continue
    if (/^model\s*[:=]/i.test(line)) {
      const body = line.replace(/^model\s*[:=]\s*/i, "")
      const parsed = parseModelLine(body)
      if (parsed && !seen.has(parsed.id)) {
        seen.add(parsed.id)
        models.push(parsed)
      }
      continue
    }
    if (/[\u4e00-\u9fff]/.test(line) && !/\b[a-zA-Z][a-zA-Z0-9._-]{2,}\b/.test(line)) continue

    const parsed = parseModelLine(line)
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id)
      models.push(parsed)
    }
  }

  return models
}

function parseModelLine(line: string): KuaipaoModelEntry | null {
  const cleaned = line.split("#")[0]?.trim() ?? ""
  if (!cleaned) return null

  const explicit = cleaned.match(/^(?:(openai|anthropic)\s+)?([a-zA-Z][a-zA-Z0-9._-]*)(?:\s+(?:ctx[=:]?\s*)?(\d{4,7}))?\s*$/i)
  if (!explicit) return null

  const protocolHint = explicit[1]?.toLowerCase()
  const id = explicit[2]!
  const contextWindow = explicit[3] ? Number(explicit[3]) : undefined
  const wireProtocol = protocolHint === "anthropic"
    ? "anthropic-messages"
    : protocolHint === "openai"
      ? "openai-chat"
      : inferWireProtocolFromModel(id)

  return {
    id,
    name: id,
    contextWindow: contextWindow && contextWindow > 0 ? contextWindow : undefined,
    wireProtocol,
  }
}

export function resolveKuaipaoApiKey(config = loadKuaipaoConfig()): string | null {
  const fromEnv = process.env[config.apiKeyEnv]?.trim()
  if (fromEnv) return fromEnv
  const block = loadApiFileProviderBlocks().find((item) => item.apiKeyEnv === config.apiKeyEnv)
    ?? loadApiFileProviderBlocks().find((item) => item.provider === "kuaipao")
  if (block?.apiKey) {
    process.env[block.apiKeyEnv] = block.apiKey
    return block.apiKey
  }
  return null
}

export function resolveApiFileKeyByEnv(apiKeyEnv: string | undefined): string | null {
  const envName = apiKeyEnv?.trim()
  if (!envName) return null
  const fromEnv = process.env[envName]?.trim()
  if (fromEnv) return fromEnv
  const block = loadApiFileProviderBlocks().find((item) => item.apiKeyEnv === envName)
  if (block?.apiKey) {
    process.env[envName] = block.apiKey
    return block.apiKey
  }
  return null
}

export function loadKuaipaoConfig(): KuaipaoApiConfig {
  const blocks = loadApiFileProviderBlocks()
  const primaryKuaipao = blocks.find((block) => block.provider === "kuaipao" && block.apiKeyEnv === API_KEY_ENV)
    ?? blocks.find((block) => block.provider === "kuaipao")
  const configPath = candidateApiPaths().find((path) => existsSync(path)) ?? null

  if (primaryKuaipao) {
    process.env[API_KEY_ENV] = process.env[API_KEY_ENV] || primaryKuaipao.apiKey
    return {
      configPath,
      apiKeyEnv: API_KEY_ENV,
      openaiBaseUrl: primaryKuaipao.openaiBaseUrl,
      anthropicBaseUrl: primaryKuaipao.anthropicBaseUrl ?? DEFAULT_ANTHROPIC,
      chatCompletionsUrl: primaryKuaipao.chatCompletionsUrl ?? DEFAULT_CHAT,
      hasKeyFile: true,
      models: primaryKuaipao.models,
    }
  }

  for (const path of candidateApiPaths()) {
    if (!existsSync(path)) continue
    try {
      const text = readFileSync(path, "utf-8")
      const parsed = parseApiFile(text)
      const keyLine = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("sk-"))
      if (keyLine && !process.env[API_KEY_ENV]) {
        process.env[API_KEY_ENV] = keyLine
      }
      return {
        configPath: path,
        apiKeyEnv: API_KEY_ENV,
        openaiBaseUrl: parsed.openaiBaseUrl ?? DEFAULT_OPENAI,
        anthropicBaseUrl: parsed.anthropicBaseUrl ?? DEFAULT_ANTHROPIC,
        chatCompletionsUrl: parsed.chatCompletionsUrl ?? DEFAULT_CHAT,
        hasKeyFile: Boolean(keyLine || process.env[API_KEY_ENV]),
        models: parsed.models,
      }
    } catch {
      continue
    }
  }
  return {
    configPath: null,
    apiKeyEnv: API_KEY_ENV,
    openaiBaseUrl: DEFAULT_OPENAI,
    anthropicBaseUrl: DEFAULT_ANTHROPIC,
    chatCompletionsUrl: DEFAULT_CHAT,
    hasKeyFile: Boolean(process.env[API_KEY_ENV]),
    models: [],
  }
}

/** Read the second sk- key from ~/.drawmoon/api, auto-creating the directory */
export function resolveSecondApiKey(): string | null {
  const secondKuaipao = loadApiFileProviderBlocks().filter((block) => block.provider === "kuaipao")[1]
  if (secondKuaipao?.apiKey) return secondKuaipao.apiKey
  const drawmoonDir = join(homedir(), ".drawmoon")
  if (!existsSync(drawmoonDir)) {
    try { mkdirSync(drawmoonDir, { recursive: true }) } catch { return null }
  }
  const configPath = join(drawmoonDir, "api")
  if (!existsSync(configPath)) return null
  try {
    const text = readFileSync(configPath, "utf-8")
    const key = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("sk-") && line.length > 20)
    return key ?? null
  } catch {
    return null
  }
}
