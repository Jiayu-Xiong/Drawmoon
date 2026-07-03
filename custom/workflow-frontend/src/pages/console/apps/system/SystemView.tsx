import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"

import type { BackendProvider, SystemSnapshot } from "../../../../data/console-model"
import { cliTemplates, DIRECT_API_CLI_ID } from "../../../../data/cli-templates"
import { getLlmApiTemplate } from "../../../../data/template-registry"
import { LanguageSwitch } from "../../../../components/LanguageSwitch"
import { useI18n } from "../../../../i18n"
import { AppButton, Glass, Sparkline, statusClass } from "../../shared/core"

export function SystemView(props: { providers: BackendProvider[]; snapshot: SystemSnapshot; onRefreshCliInfo?: () => void }) {
  const { t } = useI18n()
  const online = createMemo(() => props.providers.filter((item) => item.status === "online").length)
  const [selectedCliId, setSelectedCliId] = createSignal(cliTemplates[0]?.id ?? "")
  const [resourceTick, setResourceTick] = createSignal(0)
  const selectedCli = () => cliTemplates.find((cli) => cli.id === selectedCliId()) ?? cliTemplates[0]
  const selectedCliModels = createMemo(() => {
    const cli = selectedCli()
    if (!cli) return []
    if (cli.id === DIRECT_API_CLI_ID && cli.llmApiTemplateIds?.length) {
      return cli.llmApiTemplateIds.map((id) => {
        const api = getLlmApiTemplate(id)
        return {
          id,
          name: api?.name ?? id,
          statusLabel: api?.model ?? (api?.modalities?.join(", ") ?? "api"),
        }
      })
    }
    return cli.models ?? []
  })
  const liveResources = createMemo(() => props.snapshot.resources.map((item, index) => {
    const base = item.samples[item.samples.length - 1] ?? 20
    const wave = Math.round(Math.max(2, Math.min(96, base + Math.sin((resourceTick() + index * 7) / 3) * 12 + index * 2)))
    const value = item.name === "Memory" ? `${(6 + wave / 12).toFixed(1)} GB` : item.name === "Disk" ? `${wave} MB/s` : item.name === "Network I/O" ? `${Math.max(1, Math.round(wave / 8))} MB/s` : `${wave}%`
    return { ...item, value, samples: [...item.samples.slice(-7), wave] }
  }))

  onMount(() => {
    const interval = setInterval(() => setResourceTick((tick) => tick + 1), 1400)
    onCleanup(() => clearInterval(interval))
  })

  return (
    <div class="view-stack">
      <header class="view-heading view-heading--split">
        <div>
          <span class="eyebrow">{t("settings.systemStatus")}</span>
          <h2>{props.snapshot.status} / last updated {props.snapshot.lastUpdated}</h2>
          <p>Read-only runtime panel. Registry edits live in their dedicated template pages.</p>
        </div>
        <div class="quick-actions">
          <AppButton icon="refresh" onClick={() => props.onRefreshCliInfo?.()}>Refresh Status</AppButton>
          <AppButton icon="export">Export Diagnostics</AppButton>
          <AppButton icon="system">Open Console</AppButton>
        </div>
      </header>

      <div class="system-grid system-grid--dashboard">
        <Glass class="slide-data-card system-lang-card">
          <div class="panel-heading"><span>{t("settings.language")}</span></div>
          <p>{t("settings.languageHint")}</p>
          <LanguageSwitch />
          <p class="tools-hint">{t("settings.drawmoonHint")}</p>
        </Glass>
        <Glass class="slide-data-card">
          <div class="panel-heading"><span>Local Runtime</span><strong>{props.snapshot.cli.available ? "available" : "offline"}</strong></div>
          <p>{props.snapshot.cli.version}</p>
          <p>{props.snapshot.cli.uptime}</p>
          <small>{props.snapshot.cli.path}</small>
        </Glass>
        <Glass class="slide-data-card">
          <div class="panel-heading"><span>API Binding</span><strong>{props.snapshot.apiBinding.status}</strong></div>
          <p>{props.snapshot.apiBinding.endpoint}</p>
          <p>{props.snapshot.apiBinding.protocol}</p>
        </Glass>
        <Glass class="slide-data-card">
          <div class="panel-heading"><span>Runtime Process</span><strong>PID {props.snapshot.runtime.pid}</strong></div>
          <p>{props.snapshot.runtime.name}</p>
          <p>started {props.snapshot.runtime.startedAt}</p>
        </Glass>
        <Glass class="slide-data-card">
          <div class="panel-heading"><span>Provider Health</span><strong>{online()} / {props.providers.length}</strong></div>
          <p>{props.providers.filter((p) => p.status === "degraded").length} degraded / {props.providers.filter((p) => p.status === "offline").length} offline</p>
          <For each={props.providers}>
            {(provider) => <div class="provider-row"><span>{provider.name}</span><b class={statusClass(provider.status)}>{provider.status}</b></div>}
          </For>
        </Glass>

        <Glass class="providers-panel system-cli-panel">
          <div class="panel-heading"><span>CLI Registry</span><strong>{cliTemplates.length}</strong></div>
          <div class="system-cli-tabs">
            <For each={cliTemplates}>
              {(cli) => (
                <button class="provider-row provider-row--button" classList={{ active: cli.id === selectedCliId() }} onClick={() => setSelectedCliId(cli.id)}>
                  <span>{cli.name}</span>
                  <b>{cli.providerId}</b>
                </button>
              )}
            </For>
          </div>
        </Glass>
        <Glass class="system-cli-detail">
          <div class="panel-heading"><span>CLI Strategy</span><strong>{selectedCli()?.id ?? "none"}</strong></div>
          <p>{selectedCli()?.description}</p>
          <div class="registry-meta-grid">
            <span>startup <b>{selectedCli()?.startupCommand}</b></span>
            <span>control <b>{selectedCli()?.capabilities.controlSurface}</b></span>
            <span>derive <b>{selectedCli()?.capabilities.allowDerivedAgentModes ? "allowed" : "fixed"}</b></span>
            <span>quota <b>{selectedCli()?.capabilities.quota.kind}</b></span>
            <span>modes <b>{selectedCli()?.capabilities.supportedModes.join(", ") || "none"}</b></span>
            <span>editable <b>{selectedCli()?.capabilities.editableAgentModeFields?.join(", ") || "none"}</b></span>
          </div>
          <div class="system-dense-columns">
            <div>
              <span class="editor-subhead">Fields</span>
              <For each={selectedCli()?.fields ?? []}>
                {(field) => <div class="provider-row"><span>{field.key}</span><b>{field.value}</b></div>}
              </For>
            </div>
            <div>
              <span class="editor-subhead">Models</span>
              <For each={selectedCliModels()}>
                {(model) => <div class="provider-row"><span>{model.name}</span><b>{model.statusLabel}</b></div>}
              </For>
            </div>
          </div>
          <div class="system-command-list">
            <For each={selectedCli()?.commands ?? []}>
              {(command) => (
                <div class="system-command-row">
                  <b>{command.label}</b>
                  <code>{command.command} {command.args.join(" ")}</code>
                  <span>{command.consumesTokens ? "tokens" : "safe"}</span>
                </div>
              )}
            </For>
          </div>
        </Glass>

        <Glass class="resources-panel">
          <div class="panel-heading"><span>System Resources</span><strong>live shape</strong></div>
          <For each={liveResources()}>
            {(item) => <div class="resource-row"><span>{item.name}</span><Sparkline samples={item.samples} /><b>{item.value}</b></div>}
          </For>
        </Glass>
        <Glass class="slide-data-card">
          <div class="panel-heading"><span>Quota & Probes</span><strong>safe</strong></div>
          <p>{props.snapshot.quota.summary}</p>
          <div class="registry-meta-grid">
            <span>probes <b>{props.snapshot.quota.probes.length}</b></span>
            <span>online <b>{props.snapshot.quota.probes.filter((probe) => probe.status === "online").length}</b></span>
            <span>degraded <b>{props.snapshot.quota.probes.filter((probe) => probe.status === "degraded").length}</b></span>
            <span>offline <b>{props.snapshot.quota.probes.filter((probe) => probe.status === "offline").length}</b></span>
          </div>
        </Glass>
        <Glass class="slide-data-card">
          <div class="panel-heading"><span>Model Context</span><strong>metadata</strong></div>
          <For each={props.snapshot.modelContext.slice(0, 5)}>
            {(item) => <div class="provider-row"><span>{item.provider}</span><b>{item.model} / {item.context}</b></div>}
          </For>
        </Glass>
        <Glass class="slide-data-card">
          <div class="panel-heading"><span>Agent Runtime</span><strong>{props.snapshot.taskQueue.length} queued</strong></div>
          <For each={props.snapshot.taskQueue}>{(item) => <div class="provider-row"><span>{item.workflow}</span><b>{item.state}</b></div>}</For>
        </Glass>
        <Glass class="events-panel">
          <div class="panel-heading"><span>Recent Events</span><strong>stream</strong></div>
          <For each={props.snapshot.events}>
            {(event) => <div class={`event-row event-row--${event.level}`}><time>{event.time}</time><span>{event.source}</span><p>{event.message}</p></div>}
          </For>
        </Glass>
      </div>
    </div>
  )
}
