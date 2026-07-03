import { createMemo, For, Show } from "solid-js"

import type { TokenUsageSnapshot } from "../data/console-model"

function compact(value: number) {
  return value >= 1000 ? value.toLocaleString() : String(value)
}

export interface TokenUsageByNodeEntry {
  nodeId: string
  label: string
  usage: Pick<
    TokenUsageSnapshot,
    "totalTokens" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "reasoningTokens" | "costUsd"
  >
}

export function TokenUsageByNodeTable(props: { rows?: TokenUsageByNodeEntry[] }) {
  const rows = createMemo(() => props.rows ?? [])
  return (
    <Show when={rows().length > 0}>
      <div class="token-usage-by-node">
        <div class="token-usage-head">
          <strong>Per-node usage</strong>
        </div>
        <div class="token-usage-by-node-table">
          <div class="token-usage-by-node-row token-usage-by-node-row--head">
            <span>node</span>
            <span>in</span>
            <span>out</span>
            <span>cache r</span>
            <span>cache w</span>
            <span>total</span>
          </div>
          <For each={rows()}>
            {(row) => (
              <div class="token-usage-by-node-row">
                <span title={row.nodeId}>{row.label}</span>
                <span>{compact(row.usage.inputTokens)}</span>
                <span>{compact(row.usage.outputTokens)}</span>
                <span>{compact(row.usage.cacheReadTokens)}</span>
                <span>{compact(row.usage.cacheWriteTokens)}</span>
                <span><b>{compact(row.usage.totalTokens)}</b></span>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
