import type { KuaipaoModelEntry } from "./kuaipao-config.js"
import { inferWireProtocolFromModel } from "./unified/protocol.js"
import type { LlmWireProtocol } from "./unified/types.js"

export function displayNameFromRaw(raw: Record<string, unknown>, id: string): string {
  for (const key of ["name", "display_name", "title"]) {
    const value = raw[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return id
}

export function contextFromModelRaw(raw: Record<string, unknown>): number | undefined {
  const candidates = [
    raw.context_window,
    raw.max_context_tokens,
    raw.contextWindow,
    raw.max_context,
  ]
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
  }
  return undefined
}

export function endpointTypesFromRaw(raw: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(raw.supported_endpoint_types)) return undefined
  return raw.supported_endpoint_types.map(String)
}

export function wireProtocolFromModelRaw(
  id: string,
  raw: Record<string, unknown>,
  provider?: "kuaipao" | "deepseek" | "custom",
): LlmWireProtocol {
  if (provider === "deepseek") return "deepseek-chat"
  return inferWireProtocolFromModel(id, endpointTypesFromRaw(raw))
}

export function parseOpenAiModelEntry(
  raw: Record<string, unknown>,
  options?: { provider?: "kuaipao" | "deepseek" | "custom" },
): KuaipaoModelEntry | null {
  const id = String(raw.id ?? "").trim()
  if (!id) return null
  const endpointTypes = endpointTypesFromRaw(raw)
  return {
    id,
    name: displayNameFromRaw(raw, id),
    contextWindow: contextFromModelRaw(raw),
    wireProtocol: wireProtocolFromModelRaw(id, raw, options?.provider),
    ownedBy: typeof raw.owned_by === "string" ? raw.owned_by : undefined,
    endpointTypes,
    raw,
  }
}

export function parseOpenAiModelsResponse(
  body: { data?: Array<Record<string, unknown>> } | null | undefined,
  options?: { provider?: "kuaipao" | "deepseek" | "custom" },
): KuaipaoModelEntry[] {
  const remote = Array.isArray(body?.data) ? body.data : []
  return remote.flatMap((raw) => {
    const entry = parseOpenAiModelEntry(raw, options)
    return entry ? [entry] : []
  })
}
