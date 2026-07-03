import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"

import { listWorkflowRuns, type LocalCliInfo, type WorkflowRunListItem } from "../../../../api"
import { MasonryColumns, masonryColumnCount } from "../../../../components/MasonryColumns"
import { Icon } from "../../../../components/Icon"
import { cliTemplates } from "../../../../data/cli-templates"
import { anyBudgetBlocked, estimateWorkflowBudget } from "../../../../data/budget/estimate"
import type { BackendProvider, SystemSnapshot, WorkflowEntity } from "../../../../data/console-model"
import { onLlmApiBindReady } from "../../../../data/llm-api-bind/bootstrap"
import { listLlmApiTemplates } from "../../../../data/llm-api-templates"
import { bootstrapTemplateRegistry, templateRegistryVersion, useWorkflowTemplateList } from "../../../../data/template-store"
import { mergeCliSnapshot, mergeCliSnapshotsForTemplate } from "../../runtime"
import { createWorkflowEntitySwitch, paperTemplate, workflowTemplates } from "../../shared/core"
import { useI18n } from "../../../../i18n"
import type { View } from "../../navigation"
import { AgentModeToolsPanel } from "./AgentModeToolsPanel"
import { CliDashboardCard } from "./CliDashboardCard"
import { LlmApiStatusCard } from "./LlmApiStatusCard"
import { TemplateDependencyTree } from "./TemplateDependencyTree"
import { UsageStatsPanel } from "./usage-stats/UsageStatsPanel"

const NODE_TABS = ["nodes", "tools", "cli", "api", "usage"] as const
type NodeManagerTab = typeof NODE_TABS[number]

export function NodeDetailView(props: {
  entity: WorkflowEntity
  providers: BackendProvider[]
  snapshot: SystemSnapshot
  cliInfo?: LocalCliInfo | null
  cliRefreshing?: boolean
  cliRefreshingProviders?: string[]
  onRefreshCliInfo?: () => void
  onView: (view: View) => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = createSignal<NodeManagerTab>("nodes")
  const workflowSwitch = createWorkflowEntitySwitch(props.entity)
  const entity = workflowSwitch.entity
  const [runtimeRuns, setRuntimeRuns] = createSignal<WorkflowRunListItem[]>([])
  const [llmBindTick, setLlmBindTick] = createSignal(0)
  const [previewTemplateId, setPreviewTemplateId] = createSignal<string | null>(null)
  createEffect(() => workflowSwitch.syncEntity(props.entity))
  createEffect(() => {
    props.entity.id
    setPreviewTemplateId(null)
  })
  const availableTemplates = createMemo(() => useWorkflowTemplateList())
  const currentTemplate = createMemo(() => {
    templateRegistryVersion()
    const id = previewTemplateId() ?? entity().templateId
    return availableTemplates().find((template) => template.id === id) ?? paperTemplate
  })
  const [layoutWidth, setLayoutWidth] = createSignal(0)
  const panelWidth = createMemo(() => Math.max(layoutWidth(), 320))
  const providerColumns = createMemo(() => masonryColumnCount(panelWidth(), 260, 4))
  const tabIndex = createMemo(() => NODE_TABS.indexOf(tab()))

  const budgetSummary = createMemo(() => {
    const estimates = workflowTemplates.flatMap((template) =>
      estimateWorkflowBudget(template, mergeCliSnapshotsForTemplate(template, cliTemplates, props.cliInfo ?? null)),
    )
    return { estimates, blocked: anyBudgetBlocked(estimates) }
  })

  const cliCards = createMemo(() => {
    const template = currentTemplate()
    const lives = mergeCliSnapshotsForTemplate(template, cliTemplates, props.cliInfo ?? null)
    return cliTemplates.map((cli) => {
      const merged = lives.find((l) => l.cliTemplateId === cli.id)
        ?? mergeCliSnapshot(cli, props.cliInfo ?? null, {
          inUseNodeCount: template.nodes.filter((n) => n.cliTemplateId === cli.id).length,
        })
      return (
        <CliDashboardCard
          live={merged}
          provider={props.providers.find((provider) => provider.id === cli.providerId)}
        />
      )
    })
  })

  const apiCards = createMemo(() => {
    void llmBindTick()
    return listLlmApiTemplates().map((api) => (
      <LlmApiStatusCard api={api} providers={props.providers} snapshot={props.snapshot} />
    ))
  })

  let layoutRef: HTMLElement | undefined

  function bindPanelRef(el: HTMLElement | undefined) {
    layoutRef = el
    if (el) setLayoutWidth(el.clientWidth)
  }

  onMount(() => {
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setLayoutWidth(entry.contentRect.width)
    })
    if (layoutRef) ro.observe(layoutRef)
    const stopBind = onLlmApiBindReady(() => setLlmBindTick((value) => value + 1))
    onCleanup(() => {
      ro.disconnect()
      stopBind()
    })
    void bootstrapTemplateRegistry()
    void listWorkflowRuns().then(setRuntimeRuns).catch(() => setRuntimeRuns([]))
  })

  return (
    <div class="side-page-shell side-page-shell--nodes">
      <div ref={bindPanelRef} class="node-manager-view node-detail-view side-page-content" data-primary-scroll>
        <header class="node-manager-top">
          <div>
            <span class="eyebrow">Node Workflow</span>
            <h2>Status & Bindings</h2>
          </div>
        </header>
        <nav class="node-manager-tabs">
          <button classList={{ active: tab() === "nodes" }} onClick={() => setTab("nodes")}>Node</button>
          <button classList={{ active: tab() === "tools" }} onClick={() => setTab("tools")}>{t("nodeManager.tabs.tools")}</button>
          <button classList={{ active: tab() === "cli" }} onClick={() => setTab("cli")}>CLI</button>
          <button classList={{ active: tab() === "api" }} onClick={() => setTab("api")}>API</button>
          <button classList={{ active: tab() === "usage" }} onClick={() => setTab("usage")}>Usage</button>
        </nav>
        <main class="node-manager-main">
          <div class="node-tab-viewport">
            <div
              class="node-tab-track"
              style={{
                "--tab-count": NODE_TABS.length,
                transform: `translate3d(-${tabIndex() * (100 / NODE_TABS.length)}%, 0, 0)`,
              }}
            >
              <section class="node-tab-panel">
                <div class="template-tree-stack">
                  <TemplateDependencyTree
                    template={currentTemplate()}
                    runs={runtimeRuns()}
                    templates={availableTemplates()}
                    selectedTemplateId={previewTemplateId() ?? entity().templateId}
                    onSelectTemplate={setPreviewTemplateId}
                  />
                </div>
              </section>
              <section class="node-tab-panel">
                <AgentModeToolsPanel />
              </section>
              <section class="node-tab-panel">
                <div class="node-provider-head">
                  <span>CLI Providers</span>
                  <button
                    type="button"
                    class="node-provider-refresh"
                    classList={{ "is-refreshing": props.cliRefreshing }}
                    disabled={props.cliRefreshing}
                    onClick={() => props.onRefreshCliInfo?.()}
                  >
                    <Icon name="refresh" size={14} />
                    <strong>{props.cliRefreshing ? "Refreshing…" : "Refresh"}</strong>
                  </button>
                </div>
                <Show when={props.cliRefreshingProviders?.length}>
                  <p class="cli-refresh-progress">
                    Probing {props.cliRefreshingProviders!.join(" → ")}…
                  </p>
                </Show>
                <Show when={budgetSummary().blocked}>
                  <div class="budget-warning-banner">
                    <strong>Budget gate</strong>
                    <span>{budgetSummary().blocked?.blockReason ?? "Run may be blocked until override"}</span>
                  </div>
                </Show>
                <MasonryColumns class="node-provider-grid" columns={providerColumns()} items={cliCards()} />
              </section>
              <section class="node-tab-panel">
                <div class="node-provider-head">
                  <span>API Bindings</span>
                  <strong>{listLlmApiTemplates().length}</strong>
                </div>
                <MasonryColumns class="node-provider-grid" columns={providerColumns()} items={apiCards()} />
              </section>
              <section class="node-tab-panel">
                <UsageStatsPanel />
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
