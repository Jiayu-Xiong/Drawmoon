import { createSignal, Show } from "solid-js"

import { TokenUsageCard } from "../../../../components/TokenUsageCard"
import { TokenUsageByNodeTable, type TokenUsageByNodeEntry } from "../../../../components/TokenUsageByNodeTable"
import { useI18n } from "../../../../i18n"
import type { TokenUsageSnapshot } from "../../../../data/console-model"

export function WorkflowGlobalTokenBar(props: {
  usage?: TokenUsageSnapshot
  tokenByNode: TokenUsageByNodeEntry[]
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = createSignal(false)
  return (
    <section class="wf-global-token-bar">
      <TokenUsageCard usage={props.usage} compact />
      <button type="button" class="wf-global-token-bar__toggle" onClick={() => setExpanded((value) => !value)}>
        {expanded() ? t("run.collapseNodeUsage") : t("run.expandNodeUsage")}
      </button>
      <Show when={expanded()}>
        <TokenUsageByNodeTable rows={props.tokenByNode} />
      </Show>
    </section>
  )
}
