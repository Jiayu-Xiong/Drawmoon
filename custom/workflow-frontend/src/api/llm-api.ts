import { json } from "./http-client"
import type { CopilotLlmBindResult, KuaipaoConfigSnapshot, KuaipaoModelsResult, LlmProtocolDescriptor, ApiConcurrencyConfig } from "./types/llm"

export async function fetchApiConcurrencyConfig(): Promise<ApiConcurrencyConfig> {
  return json<{ config: ApiConcurrencyConfig }>("/llm/api-concurrency").then((x) => x.config)
}

export async function saveApiConcurrencyConfig(limits: Record<string, number>): Promise<ApiConcurrencyConfig> {
  return json<{ config: ApiConcurrencyConfig }>("/llm/api-concurrency", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limits }),
  }).then((x) => x.config)
}

export async function fetchKuaipaoConfig(): Promise<KuaipaoConfigSnapshot> {
  return json<{ config: KuaipaoConfigSnapshot }>("/llm/kuaipao-config").then((x) => x.config)
}

export async function fetchKuaipaoModels(): Promise<KuaipaoModelsResult> {
  return json<{ result: KuaipaoModelsResult }>("/llm/kuaipao-models").then((x) => x.result)
}

export async function fetchCopilotLlmBind(options?: { refresh?: boolean }): Promise<CopilotLlmBindResult> {
  const suffix = options?.refresh ? "?refresh=true" : ""
  return json<{ bind: CopilotLlmBindResult }>(`/llm/copilot-bind${suffix}`).then((x) => x.bind)
}

export async function fetchLlmProtocols(): Promise<LlmProtocolDescriptor[]> {
  return json<{ protocols: LlmProtocolDescriptor[] }>("/llm/protocols").then((x) => x.protocols)
}

export async function fetchOpencodeDerivedMode(mode: "chat" | "plan" | "build" | "agent" = "build") {
  return json<{ spec: import("../data/opencode-derived-mode").OpencodeDerivedAgentModeSpec }>(
    `/cli/opencode-derived-mode?mode=${encodeURIComponent(mode)}`,
  ).then((x) => x.spec)
}
