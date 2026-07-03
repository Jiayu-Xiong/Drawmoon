import { createMemo, createSignal, For, onMount, Show } from "solid-js"

import { Icon } from "../components/Icon"
import { fetchOpencodeDerivedMode, getRuntimeSnapshot, type RuntimeSnapshot } from "../api"
import type { AgentModeTemplate, AgentRuntimeMode, CliProviderTemplate } from "../data/console-model"
import { agentModeFromOpencodeDerived } from "../data/opencode-derived-mode"
import {
  aliasModesForCanonical,
  groupOpencodeCustomModes,
  isOpencodeCustomCardMode,
} from "../data/opencode-custom-registry"
import {
  listAgentModeTemplates,
  registerAgentModeTemplate,
  renameAgentModeTemplateId,
} from "../data/agent-mode-templates"
import { PlainAgentModeTemplate } from "../data/template-registry"
import { listCliTemplates } from "../data/cli-templates"
import { AgentModeStrategyEditor } from "../components/AgentModeStrategyEditor"
import { isCliStrategyMode } from "../data/agent-mode-strategy-kv"
import { useI18n } from "../i18n"

function cloneMode(mode: AgentModeTemplate): AgentModeTemplate {
  return {
    ...mode,
    allowedTools: [...mode.allowedTools],
    outputKinds: [...mode.outputKinds],
    cacheFiles: [...mode.cacheFiles],
    contextFiles: [...mode.contextFiles],
    retryPolicy: { ...mode.retryPolicy },
  }
}

function hydrateBackendModes(modes: AgentModeTemplate[], snapshot: RuntimeSnapshot | null): AgentModeTemplate[] {
  const opencode = snapshot?.providers.find((provider) => provider.id === "opencode")
  return modes.map((mode) => {
    if (mode.id !== "opencode-default-agent" || !opencode) return mode
    const maxIterations = typeof opencode.capabilities?.maxIterations === "number" ? opencode.capabilities.maxIterations : mode.maxIterations
    const contextModes = Array.isArray(opencode.capabilities?.contextModes) ? opencode.capabilities.contextModes.map(String) : []
    return {
      ...mode,
      description: `Imported from local OpenCode (${opencode.path ?? "opencode"}). ${mode.description}`,
      maxIterations,
      contextFiles: contextModes.length ? contextModes.map((item) => `context:${item}`) : mode.contextFiles,
    }
  })
}

function cliForMode(mode: AgentModeTemplate, clis: CliProviderTemplate[]) {
  return clis.find((cli) => cli.id === mode.cliTemplateId) ?? clis.find((cli) => cli.providerId === mode.provider)
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

function representativeMode(modes: AgentModeTemplate[], cli: CliProviderTemplate, runtimeMode: AgentRuntimeMode) {
  const candidates = modes.filter((mode) => mode.mode === runtimeMode)
  return candidates.find((mode) => mode.id === `${cli.providerId}-${runtimeMode}`)
    ?? candidates.find((mode) => mode.id === `${cli.id.replace(/-cli$/, "")}-${runtimeMode}`)
    ?? candidates.find((mode) => mode.controlSurface === cli.capabilities.controlSurface)
    ?? candidates[0]
}

export function AgentModesView() {
  const { t } = useI18n()
  const [items, setItems] = createSignal<AgentModeTemplate[]>(listAgentModeTemplates().map(cloneMode))
  const [selectedId, setSelectedId] = createSignal(items()[0]?.id ?? "")
  const [runtime, setRuntime] = createSignal<RuntimeSnapshot | null>(null)
  const [deriveError, setDeriveError] = createSignal<string | null>(null)
  const cliItems = createMemo(() => listCliTemplates())
  const modes = createMemo(() => hydrateBackendModes(items(), runtime()))
  const selected = () => items().find((mode) => mode.id === selectedId()) ?? items()[0]
  const cliGroups = createMemo(() => {
    return cliItems().map((cli) => {
      const live = runtime()?.cliInfo?.liveSnapshots?.find((snapshot) => snapshot.cliTemplateId === cli.id || snapshot.providerId === cli.providerId)
      const cliModes = modes().filter((mode) => {
        const owner = cliForMode(mode, cliItems())
        if (owner?.id !== cli.id) return false
        return !isOpencodeCustomCardMode(mode)
      })
      const runtimeModes = (live?.modeOptions?.map((option) => option.id) ?? live?.supportedModes ?? cli.capabilities.supportedModes)
        .filter((mode, index, list): mode is AgentRuntimeMode => Boolean(mode) && list.indexOf(mode) === index)
      const modeOptions = runtimeModes.map((runtimeMode) => ({
        id: runtimeMode,
        label: cli.id === "direct-api-cli"
          ? t("agentModes.directMode")
          : (live?.modeOptions?.find((option) => option.id === runtimeMode)?.label
            ?? t(`agentModes.runtimeMode.${runtimeMode}`, {}) !== `agentModes.runtimeMode.${runtimeMode}`
              ? t(`agentModes.runtimeMode.${runtimeMode}`)
              : titleCase(runtimeMode)),
        template: representativeMode(cliModes, cli, runtimeMode),
      }))
      const customCount = cliModes.filter((mode) => mode.controlSurface === "customizable" && !mode.id.startsWith(`${cli.providerId}-`)).length
      return { cli, key: cli.id, label: cli.name, modes: cliModes, modeOptions, customCount }
    }).sort((a, b) => a.label.localeCompare(b.label))
  })
  const customGroups = createMemo(() => groupOpencodeCustomModes(modes()))
  const customModeCount = createMemo(() => modes().filter(isOpencodeCustomCardMode).length)

  function persist(current: AgentModeTemplate, previousId: string) {
    if (previousId !== current.id) {
      renameAgentModeTemplateId(previousId, current.id, current)
    } else {
      registerAgentModeTemplate(new PlainAgentModeTemplate(current))
    }
  }

  function update(patch: Partial<AgentModeTemplate>, previousId?: string) {
    const current = selected()
    if (!current) return
    const next = { ...current, ...patch }
    const oldId = previousId ?? current.id
    setItems((list) => list.map((mode) => mode.id === oldId ? next : mode))
    if (patch.id) setSelectedId(patch.id)
    persist(next, oldId)
  }

  function deriveFromSelected() {
    const base = selected()
    if (!base) return
    const derived = cloneMode({
      ...base,
      id: `${base.id}-custom-${Date.now()}`,
      name: `${base.name} ${t("agentModes.derivedCustomSuffix")}`,
      description: t("agentModes.derivedFrom", { name: base.name }),
      controlSurface: "customizable",
      model: base.model || "workflow-selected",
    })
    registerAgentModeTemplate(new PlainAgentModeTemplate({
      ...derived,
      origin: "custom",
      inheritsFromAgentModeId: base.id,
      fieldPolicy: {
        model: "inherited",
        defaultSystemPrompt: "editable",
        defaultUserPromptBias: "editable",
        contextMode: "editable",
        maxIterations: "editable",
        timeoutMs: "editable",
        allowFileWrites: "editable",
        allowSystemPromptOverride: "editable",
      },
    } as any))
    setItems((list) => [derived, ...list])
    setSelectedId(derived.id)
  }

  async function deriveFromOpencode(mode: AgentModeTemplate["mode"] = "chat") {
    setDeriveError(null)
    try {
      const spec = await fetchOpencodeDerivedMode(mode === "review" || mode === "agent" ? "build" : mode)
      const derived = agentModeFromOpencodeDerived(spec)
      registerAgentModeTemplate(new PlainAgentModeTemplate(derived))
      setItems((list) => [derived, ...list.filter((item) => item.id !== derived.id)])
      setSelectedId(derived.id)
    } catch (error) {
      setDeriveError(error instanceof Error ? error.message : t("agentModes.deriveError"))
    }
  }

  onMount(() => {
    setItems(listAgentModeTemplates().map(cloneMode))
    getRuntimeSnapshot().then(setRuntime).catch(() => setRuntime(null))
  })

  return (
    <div class="template-registry-view">
      <header class="view-heading view-heading--split">
        <div>
          <span class="eyebrow">{t("agentModes.eyebrow")}</span>
          <h2>{t("agentModes.title")}</h2>
          <p>{t("agentModes.subtitle")}</p>
        </div>
        <div class="registry-head-actions">
          <button class="registry-add-button" type="button" onClick={() => void deriveFromOpencode("chat")}><Icon name="import" size={15} />{t("agentModes.mirrorChat")}</button>
          <button class="registry-add-button" type="button" onClick={() => void deriveFromOpencode("plan")}><Icon name="import" size={15} />{t("agentModes.mirrorPlan")}</button>
          <button class="registry-add-button" type="button" onClick={() => void deriveFromOpencode("build")}><Icon name="import" size={15} />{t("agentModes.mirrorBuild")}</button>
          <button class="registry-add-button" type="button" onClick={deriveFromSelected}><Icon name="template" size={15} />{t("agentModes.deriveSelected")}</button>
        </div>
      </header>
      <Show when={deriveError()}>
        <p class="registry-error">{deriveError()}</p>
      </Show>
      <div class="registry-editor-layout agent-mode-editor-layout">
        <div class="template-registry-grid agent-mode-cli-grid">
          <For each={cliGroups()}>
            {(group) => (
              <article class="template-registry-card wf-glass agent-mode-cli-card" classList={{ active: group.modes.some((mode) => mode.id === selectedId()) }}>
                <div class="registry-card-head">
                  <Icon name="agent" size={22} />
                  <div>
                    <h3>{group.label}</h3>
                    <span>{group.cli.id} / {group.cli.capabilities.controlSurface}</span>
                  </div>
                </div>
                <p>{group.cli.description}</p>
                <div class="agent-mode-chip-row">
                  <For each={group.modeOptions}>
                    {(option) => (
                      <button
                        type="button"
                        class="agent-mode-chip"
                        disabled={!option.template}
                        classList={{ active: Boolean(option.template && option.template.id === selectedId()) }}
                        onClick={() => option.template && setSelectedId(option.template.id)}
                      >
                        {option.label}
                      </button>
                    )}
                  </For>
                </div>
                <Show when={group.modes.length}>
                  <div class="agent-mode-custom-list">
                    <span class="eyebrow">{t("agentModes.allStrategies", { count: group.modes.length })}</span>
                    <div class="agent-mode-chip-row">
                      <For each={[...group.modes].sort((a, b) => a.name.localeCompare(b.name))}>
                        {(mode) => (
                          <button
                            type="button"
                            class="agent-mode-chip agent-mode-chip--named"
                            classList={{ active: mode.id === selectedId() }}
                            onClick={() => setSelectedId(mode.id)}
                            title={mode.id}
                          >
                            {mode.name}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
                <div class="registry-meta-grid">
                  <span>{t("agentModes.meta.nativeModes")} <b>{group.modeOptions.map((mode) => mode.label).join(", ")}</b></span>
                  <span>{t("agentModes.meta.modelBinding")} <b>{group.cli.capabilities.modelBinding ?? t("agentModes.meta.cliNative")}</b></span>
                  <span>{t("agentModes.meta.model")} <b>{group.cli.capabilities.modelBinding === "llm-api" ? t("agentModes.meta.fromLlmApi") : t("agentModes.meta.workflowSelected")}</b></span>
                  <span>{t("agentModes.meta.derive")} <b>{group.cli.capabilities.allowDerivedAgentModes ? t("agentModes.meta.allowed") : t("agentModes.meta.fixed")}</b></span>
                  <span>{t("agentModes.meta.customModes")} <b>{group.customCount}</b></span>
                  <span>{t("agentModes.meta.editable")} <b>{group.cli.capabilities.editableAgentModeFields?.join(", ") || t("agentModes.meta.none")}</b></span>
                </div>
              </article>
            )}
          </For>
          <Show when={customGroups().length}>
            <article
              class="template-registry-card wf-glass agent-mode-cli-card agent-mode-custom-card"
              classList={{ active: customGroups().some((group) => group.modes.some((mode) => mode.id === selectedId())) }}
            >
              <div class="registry-card-head">
                <Icon name="template" size={22} />
                <div>
                  <h3>{t("agentModes.customTitle")}</h3>
                  <span>{t("agentModes.customSubtitle")}</span>
                </div>
              </div>
              <p>{t("agentModes.customDescription")}</p>
              <For each={customGroups()}>
                {(roleGroup) => (
                  <div class="agent-mode-custom-list">
                    <span class="eyebrow">{t(`agentModes.roles.${roleGroup.role}`)}</span>
                    <div class="agent-mode-chip-row">
                      <For each={roleGroup.modes}>
                        {(mode) => {
                          const aliases = aliasModesForCanonical(modes(), mode.id)
                          return (
                            <div class="agent-mode-chip-row agent-mode-chip-row--inline">
                              <button
                                type="button"
                                class="agent-mode-chip agent-mode-chip--named"
                                classList={{ active: mode.id === selectedId() }}
                                onClick={() => setSelectedId(mode.id)}
                                title={mode.id}
                              >
                                {mode.name}
                              </button>
                              <For each={aliases}>
                                {(alias) => (
                                  <button
                                    type="button"
                                    class="agent-mode-chip agent-mode-chip--alias"
                                    classList={{ active: alias.id === selectedId() }}
                                    onClick={() => setSelectedId(alias.id)}
                                    title={`${alias.id} → ${mode.id}`}
                                  >
                                    {alias.name}
                                  </button>
                                )}
                              </For>
                            </div>
                          )
                        }}
                      </For>
                    </div>
                  </div>
                )}
              </For>
              <div class="registry-meta-grid">
                <span>{t("agentModes.meta.namespace")} <b>custom</b></span>
                <span>{t("agentModes.meta.provider")} <b>opencode</b></span>
                <span>{t("agentModes.meta.modes")} <b>{customModeCount()}</b></span>
                <span>{t("agentModes.meta.ioPlanner")} <b>custom-io-planner</b></span>
              </div>
            </article>
          </Show>
        </div>
        <aside class="registry-editor wf-glass">
          <div class="panel-heading"><span>{t("agentModes.selectedStrategy")}</span><strong>{selected()?.id ?? t("agentModes.none")}</strong></div>
          <For each={selected() ? [selected()!] : []}>
            {(mode) => {
              const cliOwned = mode.controlSurface === "cli-owned"
              return (
                <div class="editor-form">
                  <label>{t("agentModes.form.id")}<input value={mode.id} onInput={(event) => update({ id: event.currentTarget.value }, mode.id)} /></label>
                  <label>{t("agentModes.form.name")}<input value={mode.name} onInput={(event) => update({ name: event.currentTarget.value })} /></label>
                  <label>{t("agentModes.form.cli")}<input value={mode.cliTemplateId ?? mode.provider} disabled /></label>
                  <Show when={!isCliStrategyMode(mode)}>
                    <label>{t("agentModes.form.mode")}<select value={mode.mode} disabled={cliOwned} onChange={(event) => update({ mode: event.currentTarget.value as AgentModeTemplate["mode"] })}>
                      <option value="chat">{t("agentModes.runtimeMode.chat")}</option>
                      <option value="plan">{t("agentModes.runtimeMode.plan")}</option>
                      <option value="build">{t("agentModes.runtimeMode.build")}</option>
                      <option value="review">{t("agentModes.runtimeMode.review")}</option>
                      <option value="agent">{t("agentModes.runtimeMode.agent")}</option>
                    </select></label>
                  </Show>
                  <label>{t("agentModes.form.model")}<input value={t("agentModes.meta.workflowSelected")} disabled /></label>
                  <Show when={!isCliStrategyMode(mode)}>
                    <label>{t("agentModes.form.context")}<select value={mode.contextMode} disabled={cliOwned} onChange={(event) => update({ contextMode: event.currentTarget.value as AgentModeTemplate["contextMode"] })}>
                      <option value="fresh">{t("context.fresh")}</option>
                      <option value="inherit">{t("context.inherit")}</option>
                      <option value="summary">{t("context.summary")}</option>
                      <option value="fork">{t("context.fork")}</option>
                      <option value="artifacts">{t("context.artifacts")}</option>
                    </select></label>
                    <label>{t("agentModes.form.maxIterations")}<input type="number" value={cliOwned ? "" : mode.maxIterations} disabled={cliOwned} onInput={(event) => update({ maxIterations: Number(event.currentTarget.value) || 1 })} /></label>
                    <label>{t("agentModes.form.timeoutMs")}<input type="number" value={cliOwned ? "" : mode.timeoutMs} disabled={cliOwned} onInput={(event) => update({ timeoutMs: Number(event.currentTarget.value) || 0 })} /></label>
                  </Show>
                  <label>{t("agentModes.form.description")}<textarea value={mode.description} onInput={(event) => update({ description: event.currentTarget.value })} /></label>
                  <Show when={isCliStrategyMode(mode)}>
                    <AgentModeStrategyEditor mode={mode} cliOwned={cliOwned} onPatch={(patch) => update(patch)} />
                  </Show>
                  <Show when={!isCliStrategyMode(mode)}>
                    <label>{t("agentModes.form.systemPrompt")}<textarea value={mode.defaultSystemPrompt} disabled={cliOwned} onInput={(event) => update({ defaultSystemPrompt: event.currentTarget.value })} /></label>
                    <label>{t("agentModes.form.tools")}<textarea value={mode.allowedTools.join(", ")} disabled={cliOwned} onInput={(event) => update({ allowedTools: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
                    <div class="editor-checks">
                      <label><input type="checkbox" checked={mode.allowFileWrites} disabled={cliOwned} onChange={(event) => update({ allowFileWrites: event.currentTarget.checked })} />{t("agentModes.form.fileWrites")}</label>
                      <label><input type="checkbox" checked={mode.allowSystemPromptOverride} disabled={cliOwned} onChange={(event) => update({ allowSystemPromptOverride: event.currentTarget.checked })} />{t("agentModes.form.systemOverride")}</label>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </aside>
      </div>
    </div>
  )
}
