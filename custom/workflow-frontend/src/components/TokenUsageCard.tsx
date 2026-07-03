import { Show } from "solid-js"

import type { TokenUsageSnapshot } from "../data/console-model"

function compact(value: number) {
  return value >= 1000 ? value.toLocaleString() : String(value)
}

export function TokenUsageCard(props: { usage?: TokenUsageSnapshot; compact?: boolean }) {
  return (
    <Show when={props.usage}>
      {(usage) => (
        <div class={`token-usage-card${props.compact ? " token-usage-card--compact" : ""}`}>
          <div class="token-usage-head">
            <strong>Token usage</strong>
            <span>{usage().source}</span>
          </div>
          <div class="token-usage-grid">
            <span>total <b>{compact(usage().totalTokens)}</b></span>
            <span>input <b>{compact(usage().inputTokens)}</b></span>
            <span>output <b>{compact(usage().outputTokens)}</b></span>
            <span>cache read <b>{compact(usage().cacheReadTokens)}</b></span>
            <span>cache write <b>{compact(usage().cacheWriteTokens)}</b></span>
            <Show when={usage().reasoningTokens != null}>
              <span>reasoning <b>{compact(usage().reasoningTokens!)}</b></span>
            </Show>
            <Show when={usage().costUsd != null}>
              <span>cost <b>${usage().costUsd!.toFixed(4)}</b></span>
            </Show>
            <Show when={usage().quotaPercentUsed != null}>
              <span>quota <b>{usage().quotaPercentUsed}%</b></span>
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}
