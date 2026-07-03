import { For, Show } from "solid-js"

import type { ToolImplementationSpec } from "../../../api/drawmoon"

export function ToolImplementationBlock(props: {
  implementation: ToolImplementationSpec
  t: (key: string, vars?: Record<string, string>) => string
}) {
  const impl = () => props.implementation
  const runtimeLabel = () => {
    switch (impl().runtime) {
      case "mcp": return "MCP"
      case "opencode-vendor": return "OpenCode"
      case "hybrid": return "Hybrid"
      default: return "Static"
    }
  }

  return (
    <div class="tool-impl-block">
      <div class="tool-impl-head">
        <span class="strategy-kv-tag tool-impl-runtime">{runtimeLabel()}</span>
        <Show when={impl().mcpServer}><code class="tool-impl-tag">mcp:{impl().mcpServer}</code></Show>
        <Show when={impl().opencodeBuiltin}><code class="tool-impl-tag">opencode:{impl().opencodeBuiltin}</code></Show>
      </div>
      <p class="tool-impl-summary">{impl().summary}</p>
      <ol class="tool-impl-steps">
        <For each={impl().steps}>{(step) => <li>{step}</li>}</For>
      </ol>
      <Show when={impl().sourceFiles.length}>
        <div class="tool-impl-sources">
          <span class="tool-impl-caption">{props.t("tools.implementationSources")}</span>
          <For each={impl().sourceFiles}>
            {(file) => (
              <div class="tool-impl-source-row">
                <code>{file.path}</code>
                <span>{file.role}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={impl().envVars?.length}>
        <div class="tool-impl-env">
          <span class="tool-impl-caption">{props.t("tools.implementationEnv")}</span>
          <code>{impl().envVars!.join(" · ")}</code>
        </div>
      </Show>
      <Show when={impl().handlerCode}>
        <details class="tool-parameter-details" open>
          <summary>{props.t("tools.implementationHandler")}</summary>
          <pre class="tool-parameter-pre tool-impl-code">{impl().handlerCode}</pre>
        </details>
      </Show>
    </div>
  )
}
