import { createMemo, For, Show } from "solid-js"

import { Icon } from "../../../../components/Icon"
import type { BackendProvider, CliLiveSnapshot, CliModeOption, CliQuotaKind } from "../../../../data/console-model"
import { agentModeFieldPolicy } from "../../../../data/templates/agent-mode-template"
import { getAgentModeTemplate, listAgentModeTemplates } from "../../../../data/template-registry"
import { statusClass } from "../../shared/core"

function quotaProgressLabel(kind: CliQuotaKind, live: CliLiveSnapshot) {
  const weekly = live.quota.windows?.find((w) => w.kind === "weekly") ?? live.quota.windows?.[0]
  const session = live.quota.windows?.find((w) => w.kind === "session")
  if (kind === "weekly_percent" && weekly?.remainingPercent != null) return `${weekly.remainingPercent}% remaining`
  if (kind === "monthly_usd" && live.quota.balanceUsd != null) return `$${live.quota.balanceUsd.toFixed(2)} balance`
  if (kind === "hourly" && session?.used != null) return `${session.used}h used`
  if (kind === "token" && weekly?.remaining != null) return `${weekly.remaining} tokens left`
  if (session?.remainingPercent != null) return `5h ${session.remainingPercent}% left`
  return live.quota.summary
}

function compactNumber(value?: number) {
  if (value == null || !Number.isFinite(value)) return "0"
  return value >= 1000 ? value.toLocaleString() : String(value)
}

function formatMoney(value?: number) {
  if (value == null || !Number.isFinite(value)) return "$0.0000"
  return `$${value.toFixed(4)}`
}

export function CliDashboardCard(props: { live: CliLiveSnapshot; provider?: BackendProvider }) {
  const kind = () => props.live.quota.kind
  const weeklyWindow = () => props.live.quota.windows?.find((w) => w.kind === "weekly") ?? props.live.quota.windows?.[0]
  const sessionWindow = () => props.live.quota.windows?.find((w) => w.kind === "session")
  const telemetry = createMemo(() => props.live.telemetry)
  const customFields = createMemo(() =>
    props.live.fields.filter((field) => String(field.value ?? "").trim() !== ""),
  )
  const modeOptions = createMemo<CliModeOption[]>(() =>
    props.live.modeOptions ?? props.live.supportedModes.map((mode) => ({
      id: mode,
      label: mode,
      editable: false,
      source: "native",
      description: undefined,
    })),
  )
  const editableBadges = createMemo(() => {
    const mode = listAgentModeTemplates().find((item) => item.cliTemplateId === props.live.cliTemplateId)
      ?? getAgentModeTemplate(`${props.live.cliTemplateId}-default`)
    const fields = ["defaultSystemPrompt", "model", "maxIterations", "timeoutMs"] as const
    return fields.map((field) => ({
      field,
      policy: mode ? agentModeFieldPolicy(mode, field) : (props.live.controlSurface === "customizable" ? "editable" : "readonly"),
    }))
  })

  return (
    <article class={`node-manager-card cli-dashboard-card slide-data-card ${statusClass(props.live.status)}`}>
      <div class="node-manager-card-head">
        <Icon name="system" size={16} />
        <span>{props.live.cliTemplateId}</span>
        <b class={statusClass(props.live.status)}>{props.live.status}</b>
      </div>
      <p class="path-line">{props.live.path ?? props.provider?.path ?? "not bound"}</p>
      <div class="registry-meta-grid">
        <span>version <b>{props.live.version ?? props.provider?.version ?? "—"}</b></span>
        <span>in use <b>{props.live.inUseNodeCount}</b></span>
        <span>surface <b>{props.live.controlSurface}</b></span>
        <span>derived modes <b>{props.live.allowDerivedAgentModes ? "yes" : "no"}</b></span>
      </div>
      <Show when={customFields().length}>
        <div class="cli-custom-kv">
          <div class="cli-custom-kv-head">
            <strong>CLI details</strong>
            <span>{customFields().length}</span>
          </div>
          <For each={customFields()}>
            {(field) => (
              <div class="cli-custom-kv-row">
                <span>{field.key}</span>
                <b title={field.value}>{field.value}</b>
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="cli-quota-block">
        <div class="cli-quota-head">
          <strong>Quota ({kind()})</strong>
          <span>{quotaProgressLabel(kind(), props.live)}</span>
        </div>
        <Show when={kind() === "weekly_percent" && weeklyWindow()?.remainingPercent != null}>
          <div class="cli-quota-meter">
            <div class="cli-quota-fill" style={{ width: `${weeklyWindow()?.remainingPercent ?? 0}%` }} />
          </div>
        </Show>
        <Show when={sessionWindow()?.remainingPercent != null}>
          <div class="cli-quota-sub">
            <span>5h window</span>
            <strong>{sessionWindow()?.remainingPercent}% left</strong>
          </div>
        </Show>
      </div>
      <Show when={telemetry()?.available}>
        <div class="cli-telemetry-block">
          <strong>Token usage ({telemetry()?.source})</strong>
          <div class="registry-meta-grid">
            <span>today <b>{compactNumber(telemetry()?.periods.today?.totalTokens)} tok</b></span>
            <span>month <b>{compactNumber(telemetry()?.periods.month?.totalTokens)} tok</b></span>
            <span>in today <b>{compactNumber(telemetry()?.periods.today?.inputTokens)}</b></span>
            <span>out today <b>{compactNumber(telemetry()?.periods.today?.outputTokens)}</b></span>
            <span>cache read <b>{compactNumber(telemetry()?.periods.today?.cacheReadTokens)}</b></span>
            <span>cache write <b>{compactNumber(telemetry()?.periods.today?.cacheWriteTokens)}</b></span>
            <span>cost today <b>{formatMoney(telemetry()?.periods.today?.costUsd)}</b></span>
            <span>sessions <b>{telemetry()?.activeSessionCount ?? 0}</b></span>
          </div>
        </div>
      </Show>
      <div class="cli-mode-pills">
        <For each={modeOptions()}>
          {(mode) => (
            <span
              classList={{
                "mode-pill": true,
                active: props.live.activeModesInWorkflow.includes(mode.id),
                editable: mode.editable,
              }}
              title={mode.description}
            >
              {mode.label}
              <Show when={!mode.editable}><em class="mode-lock">🔒</em></Show>
            </span>
          )}
        </For>
      </div>
      <div class="cli-models">
        <For each={props.live.models}>
          {(model) => (
            <div class="cli-model-row">
              <div class="cli-model-top">
                <b>{model.name}</b>
                <span class="cli-version">{model.statusLabel}</span>
              </div>
              <div class="cli-model-meta">
                <span>context</span>
                <span>{model.contextWindow ? model.contextWindow.toLocaleString() : "n/a"}</span>
              </div>
              <For each={model.fields}>
                {(field) => <div class="cli-model-meta"><span>{field.key}</span><span>{field.value}</span></div>}
              </For>
            </div>
          )}
        </For>
      </div>
      <div class="cli-editable-badges">
        <For each={editableBadges()}>
          {(item) => <span classList={{ "edit-badge": true, readonly: item.policy === "readonly", hidden: item.policy === "hidden" }}>{item.field}: {item.policy}</span>}
        </For>
      </div>
    </article>
  )
}
