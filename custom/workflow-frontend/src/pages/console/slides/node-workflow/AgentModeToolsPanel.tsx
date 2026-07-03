import { createMemo, createSignal, For, onMount, Show } from "solid-js"

import { fetchToolCatalog, type ToolCatalog, type ToolCatalogEntry } from "../../../../api/drawmoon"
import { listAgentModeTemplates } from "../../../../data/agent-mode-templates"
import { resolveMergedAgentModeTemplate } from "../../../../data/agent-mode-templates/opencode-custom-template"
import { strategyToolSourceBadge } from "../../../../data/agent-mode-strategy-kv"
import { lookupSystemToolMapping } from "../../../../data/tool-mapping"
import { useI18n } from "../../../../i18n"
import { formatToolParamSummary, ToolParameterBlock } from "../../shared/ToolParameterBlock"
import { ToolImplementationBlock } from "../../shared/ToolImplementationBlock"

function catalogEntryForTool(catalog: ToolCatalog | null, systemToolId: string): ToolCatalogEntry | undefined {
  if (!catalog) return undefined
  return (
    catalog.unifiedSystemTools?.find((tool) => tool.systemToolId === systemToolId)
    ?? catalog.systemTools.find((tool) => tool.systemToolId === systemToolId)
    ?? catalog.opencodeTools.find((tool) => tool.id === systemToolId)
    ?? catalog.customTools.find((tool) => tool.id === systemToolId)
  )
}

export function AgentModeToolsPanel() {
  const { t } = useI18n()
  const [catalog, setCatalog] = createSignal<ToolCatalog | null>(null)
  const [expandedMode, setExpandedMode] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)

  const frontendAgentBindings = createMemo(() => {
    return listAgentModeTemplates()
      .filter((mode) => mode.provider === "opencode" && mode.cliTemplateId === "opencode-cli")
      .map((mode) => {
        const resolved = resolveMergedAgentModeTemplate(mode.id) ?? mode
        return {
          id: mode.id,
          name: resolved.name,
          mode: resolved.mode,
          tools: resolved.allowedTools.map((toolId) => {
            const mapping = lookupSystemToolMapping(toolId)
            const catalogEntry = catalogEntryForTool(catalog(), toolId)
            return {
              systemToolId: toolId,
              opencodeToolId: mapping?.opencodeToolId ?? catalogEntry?.opencodeToolId ?? null,
              source: mapping?.source ?? catalogEntry?.source ?? "static",
              description: mapping?.description ?? catalogEntry?.description,
              descriptionPreview: catalogEntry?.descriptionPreview,
              parameters: catalogEntry?.parameters,
              inputSchema: catalogEntry?.inputSchema,
              mappedOpencodeParameters: catalogEntry?.mappedOpencodeParameters,
              implementation: catalogEntry?.implementation,
            }
          }),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  onMount(() => {
    void fetchToolCatalog()
      .then(setCatalog)
      .catch(() => setCatalog(null))
      .finally(() => setLoading(false))
  })

  return (
    <div class="agent-mode-tools-panel">
      <div class="panel-heading panel-heading--dense">
        <span>{t("tools.agentModeBindings")}</span>
        <strong>{frontendAgentBindings().length}</strong>
        <Show when={loading()}><span class="tools-hint tools-hint--inline">{t("tools.loadingLibrary")}</span></Show>
      </div>
      <table class="agent-mode-tools-table">
        <thead>
          <tr>
            <th>{t("nodeManager.columns.mode")}</th>
            <th>{t("nodeManager.columns.tools")}</th>
          </tr>
        </thead>
        <tbody>
          <For each={frontendAgentBindings()}>
            {(binding) => {
              const expanded = () => expandedMode() === binding.id
              return (
                <>
                  <tr
                    class="agent-mode-tools-row"
                    classList={{ "is-expanded": expanded() }}
                    onClick={() => setExpandedMode(expanded() ? null : binding.id)}
                  >
                    <td class="agent-mode-tools-mode">
                      <strong>{binding.name}</strong>
                      <code>{binding.id}</code>
                      <span class="strategy-kv-tag">{binding.mode}</span>
                    </td>
                    <td class="agent-mode-tools-chips">
                      <For each={binding.tools}>
                        {(tool) => (
                          <span class="strategy-tool-chip strategy-tool-chip--dense" title={tool.description}>
                            {tool.systemToolId}
                            <Show when={tool.opencodeToolId}><code>→{tool.opencodeToolId}</code></Show>
                            <span class="strategy-kv-tag">{strategyToolSourceBadge(t, tool.source)}</span>
                            <Show when={tool.parameters?.length || tool.mappedOpencodeParameters?.length}>
                              <span class="tool-param-summary">
                                {formatToolParamSummary(tool.parameters ?? tool.mappedOpencodeParameters)}
                              </span>
                            </Show>
                          </span>
                        )}
                      </For>
                    </td>
                  </tr>
                  <Show when={expanded()}>
                    <tr class="agent-mode-tools-detail">
                      <td colspan={2}>
                        <div class="agent-mode-tools-detail-grid">
                          <For each={binding.tools}>
                            {(tool) => (
                              <div class="tools-entry tools-entry--tool tools-entry--dense">
                                <div class="tools-entry-row">
                                  <strong>{tool.systemToolId}</strong>
                                  <Show when={tool.opencodeToolId}><code>→ {tool.opencodeToolId}</code></Show>
                                  <span class="strategy-kv-tag">{strategyToolSourceBadge(t, tool.source)}</span>
                                </div>
                                <Show when={tool.implementation}>
                                  <ToolImplementationBlock implementation={tool.implementation!} t={t} />
                                </Show>
                                <ToolParameterBlock tool={tool} t={t} />
                              </div>
                            )}
                          </For>
                        </div>
                      </td>
                    </tr>
                  </Show>
                </>
              )
            }}
          </For>
        </tbody>
      </table>
    </div>
  )
}
