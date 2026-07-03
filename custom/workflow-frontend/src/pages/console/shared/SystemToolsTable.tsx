import { createSignal, For, Show } from "solid-js"

import type { CatalogToolRow } from "../../../api/drawmoon"
import { useI18n } from "../../../i18n"
import { formatToolParamSummary, ToolParameterBlock } from "./ToolParameterBlock"
import { ToolImplementationBlock } from "./ToolImplementationBlock"

function runtimeLabel(runtime: string) {
  switch (runtime) {
    case "mcp": return "MCP"
    case "opencode-vendor": return "OpenCode"
    case "hybrid": return "Hybrid"
    default: return "Static"
  }
}

export function SystemToolsTable(props: { tools: CatalogToolRow[] }) {
  const { t } = useI18n()
  const [expandedId, setExpandedId] = createSignal<string | null>(null)

  return (
    <div class="system-tools-table-wrap">
      <table class="system-tools-table">
        <colgroup>
          <col class="col-id" />
          <col class="col-runtime" />
          <col class="col-opencode" />
          <col class="col-impl" />
          <col class="col-params" />
        </colgroup>
        <thead>
          <tr>
            <th>{t("tools.columns.toolId")}</th>
            <th>{t("tools.columns.runtime")}</th>
            <th>{t("tools.columns.opencode")}</th>
            <th>{t("tools.columns.implementation")}</th>
            <th>{t("tools.columns.parameters")}</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.tools}>
            {(tool) => {
              const open = () => expandedId() === tool.systemToolId
              const paramSummary = () => formatToolParamSummary(tool.parameters ?? tool.mappedOpencodeParameters, 6)
              const hasDetail = () => Boolean(
                tool.implementation
                || tool.parameters?.length
                || tool.mappedOpencodeParameters?.length
                || tool.inputSchema,
              )
              return (
                <>
                  <tr
                    class="system-tools-row"
                    classList={{ "is-expanded": open(), "is-clickable": hasDetail() }}
                    onClick={() => {
                      if (!hasDetail()) return
                      setExpandedId(open() ? null : tool.systemToolId)
                    }}
                  >
                    <td class="system-tools-id"><code>{tool.systemToolId}</code></td>
                    <td class="system-tools-runtime">
                      <Show when={tool.implementation} fallback="—">
                        <span class="strategy-kv-tag">{runtimeLabel(tool.implementation!.runtime)}</span>
                      </Show>
                    </td>
                    <td class="system-tools-opencode">
                      <Show when={tool.opencodeToolId} fallback="—">
                        <code>{tool.opencodeToolId}</code>
                      </Show>
                    </td>
                    <td class="system-tools-impl">
                      {tool.implementation?.summary ?? tool.descriptionPreview ?? "—"}
                    </td>
                    <td class="system-tools-params">
                      <Show when={paramSummary()} fallback="—">
                        <span class="tool-param-summary tool-param-summary--wrap">{paramSummary()}</span>
                      </Show>
                    </td>
                  </tr>
                  <Show when={open()}>
                    <tr class="system-tools-detail">
                      <td colspan={5}>
                        <Show when={tool.implementation}>
                          <ToolImplementationBlock implementation={tool.implementation!} t={t} />
                        </Show>
                        <ToolParameterBlock tool={tool} t={t} />
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
