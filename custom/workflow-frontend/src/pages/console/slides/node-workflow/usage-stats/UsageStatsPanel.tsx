import { createEffect, createMemo, createSignal, For, onMount, Show, on } from "solid-js"

import { listWorkflowRuns, listTemplates, type WorkflowRunListItem, type WorkflowTemplateInfo } from "../../../../../api"
import { Icon } from "../../../../../components/Icon"
import { cliTemplates } from "../../../../../data/cli-templates"
import { listLlmApiTemplates } from "../../../../../data/llm-api-templates"
import { agentModeTemplates, workflowTemplates } from "../../../shared/core"
import { usageStatsService } from "./UsageStatsService"
import type { WorkflowUsageEvent, WorkflowUsageFilters } from "./types"

function compact(value: number) {
  return value >= 1000 ? value.toLocaleString() : String(value)
}

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function UsageStatsRow(props: { event: WorkflowUsageEvent }) {
  const e = () => props.event
  return (
    <article class="usage-stats-row slide-data-card">
      <div class="usage-stats-row-head">
        <strong>{e().nodeLabel ?? e().runName}</strong>
        <time datetime={e().occurredAt}>{formatWhen(e().occurredAt)}</time>
      </div>
      <div class="usage-stats-row-meta">
        <span>workflow <b>{e().runName}</b></span>
        <span>template <b>{e().templateId}</b></span>
        <Show when={e().nodeId}>
          <span>node <b>{e().nodeId}</b></span>
        </Show>
        <Show when={e().cliTemplateId || e().providerId}>
          <span>CLI <b>{e().cliTemplateId ?? e().providerId}</b></span>
        </Show>
        <Show when={e().llmApiId}>
          <span>API <b>{e().llmApiId}</b></span>
        </Show>
        <Show when={e().agentModeId}>
          <span>agent mode <b>{e().agentModeId}</b></span>
        </Show>
      </div>
      <div class="usage-stats-row-tokens">
        <span>total <b>{compact(e().usage.totalTokens)}</b></span>
        <span>in <b>{compact(e().usage.inputTokens)}</b></span>
        <span>out <b>{compact(e().usage.outputTokens)}</b></span>
        <Show when={e().usage.costUsd != null}>
          <span>cost <b>${e().usage.costUsd!.toFixed(4)}</b></span>
        </Show>
        <Show when={e().usage.source}>
          <span>source <b>{e().usage.source}</b></span>
        </Show>
      </div>
    </article>
  )
}

export function UsageStatsPanel() {
  const [filters, setFilters] = createSignal<WorkflowUsageFilters>({ limit: 20 })
  const [events, setEvents] = createSignal<WorkflowUsageEvent[]>([])
  const [total, setTotal] = createSignal(0)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [runs, setRuns] = createSignal<WorkflowRunListItem[]>([])
  const [templates, setTemplates] = createSignal<WorkflowTemplateInfo[]>([])

  const templateOptions = createMemo(() => {
    const fromApi = templates().map((item) => item.id)
    const fromUi = workflowTemplates.map((item) => item.id)
    return [...new Set([...fromApi, ...fromUi])].sort()
  })

  const runOptions = createMemo(() =>
    [...runs()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 80),
  )

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const result = await usageStatsService.query(filters())
      setEvents(result.events)
      setTotal(result.total)
    } catch (err) {
      setEvents([])
      setTotal(0)
      setError(err instanceof Error ? err.message : "Failed to load usage events.")
    } finally {
      setLoading(false)
    }
  }

  createEffect(on(
    () => JSON.stringify(filters()),
    () => { void load() },
    { defer: true },
  ))

  onMount(() => {
    void load()
    void listWorkflowRuns().then(setRuns).catch(() => setRuns([]))
    void listTemplates().then(setTemplates).catch(() => setTemplates([]))
  })

  function patchFilters(patch: Partial<WorkflowUsageFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  return (
    <div class="usage-stats-panel">
      <div class="node-provider-head">
        <span>Token usage ledger</span>
        <button type="button" class="node-provider-refresh" disabled={loading()} onClick={() => void load()}>
          <Icon name="refresh" size={14} />
          <strong>{loading() ? "Loading…" : "Refresh"}</strong>
        </button>
      </div>
      <div class="usage-stats-filters">
        <label>
          Since
          <input
            type="datetime-local"
            onInput={(event) => patchFilters({ since: event.currentTarget.value ? new Date(event.currentTarget.value).toISOString() : undefined })}
          />
        </label>
        <label>
          Until
          <input
            type="datetime-local"
            onInput={(event) => patchFilters({ until: event.currentTarget.value ? new Date(event.currentTarget.value).toISOString() : undefined })}
          />
        </label>
        <label>
          Template
          <select onChange={(event) => patchFilters({ templateId: event.currentTarget.value || undefined })}>
            <option value="">All templates</option>
            <For each={templateOptions()}>{(id) => <option value={id}>{id}</option>}</For>
          </select>
        </label>
        <label>
          Workflow run
          <select onChange={(event) => patchFilters({ runId: event.currentTarget.value || undefined })}>
            <option value="">All runs</option>
            <For each={runOptions()}>{(run) => <option value={run.id}>{run.name}</option>}</For>
          </select>
        </label>
        <label>
          CLI
          <select onChange={(event) => patchFilters({ cli: event.currentTarget.value || undefined })}>
            <option value="">All CLI</option>
            <For each={cliTemplates}>{(cli) => <option value={cli.id}>{cli.name}</option>}</For>
          </select>
        </label>
        <label>
          API
          <select onChange={(event) => patchFilters({ api: event.currentTarget.value || undefined })}>
            <option value="">All API</option>
            <For each={listLlmApiTemplates()}>{(api) => <option value={api.id}>{api.name}</option>}</For>
          </select>
        </label>
        <label>
          Agent mode
          <select onChange={(event) => patchFilters({ agentMode: event.currentTarget.value || undefined })}>
            <option value="">All modes</option>
            <For each={agentModeTemplates}>{(mode) => <option value={mode.id}>{mode.name}</option>}</For>
          </select>
        </label>
      </div>
      <Show when={error()}>
        {(message) => <p class="usage-stats-empty">{message()}</p>}
      </Show>
      <Show when={!loading() && !error() && events().length === 0}>
        <p class="usage-stats-empty">
          No token usage events match these filters. Completed runs with token data appear here — restart the local runtime if this panel was just added.
        </p>
      </Show>
      <div class="usage-stats-list">
        <For each={events()}>{(event) => <UsageStatsRow event={event} />}</For>
      </div>
      <Show when={events().length}>
        <p class="usage-stats-empty">Showing {events().length} of {total()} matching events · newest first</p>
      </Show>
    </div>
  )
}
