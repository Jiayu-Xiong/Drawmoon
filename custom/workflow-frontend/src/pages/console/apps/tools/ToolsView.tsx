import { createMemo, createSignal, For, onMount, Show } from "solid-js"

import {
  createLibraryMcp,
  createLibrarySkill,
  createLibraryTool,
  importLibraryArchive,
  seedToolIsolationSmokeLibrary,
  type CatalogToolRow,
  type ToolCatalog,
} from "../../../../api/drawmoon"
import { strategyToolSourceBadge } from "../../../../data/agent-mode-strategy-kv"
import { useI18n } from "../../../../i18n"
import { persistDrawmoonRegistry } from "../../../../data/drawmoon/registry-sync"
import {
  ensureToolsLoaded,
  getToolsCacheSnapshot,
  invalidateToolsCache,
  patchToolsCache,
  toolsCacheVersion,
  toolsRevalidating,
} from "../../../../data/tools-store"
import { AppButton, Glass } from "../../shared/core"
import { SystemToolsTable } from "../../shared/SystemToolsTable"
import { ToolParameterBlock } from "../../shared/ToolParameterBlock"
import { ToolImplementationBlock } from "../../shared/ToolImplementationBlock"

type LibraryTab = "skills" | "mcp" | "custom"

function librarySourceBadge(t: (key: string) => string, source?: "system" | "user") {
  if (source === "system") return t("tools.librarySource.system")
  return t("tools.librarySource.user")
}

function mergeUnifiedTools(catalog: ToolCatalog | null): CatalogToolRow[] {
  if (!catalog) return []
  if (catalog.unifiedSystemTools?.length) return catalog.unifiedSystemTools
  const systemIds = new Set(catalog.systemTools.map((tool) => tool.systemToolId))
  const mapped = new Set(catalog.systemTools.map((tool) => tool.opencodeToolId).filter(Boolean))
  const extras = catalog.opencodeTools.filter((tool) => !systemIds.has(tool.id) && !mapped.has(tool.id))
  return [...catalog.systemTools as CatalogToolRow[], ...extras].sort((a, b) => a.systemToolId.localeCompare(b.systemToolId))
}

export function ToolsView() {
  const { t } = useI18n()
  const [message, setMessage] = createSignal<string | null>(null)
  const [libraryTab, setLibraryTab] = createSignal<LibraryTab>("skills")
  const [skillName, setSkillName] = createSignal("")
  const [skillBody, setSkillBody] = createSignal("")
  const [mcpJson, setMcpJson] = createSignal('{\n  "name": "example-mcp",\n  "transport": "stdio",\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]\n}')
  const [customToolName, setCustomToolName] = createSignal("")
  const [customToolDescription, setCustomToolDescription] = createSignal("")
  const [customToolKind, setCustomToolKind] = createSignal<"delegate" | "opencode-plugin" | "spec-only">("opencode-plugin")
  const [customToolOpencodeId, setCustomToolOpencodeId] = createSignal("")
  const [customToolParametersJson, setCustomToolParametersJson] = createSignal("")
  const [customToolHandlerCode, setCustomToolHandlerCode] = createSignal("")
  let importInput: HTMLInputElement | undefined

  const snapshot = createMemo(() => {
    toolsCacheVersion()
    return getToolsCacheSnapshot()
  })
  const manifest = createMemo(() => snapshot()?.manifest ?? null)
  const catalog = createMemo(() => snapshot()?.catalog ?? null)
  const root = createMemo(() => snapshot()?.root ?? "")
  const customToolSpec = createMemo(() => snapshot()?.customToolSpec ?? null)
  const loading = createMemo(() => !snapshot() && !toolsRevalidating())
  const revalidating = createMemo(() => toolsRevalidating())

  const unifiedTools = createMemo(() => mergeUnifiedTools(catalog()))
  const opencodeToolIds = createMemo(() => {
    return unifiedTools()
      .map((tool) => tool.opencodeToolId ?? tool.systemToolId)
      .filter((id, index, all) => all.indexOf(id) === index)
      .sort((a, b) => a.localeCompare(b))
  })
  const customToolsList = createMemo(() => catalog()?.customTools ?? manifest()?.tools ?? [])

  async function load(force = false) {
    setMessage(null)
    try {
      await ensureToolsLoaded({ force })
      const spec = getToolsCacheSnapshot()?.customToolSpec
      if (spec) {
        if (!customToolParametersJson()) {
          setCustomToolParametersJson(JSON.stringify(spec.parameterExample, null, 2))
        }
        if (!customToolHandlerCode()) {
          setCustomToolHandlerCode(spec.handlerExample)
        }
      }
    } catch (err) {
      if (!getToolsCacheSnapshot()) {
        setMessage(err instanceof Error ? err.message : t("tools.loadFailed"))
      }
    }
  }

  onMount(() => {
    void load()
  })

  function parseCustomParameters() {
    const raw = customToolParametersJson().trim()
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) throw new Error("parameters must be a JSON array")
    return parsed
  }

  async function submitCustomTool() {
    const name = customToolName().trim()
    if (!name) return
    setMessage(null)
    try {
      const kind = customToolKind()
      const payload = {
        name,
        description: customToolDescription().trim() || undefined,
        kind,
        opencodeToolId: kind === "delegate" ? (customToolOpencodeId().trim() || null) : null,
        parameters: kind === "opencode-plugin" ? parseCustomParameters() : undefined,
        handlerCode: kind === "opencode-plugin" ? customToolHandlerCode().trim() : undefined,
      }
      if (kind === "opencode-plugin" && !payload.handlerCode) {
        setMessage(t("tools.customToolHandlerRequired"))
        return
      }
      const lib = await createLibraryTool(payload)
      patchToolsCache({ manifest: lib })
      invalidateToolsCache()
      void load(true)
      setCustomToolName("")
      setCustomToolDescription("")
      setCustomToolOpencodeId("")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("tools.saveFailed"))
    }
  }

  async function saveRegistry() {
    setMessage(null)
    try {
      await persistDrawmoonRegistry()
      setMessage(t("settings.savedRegistry"))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("tools.saveFailed"))
    }
  }

  return (
    <div class="view-stack tools-view">
      <header class="view-heading view-heading--split tools-view-header">
        <div>
          <span class="eyebrow">{t("tools.title")}</span>
          <h2>{root() || "~/.drawmoon/library"}</h2>
          <Show when={revalidating()}>
            <span class="tools-revalidating-pill">Refreshing…</span>
          </Show>
        </div>
        <div class="quick-actions">
          <AppButton
            icon="template"
            onClick={() => {
              void seedToolIsolationSmokeLibrary()
                .then((lib) => {
                  patchToolsCache({ manifest: lib })
                  setMessage(t("tools.installIsolationSmokeDone"))
                })
                .catch((err) => setMessage(err instanceof Error ? err.message : t("tools.saveFailed")))
            }}
          >
            {t("tools.installIsolationSmoke")}
          </AppButton>
          <AppButton icon="refresh" onClick={() => void load(true)}>{loading() || revalidating() ? "…" : t("tools.rescan")}</AppButton>
          <AppButton icon="import" onClick={() => importInput?.click()}>{t("tools.importZip")}</AppButton>
          <AppButton icon="save" onClick={() => void saveRegistry()}>{t("settings.saveRegistry")}</AppButton>
        </div>
      </header>

      <input
        ref={importInput}
        type="file"
        accept=".zip,application/zip"
        class="file-input-hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (!file) return
          void importLibraryArchive(file)
            .then((result) => {
              patchToolsCache({ manifest: result.manifest })
              invalidateToolsCache()
              void load(true)
              setMessage(t("tools.importZipDone", { skills: String(result.skills), mcp: String(result.mcp) }))
            })
            .catch((err) => setMessage(err instanceof Error ? err.message : t("tools.importZipFailed")))
        }}
      />

      <Show when={message()}>
        {(text) => <p class="tools-message">{text()}</p>}
      </Show>

      <Show when={loading()}>
        <Glass class="tools-loading"><p>{t("tools.loadFailed")}</p></Glass>
      </Show>

      <Show when={!loading()}>
        <div class="tools-app">
          <Glass class="slide-data-card tools-app-catalog">
            <div class="panel-heading panel-heading--dense">
              <span>{t("tools.systemTools")}</span>
              <strong>{unifiedTools().length}</strong>
            </div>
            <p class="tools-hint">{t("tools.systemToolsUnifiedHint")}</p>
            <Show when={unifiedTools().length} fallback={<p class="tools-empty">{t("tools.emptySystemTools")}</p>}>
              <SystemToolsTable tools={unifiedTools()} />
            </Show>
          </Glass>

          <Glass class="slide-data-card tools-app-library">
            <div class="panel-heading panel-heading--dense">
              <span>{t("tools.librarySection")}</span>
            </div>
            <nav class="tools-app-tabs">
              <button type="button" classList={{ active: libraryTab() === "skills" }} onClick={() => setLibraryTab("skills")}>
                {t("tools.skills")} <strong>{manifest()?.skills.length ?? 0}</strong>
              </button>
              <button type="button" classList={{ active: libraryTab() === "mcp" }} onClick={() => setLibraryTab("mcp")}>
                {t("tools.mcp")} <strong>{manifest()?.mcp.length ?? 0}</strong>
              </button>
              <button type="button" classList={{ active: libraryTab() === "custom" }} onClick={() => setLibraryTab("custom")}>
                {t("tools.customTools")} <strong>{customToolsList().length}</strong>
              </button>
            </nav>

            <div class="tools-app-library-body">
              <Show when={libraryTab() === "skills"}>
                <div class="tools-app-split">
                  <form class="tools-app-form" onSubmit={(e) => e.preventDefault()}>
                    <label class="session-field session-field--compact">
                      <span class="session-field__label">{t("tools.skillName")}</span>
                      <input class="session-control" value={skillName()} onInput={(e) => setSkillName(e.currentTarget.value)} />
                    </label>
                    <label class="session-field session-field--compact">
                      <span class="session-field__label">{t("tools.skillBody")}</span>
                      <textarea class="session-control" rows={4} value={skillBody()} onInput={(e) => setSkillBody(e.currentTarget.value)} />
                    </label>
                    <AppButton
                      icon="plus"
                      onClick={() => {
                        void createLibrarySkill({ name: skillName(), body: skillBody() }).then((lib) => {
                          patchToolsCache({ manifest: lib })
                          invalidateToolsCache()
                          void load(true)
                          setSkillName("")
                          setSkillBody("")
                        })
                      }}
                    >
                      {t("tools.addSkill")}
                    </AppButton>
                  </form>
                  <div class="tools-library-list">
                    <Show when={manifest()?.skills.length} fallback={<p class="tools-empty">{t("tools.emptySkills")}</p>}>
                      <For each={manifest()!.skills}>
                        {(skill) => (
                          <article class="tools-library-item">
                            <div class="tools-library-item-head">
                              <strong>{skill.name}</strong>
                              <span class="strategy-kv-tag">{librarySourceBadge(t, skill.source)}</span>
                            </div>
                            <code>{skill.id}</code>
                            <Show when={skill.description}><p class="tools-library-desc">{skill.description}</p></Show>
                          </article>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              </Show>

              <Show when={libraryTab() === "mcp"}>
                <div class="tools-app-split">
                  <form class="tools-app-form" onSubmit={(e) => e.preventDefault()}>
                    <label class="session-field session-field--compact">
                      <span class="session-field__label">{t("tools.mcpJson")}</span>
                      <textarea class="session-control" rows={6} value={mcpJson()} onInput={(e) => setMcpJson(e.currentTarget.value)} />
                    </label>
                    <AppButton
                      icon="plus"
                      onClick={() => {
                        try {
                          const config = JSON.parse(mcpJson()) as Record<string, unknown>
                          void createLibraryMcp({ config }).then((lib) => {
                            patchToolsCache({ manifest: lib })
                            invalidateToolsCache()
                            void load(true)
                          })
                        } catch {
                          setMessage(t("tools.invalidMcpJson"))
                        }
                      }}
                    >
                      {t("tools.addMcp")}
                    </AppButton>
                  </form>
                  <div class="tools-library-list">
                    <Show when={manifest()?.mcp.length} fallback={<p class="tools-empty">{t("tools.emptyMcp")}</p>}>
                      <For each={manifest()!.mcp}>
                        {(entry) => (
                          <article class="tools-library-item">
                            <div class="tools-library-item-head">
                              <strong>{entry.name}</strong>
                              <span class="strategy-kv-tag">{librarySourceBadge(t, entry.source)}</span>
                            </div>
                            <code>{entry.id}</code>
                            <Show when={entry.transport}><span class="tools-library-meta">{entry.transport}</span></Show>
                            <Show when={entry.description}><p class="tools-library-desc">{entry.description}</p></Show>
                          </article>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              </Show>

              <Show when={libraryTab() === "custom"}>
                <p class="tools-hint tools-hint--inline">{t("tools.customToolsHint")}</p>
                <div class="tools-app-split tools-app-split--custom">
                  <form class="tools-app-form tools-app-form--custom" onSubmit={(e) => e.preventDefault()}>
                    <label class="session-field session-field--compact">
                      <span class="session-field__label">{t("tools.customToolName")}</span>
                      <input class="session-control" value={customToolName()} onInput={(e) => setCustomToolName(e.currentTarget.value)} />
                    </label>
                    <label class="session-field session-field--compact">
                      <span class="session-field__label">{t("tools.customToolDescription")}</span>
                      <textarea class="session-control" rows={2} value={customToolDescription()} onInput={(e) => setCustomToolDescription(e.currentTarget.value)} />
                    </label>
                    <label class="session-field session-field--compact">
                      <span class="session-field__label">{t("tools.customToolKind")}</span>
                      <select
                        class="session-control"
                        value={customToolKind()}
                        onChange={(e) => setCustomToolKind(e.currentTarget.value as "delegate" | "opencode-plugin" | "spec-only")}
                      >
                        <option value="opencode-plugin">{t("tools.customToolKindPlugin")}</option>
                        <option value="delegate">{t("tools.customToolKindDelegate")}</option>
                        <option value="spec-only">{t("tools.customToolKindSpec")}</option>
                      </select>
                    </label>
                    <Show when={customToolKind() === "delegate"}>
                      <label class="session-field session-field--compact">
                        <span class="session-field__label">{t("tools.customToolOpencodeId")}</span>
                        <input
                          class="session-control"
                          list="opencode-tool-ids"
                          value={customToolOpencodeId()}
                          onInput={(e) => setCustomToolOpencodeId(e.currentTarget.value)}
                          placeholder={t("tools.customToolOpencodeIdHint")}
                        />
                        <datalist id="opencode-tool-ids">
                          <For each={opencodeToolIds()}>
                            {(id) => <option value={id} />}
                          </For>
                        </datalist>
                      </label>
                    </Show>
                    <Show when={customToolKind() === "opencode-plugin"}>
                      <label class="session-field session-field--compact">
                        <span class="session-field__label">{t("tools.customToolParameters")}</span>
                        <span class="session-field__hint">{t("tools.customToolParametersHint")}</span>
                        <textarea
                          class="session-control session-control--code"
                          rows={6}
                          value={customToolParametersJson()}
                          onInput={(e) => setCustomToolParametersJson(e.currentTarget.value)}
                          spellcheck={false}
                        />
                      </label>
                      <label class="session-field session-field--compact">
                        <span class="session-field__label">{t("tools.customToolHandler")}</span>
                        <span class="session-field__hint">{t("tools.customToolHandlerHint")}</span>
                        <textarea
                          class="session-control session-control--code"
                          rows={8}
                          value={customToolHandlerCode()}
                          onInput={(e) => setCustomToolHandlerCode(e.currentTarget.value)}
                          spellcheck={false}
                        />
                      </label>
                    </Show>
                    <Show when={customToolSpec()}>
                      {(spec) => (
                        <details class="tools-custom-spec">
                          <summary>{t("tools.customToolSpecTitle")}</summary>
                          <pre class="tools-custom-spec-pre">{spec().opencodeToolTemplate}</pre>
                          <For each={spec().kinds}>
                            {(kind) => (
                              <p class="tools-custom-spec-kind">
                                <code>{kind.id}</code> — {kind.description}
                              </p>
                            )}
                          </For>
                        </details>
                      )}
                    </Show>
                    <div class="tools-app-form-actions">
                      <Show when={customToolKind() === "opencode-plugin" && customToolSpec()}>
                        <AppButton
                          icon="template"
                          onClick={() => {
                            const spec = customToolSpec()
                            if (!spec) return
                            setCustomToolParametersJson(JSON.stringify(spec.parameterExample, null, 2))
                            setCustomToolHandlerCode(spec.handlerExample)
                          }}
                        >
                          {t("tools.customToolFillExample")}
                        </AppButton>
                      </Show>
                      <AppButton icon="plus" onClick={() => void submitCustomTool()}>
                        {t("tools.addCustomTool")}
                      </AppButton>
                    </div>
                  </form>
                  <div class="tools-library-list">
                    <Show when={customToolsList().length} fallback={<p class="tools-empty">{t("tools.emptyCustomTools")}</p>}>
                      <For each={customToolsList()}>
                        {(tool) => (
                          <article class="tools-library-item">
                            <div class="tools-library-item-head">
                              <strong>{tool.name}</strong>
                              <span class="strategy-kv-tag">{strategyToolSourceBadge(t, tool.source ?? "custom")}</span>
                              <Show when={tool.kind ?? (tool.implementation?.runtime === "opencode-vendor" ? "opencode-plugin" : tool.opencodeToolId ? "delegate" : "spec-only")}>
                                {(kind) => (
                                  <span class="strategy-kv-tag strategy-kv-tag--muted">
                                    {t(`tools.customToolKindBadge.${kind()}` as "tools.customToolKindBadge.delegate")}
                                  </span>
                                )}
                              </Show>
                            </div>
                            <code>{tool.id}</code>
                            <Show when={tool.opencodeToolId}><code>→ {tool.opencodeToolId}</code></Show>
                            <Show when={tool.descriptionPreview ?? tool.description}>
                              <p class="tools-library-desc">{tool.descriptionPreview ?? tool.description}</p>
                            </Show>
                            <Show when={tool.implementation}>
                              <ToolImplementationBlock implementation={tool.implementation!} t={t} />
                            </Show>
                            <ToolParameterBlock tool={tool} t={t} />
                          </article>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          </Glass>
        </div>
      </Show>
    </div>
  )
}
