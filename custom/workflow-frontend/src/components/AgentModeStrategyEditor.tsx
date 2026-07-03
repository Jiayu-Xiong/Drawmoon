import { createEffect, createMemo, createSignal, For, Show } from "solid-js"

import { resolveMergedAgentModeTemplate } from "../data/agent-mode-templates/opencode-custom-template"
import {
  cliStrategyLabelKey,
  groupExposedKv,
  isCliStrategyMode,
  overlayPatchFromKey,
  strategyFieldDescription,
  strategyFieldLabel,
  strategyGroupLabel,
  strategyPreviewRequestBody,
  strategySourceBadge,
  strategyToolSourceBadge,
  type CliStrategyPreview,
  type ExposedStrategyKv,
} from "../data/agent-mode-strategy-kv"
import { useI18n } from "../i18n"
import { json } from "../api/http-client"

interface Props {
  mode: AgentModeTemplate
  cliOwned?: boolean
  readOnly?: boolean
  compact?: boolean
  onPatch?: (patch: Partial<AgentModeTemplate>) => void
}

export function AgentModeStrategyEditor(props: Props) {
  const { t } = useI18n()
  const [preview, setPreview] = createSignal<CliStrategyPreview | null>(null)
  const [previewError, setPreviewError] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)

  const effectiveMode = () => resolveMergedAgentModeTemplate(props.mode.id) ?? props.mode
  const locked = () => props.readOnly || props.cliOwned || props.mode.controlSurface !== "customizable"
  const exposedGroups = createMemo(() => groupExposedKv(preview()?.exposedKv ?? []))
  const cliLabel = () => {
    const key = cliStrategyLabelKey(props.mode)
    const label = t(key, { provider: props.mode.provider })
    return label === key ? preview()?.cliLabel ?? props.mode.provider : label
  }

  function patch(next: Partial<AgentModeTemplate>) {
    if (locked() || !props.onPatch) return
    props.onPatch(next)
  }

  function updateKv(item: ExposedStrategyKv, value: string) {
    if (!item.editable || locked()) return
    const overlayPatch = overlayPatchFromKey(item.key, value, props.mode)
    if (overlayPatch) patch(overlayPatch)
  }

  async function loadPreview() {
    const mode = effectiveMode()
    if (!isCliStrategyMode(mode)) return
    setPreviewError(null)
    setLoading(true)
    try {
      const res = await json<{ preview: CliStrategyPreview }>("/cli/strategy-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(strategyPreviewRequestBody(mode)),
      })
      setPreview(res.preview)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err))
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  createEffect(() => {
    props.mode.id
    props.mode.provider
    props.mode.defaultSystemPrompt
    props.mode.defaultUserPromptBias
    props.mode.constraints
    props.mode.mode
    props.mode.allowedTools
    props.mode.controlSurface
    void loadPreview()
  })

  return (
    <div class="agent-mode-strategy-editor" classList={{ "agent-mode-strategy-editor--compact": props.compact }}>
      <div class="panel-heading agent-mode-strategy-heading">
        <span>{t("strategy.titleForCli", { cli: cliLabel() })}</span>
        <Show when={preview()?.opencodeAgent}>
          <strong class="strategy-agent-badge">{t("strategy.agentFlag", { name: preview()!.opencodeAgent! })}</strong>
        </Show>
        <Show when={preview()?.totals?.estimatedPromptTokens}>
          <span class="strategy-token-badge">
            {t("strategy.badge.tokens", { count: preview()!.totals!.estimatedPromptTokens!.toLocaleString() })}
            <Show when={preview()!.totals!.estimatedSchemaTokens}>
              {" "}{t("strategy.badge.schemaTokens", { count: preview()!.totals!.estimatedSchemaTokens!.toLocaleString() })}
            </Show>
          </span>
        </Show>
        <button type="button" class="registry-add-button" disabled={loading()} onClick={() => void loadPreview()}>
          {loading() ? t("strategy.loading") : t("strategy.refresh")}
        </button>
      </div>
      <p class="agent-mode-strategy-hint">{t("strategy.hintForCli", { cli: cliLabel() })}</p>

      <Show when={preview()?.tools?.length}>
        <div class="strategy-tool-list">
          <span class="eyebrow">{t("strategy.mappedTools")}</span>
          <div class="strategy-tool-chips">
            <For each={preview()!.tools}>
              {(tool) => (
                <span class="strategy-tool-chip" title={tool.description}>
                  {tool.systemToolId}
                  <Show when={tool.opencodeToolId}>
                    <code>→ {tool.opencodeToolId}</code>
                  </Show>
                  <span class="strategy-kv-tag">{strategyToolSourceBadge(t, tool.source)}</span>
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={!preview()?.exposedKv?.length && !loading() && !previewError()}>
        <p class="editor-note">{t("strategy.startBackendForCli", { cli: cliLabel() })}</p>
      </Show>

      <For each={exposedGroups()}>
        {(group) => (
          <details class="strategy-kv-group" open>
            <summary>
              <span>{strategyGroupLabel(t, group.group)}</span>
              <b>{group.items.length}</b>
            </summary>
            <div class="strategy-kv-group-body">
              <For each={group.items}>
                {(item) => (
                  <label class="strategy-kv-field" classList={{ "strategy-kv-field--readonly": !item.editable || locked() }}>
                    <span class="strategy-kv-label">
                      {strategyFieldLabel(t, item)}
                      <code class="strategy-kv-key">{item.key}</code>
                      <Show when={item.tokens}>
                        <span class="strategy-kv-tag">{t("strategy.badge.tokens", { count: item.tokens!.toLocaleString() })}</span>
                      </Show>
                      <Show when={item.toolSource}>
                        <span class="strategy-kv-tag">{strategyToolSourceBadge(t, item.toolSource!)}</span>
                      </Show>
                      <Show when={item.source === "runtime" && !item.toolSource}>
                        <span class="strategy-kv-tag">{strategySourceBadge(t, "runtime")}</span>
                      </Show>
                      <Show when={item.source === "vendor" && !item.toolSource}>
                        <span class="strategy-kv-tag">{strategySourceBadge(t, "vendor")}</span>
                      </Show>
                      <Show when={item.source === "overlay"}>
                        <span class="strategy-kv-tag">{strategySourceBadge(t, "overlay")}</span>
                      </Show>
                      <Show when={!item.editable || locked()}>
                        <span class="strategy-kv-tag">{strategySourceBadge(t, "locked")}</span>
                      </Show>
                    </span>
                    <Show when={item.description}>
                      <span class="strategy-kv-desc">{strategyFieldDescription(t, item.description)}</span>
                    </Show>
                    <textarea
                      rows={item.value.length > 200 || (item.tokens ?? 0) > 80 ? 10 : 3}
                      disabled={!item.editable || locked()}
                      value={item.value}
                      onInput={(e) => updateKv(item, e.currentTarget.value)}
                    />
                  </label>
                )}
              </For>
            </div>
          </details>
        )}
      </For>

      <Show when={previewError()}>
        <p class="registry-error">{previewError()}</p>
      </Show>
    </div>
  )
}
