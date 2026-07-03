import { For, Show } from "solid-js"

import type { CatalogToolRow, ToolParameterDef } from "../../../api/drawmoon"

function paramSig(param: ToolParameterDef) {
  return `${param.name}${param.required ? "*" : ""}:${param.type ?? "?"}`
}

export function formatToolParamSummary(parameters?: ToolParameterDef[], max = 4) {
  if (!parameters?.length) return ""
  const head = parameters.slice(0, max).map(paramSig)
  const rest = parameters.length - head.length
  return rest > 0 ? `${head.join(" ")} +${rest}` : head.join(" ")
}

export function ToolParameterBlock(props: {
  tool: Pick<CatalogToolRow, "parameters" | "mappedOpencodeParameters" | "opencodeToolId" | "description" | "descriptionPreview" | "inputSchema">
  t: (key: string, vars?: Record<string, string>) => string
  compact?: boolean
}) {
  const hasParams = () => (props.tool.parameters?.length ?? 0) > 0
  const hasMapped = () => Boolean(props.tool.opencodeToolId && (props.tool.mappedOpencodeParameters?.length ?? 0) > 0)
  const longDescription = () => {
    const text = props.tool.description?.trim()
    if (!text) return undefined
    if (text === props.tool.descriptionPreview?.trim()) return undefined
    return text.length > 120 ? text : undefined
  }

  return (
    <Show when={hasParams() || hasMapped() || longDescription() || props.tool.inputSchema}>
      <div class="tool-parameter-block" classList={{ "tool-parameter-block--compact": props.compact !== false }}>
        <Show when={hasParams()}>
          <ParamTable
            caption={props.t("tools.parameters")}
            parameters={props.tool.parameters!}
            requiredLabel={props.t("tools.required")}
          />
        </Show>
        <Show when={hasMapped()}>
          <ParamTable
            caption={props.t("tools.mappedOpencodeTool", { tool: props.tool.opencodeToolId ?? "" })}
            parameters={props.tool.mappedOpencodeParameters!}
            requiredLabel={props.t("tools.required")}
          />
        </Show>
        <Show when={longDescription()}>
          <details class="tool-parameter-details">
            <summary>{props.t("tools.fullDescription")}</summary>
            <pre class="tool-parameter-pre">{props.tool.description}</pre>
          </details>
        </Show>
        <Show when={props.tool.inputSchema}>
          <details class="tool-parameter-details">
            <summary>{props.t("tools.inputSchema")}</summary>
            <pre class="tool-parameter-pre">{JSON.stringify(props.tool.inputSchema, null, 2)}</pre>
          </details>
        </Show>
      </div>
    </Show>
  )
}

function ParamTable(props: {
  caption: string
  parameters: ToolParameterDef[]
  requiredLabel: string
}) {
  return (
    <div class="tool-param-section">
      <div class="tool-param-caption">{props.caption}</div>
      <table class="tool-param-table">
        <thead>
          <tr>
            <th>param</th>
            <th>type</th>
            <th>desc</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.parameters}>
            {(param) => (
              <tr>
                <td>
                  <code>{param.name}</code>
                  <Show when={param.required}><span class="tool-param-req" title={props.requiredLabel}>*</span></Show>
                </td>
                <td>{param.type ?? "—"}</td>
                <td class="tool-param-desc">{param.description ?? "—"}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}
