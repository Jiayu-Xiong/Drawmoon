import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"

import { Icon } from "../components/Icon"
import type { ApiConcurrencyConfig, CopilotLlmBindResult, KuaipaoConfigSnapshot } from "../api"
import { fetchApiConcurrencyConfig, saveApiConcurrencyConfig } from "../api"
import type { LlmApiTemplate } from "../data/console-model"
import {
  ensureCopilotLlmBind,
  getLastLlmBindError,
  getLastLlmBindResult,
  onLlmApiBindReady,
  refreshCopilotLlmBind,
} from "../data/llm-api-bind/bootstrap"
import { listLlmApiTemplates, registerLlmApiTemplate } from "../data/llm-api-templates"
import { PlainLlmApiTemplate } from "../data/template-registry"

type ApiMode = "openai-compatible" | "messages" | "responses" | "custom-http"

const apiModeOptions: Array<{ value: ApiMode; label: string; wire: string; endpointHint: string }> = [
  { value: "openai-compatible", label: "OpenAI", wire: "openai-chat", endpointHint: "https://host/v1" },
  { value: "messages", label: "Anthropic", wire: "anthropic-messages", endpointHint: "https://host" },
  { value: "responses", label: "OpenAI Responses", wire: "openai-responses", endpointHint: "https://host/v1" },
  { value: "custom-http", label: "Custom HTTP", wire: "custom-http", endpointHint: "https://host/api" },
]

function wireProtocolForMode(mode: ApiMode) {
  return apiModeOptions.find((item) => item.value === mode)?.wire ?? "openai-chat"
}

function normalizeEndpoint(endpoint: string, mode: ApiMode) {
  const trimmed = endpoint.trim().replace(/\/+$/, "")
  if (!trimmed) return mode === "messages" ? "https://api.anthropic.com" : "https://api.openai.com/v1"
  return trimmed
}

function normalizeApiKeyEnv(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed.toLowerCase() === "cdk") return "KUAIPAO_CDK_1_API_KEY"
  return trimmed
}

function cloneLlmApiList() {
  return listLlmApiTemplates().map((api) => ({ ...api, retryPolicy: { ...api.retryPolicy } }))
}

function statusClass(ok: boolean) {
  return ok ? "online" : "offline"
}

function groupKey(apiKeyEnv: string | undefined, endpoint: string) {
  const env = apiKeyEnv?.trim() || "no-key-env"
  const normalized = endpoint.replace(/\/+$/, "") || "unbound"
  return `${env}::${normalized}`
}

function groupLabel(apiKeyEnv: string | undefined, endpoint: string) {
  const env = apiKeyEnv?.trim()
  if (env === "KUAIPAO_API_KEY") return "Kuaipao (primary)"
  if (env === "KUAIPAO_CDK_1_API_KEY") return "Kuaipao (CDK)"
  if (env?.startsWith("KUAIPAO_CDK_")) return `Kuaipao (${env.replace(/^KUAIPAO_/, "").replace(/_API_KEY$/, "")})`
  return env ?? (endpoint.replace(/\/+$/, "") || "LLM API")
}

const API_GROUP_NAMES_KEY = "xy.llmApi.groupNames.v1"

function readGroupNames() {
  if (typeof window === "undefined") return {} as Record<string, string>
  try {
    return JSON.parse(window.localStorage.getItem(API_GROUP_NAMES_KEY) ?? "{}") as Record<string, string>
  } catch {
    return {}
  }
}

export function LlmApiView() {
  const [items, setItems] = createSignal<LlmApiTemplate[]>(cloneLlmApiList())
  const [bind, setBind] = createSignal<CopilotLlmBindResult | null>(getLastLlmBindResult())
  const [bindError, setBindError] = createSignal<string | null>(getLastLlmBindError())
  const [discovering, setDiscovering] = createSignal(!getLastLlmBindResult())
  const [refreshing, setRefreshing] = createSignal(false)
  const [newEndpoint, setNewEndpoint] = createSignal("https://kuaipao.pro/v1")
  const [newMode, setNewMode] = createSignal<ApiMode>("openai-compatible")
  const [newModel, setNewModel] = createSignal("gpt-5.5")
  const [newName, setNewName] = createSignal("Custom API")
  const [newApiKeyEnv, setNewApiKeyEnv] = createSignal("KUAIPAO_API_KEY")
  const [newDescription, setNewDescription] = createSignal("")
  const [groupNames, setGroupNames] = createSignal<Record<string, string>>(readGroupNames())
  const [concurrency, setConcurrency] = createSignal<ApiConcurrencyConfig>({ limits: {} })
  const [concurrencyDraft, setConcurrencyDraft] = createSignal<Record<string, string>>({})

  function limitForGroup(apiKeyEnv: string) {
    const limits = concurrency().limits
    if (limits[apiKeyEnv] !== undefined) return String(limits[apiKeyEnv])
    if (/^KUAIPAO/i.test(apiKeyEnv)) return "1"
    return "-1"
  }

  async function loadConcurrency() {
    try {
      const config = await fetchApiConcurrencyConfig()
      setConcurrency(config)
      setConcurrencyDraft(Object.fromEntries(Object.entries(config.limits).map(([key, value]) => [key, String(value)])))
    } catch {
      setConcurrency({ limits: { KUAIPAO_API_KEY: 1, KUAIPAO_CDK_1_API_KEY: 1 } })
    }
  }

  async function persistGroupConcurrency(apiKeyEnv: string) {
    const raw = concurrencyDraft()[apiKeyEnv] ?? limitForGroup(apiKeyEnv)
    const parsed = Number.parseInt(raw, 10)
    const value = Number.isFinite(parsed) ? parsed : -1
    const next = { ...concurrency().limits, [apiKeyEnv]: value }
    const saved = await saveApiConcurrencyConfig(next)
    setConcurrency(saved)
    setConcurrencyDraft((prev) => ({ ...prev, [apiKeyEnv]: String(value) }))
  }

  const kuaipao = createMemo(() => bind()?.kuaipao as (KuaipaoConfigSnapshot & { modelsEndpoint?: string }) | undefined)
  const apiGroups = createMemo(() => bind()?.apiGroups ?? [])

  const modelGroups = createMemo(() => {
    type GroupModel = {
      id: string
      name: string
      wire?: string
      owner?: string
      endpointTypes: string[]
      contextWindow?: number
      template?: LlmApiTemplate
    }
    type ViewGroup = {
      key: string
      endpoint: string
      modelsEndpoint: string
      apiKeyEnv: string
      provider: string
      available: boolean
      keyConfigured: boolean
      error?: string
      providers: Set<string>
      protocols: Set<string>
      wireProtocols: Set<string>
      apiKeyEnvs: Set<string>
      models: GroupModel[]
    }

    const groups: ViewGroup[] = apiGroups().map((group) => {
      const models: GroupModel[] = group.models.map((model) => {
        const template = items().find((api) => api.model === model.id && api.apiKeyEnv === group.apiKeyEnv)
        return {
          id: model.id,
          name: template?.name ?? model.name,
          wire: model.wireProtocol ?? template?.wireProtocol,
          owner: model.ownedBy,
          endpointTypes: model.endpointTypes ?? [],
          contextWindow: model.contextWindow ?? template?.contextWindow,
          template,
        }
      })
      const providers = new Set(models.map((model) => model.template?.provider ?? (model.wire?.includes("deepseek") ? "custom" : undefined)).filter((value): value is string => Boolean(value)))
      const protocols = new Set(models.map((model) => model.template?.protocol ?? (model.wire ? "openai-compatible" : undefined)).filter((value): value is string => Boolean(value)))
      const wireProtocols = new Set(models.map((model) => model.wire ?? model.template?.wireProtocol).filter((value): value is string => Boolean(value)))
      return {
        key: group.id,
        endpoint: group.openaiBaseUrl,
        modelsEndpoint: group.modelsEndpoint,
        apiKeyEnv: group.apiKeyEnv,
        provider: group.provider,
        available: group.available,
        keyConfigured: group.keyConfigured ?? false,
        error: group.error,
        providers,
        protocols,
        wireProtocols,
        apiKeyEnvs: new Set([group.apiKeyEnv]),
        models,
      }
    })

    const seen = new Set(groups.flatMap((group) => group.models.map((model) => `${group.key}::${model.id}`)))
    for (const template of items()) {
      if (!template.model) continue
      const alreadyListed = groups.some((group) => group.apiKeyEnv === template.apiKeyEnv && group.models.some((model) => model.id === template.model))
      if (alreadyListed) continue
      const key = `manual-${groupKey(template.apiKeyEnv, template.endpoint)}`
      let group = groups.find((entry) => entry.key === key)
      if (!group) {
        group = {
          key,
          endpoint: template.endpoint,
          modelsEndpoint: template.endpoint.replace(/\/$/, "") + (template.endpoint.includes("/models") ? "" : "/models"),
          apiKeyEnv: template.apiKeyEnv,
          provider: template.provider,
          available: true,
          keyConfigured: true,
          providers: new Set<string>(),
          protocols: new Set<string>(),
          wireProtocols: new Set<string>(),
          apiKeyEnvs: new Set([template.apiKeyEnv]),
          models: [],
        }
        groups.push(group)
      }
      if (seen.has(`${key}::${template.model}`)) continue
      group.providers.add(template.provider)
      group.protocols.add(template.protocol)
      if (template.wireProtocol) group.wireProtocols.add(template.wireProtocol)
      group.models.push({
        id: template.model,
        name: template.name,
        wire: template.wireProtocol,
        endpointTypes: [],
        contextWindow: template.contextWindow,
        template,
      })
      seen.add(`${key}::${template.model}`)
    }

    return groups.sort((a, b) => a.key.localeCompare(b.key))
  })

  function renameGroup(key: string, name: string) {
    setGroupNames((current) => {
      const next = { ...current, [key]: name }
      if (!name.trim()) delete next[key]
      if (typeof window !== "undefined") window.localStorage.setItem(API_GROUP_NAMES_KEY, JSON.stringify(next))
      return next
    })
  }

  function reloadFromRegistry() {
    setBind(getLastLlmBindResult())
    setBindError(getLastLlmBindError())
    setItems(cloneLlmApiList())
  }

  async function refreshDiscovery() {
    setRefreshing(true)
    try {
      await refreshCopilotLlmBind()
      reloadFromRegistry()
    } finally {
      setRefreshing(false)
    }
  }

  function createApi() {
    const mode = newMode()
    const endpoint = normalizeEndpoint(newEndpoint(), mode)
    const model = newModel().trim() || "configured-default"
    const api = {
      id: `api-${Date.now()}`,
      name: newName().trim() || "New LLM API",
      description: newDescription().trim() || `Manual ${mode === "messages" ? "Anthropic" : "OpenAI"} binding template.`,
      provider: mode === "messages" ? "anthropic" : "custom",
      endpoint,
      protocol: mode,
      wireProtocol: wireProtocolForMode(mode) as LlmApiTemplate["wireProtocol"],
      model,
      contextWindow: 0,
      responseFormat: "markdown" as const,
      defaultSystemPrompt: "",
      allowSystemPromptOverride: true,
      allowUserPromptBias: false,
      apiKeyEnv: normalizeApiKeyEnv(newApiKeyEnv()) || (mode === "messages" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"),
      timeoutMs: 240000,
      retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
    } satisfies LlmApiTemplate
    registerLlmApiTemplate(new PlainLlmApiTemplate(api))
    reloadFromRegistry()
  }

  onMount(() => {
    const stop = onLlmApiBindReady(reloadFromRegistry)
    reloadFromRegistry()
    void ensureCopilotLlmBind()
      .then(reloadFromRegistry)
      .finally(() => setDiscovering(false))
    void loadConcurrency()
    onCleanup(stop)
  })

  return (
    <div class="template-registry-view">
      <header class="view-heading view-heading--split">
        <div>
          <span class="eyebrow">Template Base</span>
          <h2>LLM API</h2>
          <p>Models are grouped by API URL. Sampling and prompt policy belong in Agent Modes or workflow nodes.</p>
        </div>
        <div class="registry-head-actions">
          <button class="registry-add-button" type="button" disabled={refreshing()} onClick={() => void refreshDiscovery()}>
            <Icon name="import" size={15} />{refreshing() ? "Refreshing..." : "Refresh models"}
          </button>
          <button class="registry-add-button" onClick={createApi}><Icon name="plus" size={15} />Create API</button>
        </div>
      </header>

      <details class="llm-api-create wf-glass">
        <summary>
          <span><Icon name="plus" size={14} /> Manual API</span>
          <strong>Root URL + mode</strong>
        </summary>
        <div class="registry-meta-grid llm-api-create-grid">
          <label>Root URL<input value={newEndpoint()} placeholder="https://host/v1" onInput={(event) => setNewEndpoint(event.currentTarget.value)} /></label>
          <label>API mode<select value={newMode()} onChange={(event) => setNewMode(event.currentTarget.value as ApiMode)}>
            <For each={apiModeOptions}>{(option) => <option value={option.value}>{option.label} / {option.wire}</option>}</For>
          </select></label>
          <label>Model<input value={newModel()} placeholder="gpt-5.5 / claude-3.7 / deepseek-chat" onInput={(event) => setNewModel(event.currentTarget.value)} /></label>
          <label>Key / CDK<input value={newApiKeyEnv()} placeholder="KUAIPAO_API_KEY / ANTHROPIC_API_KEY / cdk" onInput={(event) => setNewApiKeyEnv(event.currentTarget.value)} /></label>
          <label>Name<input value={newName()} placeholder="My API" onInput={(event) => setNewName(event.currentTarget.value)} /></label>
          <label>Description<input value={newDescription()} placeholder="Optional note" onInput={(event) => setNewDescription(event.currentTarget.value)} /></label>
        </div>
        <div class="registry-create-actions">
          <button type="button" class="registry-add-button" onClick={createApi}><Icon name="plus" size={15} />Create usable API</button>
          <p class="llm-discovery-summary">Root URL + mode are enough to create a model binding. `cdk` is accepted as a shortcut key source.</p>
        </div>
      </details>

      <div class="llm-api-groups wf-glass">
        <For each={modelGroups()} fallback={<section class="llm-api-group wf-glass"><p>{discovering() ? "Discovering models..." : "No API groups available."}</p></section>}>
          {(group) => (
            <section class="llm-api-group">
              <div class="llm-api-model-grid">
                <For each={group.models}>
                  {(model) => (
                    <article class="llm-model-card">
                      <div class="registry-card-head">
                        <Icon name="api" size={18} />
                        <div>
                          <h3>{model.id}</h3>
                          <span>{model.name}</span>
                        </div>
                      </div>
                      <div class="registry-meta-grid">
                        <span>wire <b>{model.wire ?? "-"}</b></span>
                        <span>owner <b>{model.owner ?? "-"}</b></span>
                        <span>endpoints <b>{model.endpointTypes.join(", ") || "-"}</b></span>
                        <span>context <b>{model.contextWindow ? model.contextWindow.toLocaleString() : "-"}</b></span>
                        <span>template <b>{model.template?.id ?? "discovered"}</b></span>
                        <span>modality <b>{model.template?.modalities?.join(", ") ?? "text"}</b></span>
                      </div>
                    </article>
                  )}
                </For>
              </div>
              <aside class="llm-api-group-side">
                <div class="panel-heading">
                  <span>API Group</span>
                  <strong class={statusClass(group.available)}>{group.models.length} models</strong>
                </div>
                <label class="llm-api-group-name">
                  <span>Max concurrent (-1 = unlimited)</span>
                  <input
                    type="number"
                    min={-1}
                    value={concurrencyDraft()[group.apiKeyEnv] ?? limitForGroup(group.apiKeyEnv)}
                    onInput={(event) => setConcurrencyDraft((prev) => ({ ...prev, [group.apiKeyEnv]: event.currentTarget.value }))}
                    onChange={() => void persistGroupConcurrency(group.apiKeyEnv)}
                  />
                </label>
                <label class="llm-api-group-name">
                  <span>Name</span>
                  <input
                    value={groupNames()[group.key] ?? groupLabel(group.apiKeyEnv, group.endpoint)}
                    onInput={(event) => renameGroup(group.key, event.currentTarget.value)}
                  />
                </label>
                <p>{group.modelsEndpoint}</p>
                <Show when={group.error} fallback={<p class="llm-discovery-summary">{discovering() ? "Discovering models..." : group.available ? "Live from api file key + URL" : "No models returned"}</p>}>
                  <p class="registry-error">{group.error}</p>
                </Show>
                <div class="registry-meta-grid">
                  <span>provider <b>{group.provider}</b></span>
                  <span>providers <b>{Array.from(group.providers).join(", ") || group.provider}</b></span>
                  <span>protocols <b>{Array.from(group.protocols).join(", ") || "-"}</b></span>
                  <span>wire <b>{Array.from(group.wireProtocols).join(", ") || "-"}</b></span>
                  <span>key env <b>{group.apiKeyEnv}</b></span>
                  <span>key <b>{group.keyConfigured ? "configured" : "missing"}</b></span>
                  <span>api file <b>{kuaipao()?.configPath ?? "not found"}</b></span>
                  <span>base URL <b>{group.endpoint}</b></span>
                  <span>models URL <b>{group.modelsEndpoint}</b></span>
                  <span>templates <b>{group.models.filter((model) => model.template).length}</b></span>
                  <span>source <b>GET /v1/models</b></span>
                </div>
              </aside>
            </section>
          )}
        </For>
      </div>
    </div>
  )
}
