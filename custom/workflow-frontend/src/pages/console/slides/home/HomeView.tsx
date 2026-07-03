import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js"

import { Icon, type IconName } from "../../../../components/Icon"
import type { BackendProvider, WorkflowEntity } from "../../../../data/console-model"
import { formatHomeTime, getWorkflowEntityList, homeTaskSummaries, paperTemplate, providerFromNode, statusClass, workflowTemplates } from "../../shared/core"
import type { View } from "../../navigation"
import { HomeTaskCard } from "./HomeTaskCard"
export function providerRuntimeIds() {
  const ids = new Set<string>()
  for (const entity of getWorkflowEntityList()) {
    const template = workflowTemplates.find((item) => item.id === entity.templateId) ?? paperTemplate
    for (const agent of entity.activeAgents) {
      const node = template.nodes.find((item) => item.id === agent.currentNodeId)
      if (node && (agent.status === "running" || agent.status === "looping")) ids.add(providerFromNode(node))
    }
  }
  return ids
}

export function HomeBackendStatus(props: { title: string; icon: IconName; providers: BackendProvider[]; runningIds: Set<string>; onOpen: () => void }) {
  return (
    <aside class="home-cli-status">
      <div class="home-cli-head">
        <Icon name={props.icon} size={16} />
        <span>{props.title}</span>
        <button class="home-panel-open" title={`Open ${props.title}`} onClick={props.onOpen}><Icon name="play" size={12} /></button>
      </div>
      <div class="home-cli-grid">
        <For each={props.providers}>
          {(provider) => (
            <span class={`home-cli-pill ${statusClass(provider.status)}`} classList={{ "is-running": provider.status === "online" && props.runningIds.has(provider.id) }}>
              <b />
              <em>{provider.name}</em>
              <strong />
            </span>
          )}
        </For>
      </div>
    </aside>
  )
}

export function HomeView(props: { providers: BackendProvider[]; onView: (view: View) => void; onEntity: (entity: WorkflowEntity) => void }) {
  const [now, setNow] = createSignal(new Date())
  const tasks = createMemo(() => homeTaskSummaries())
  const activeBackends = createMemo(() => props.providers.filter((provider) => provider.status === "online").length)
  const activeWorkflows = createMemo(() => getWorkflowEntityList().filter((item) => item.status === "running" || item.status === "looping").length)
  const runningProviders = createMemo(() => providerRuntimeIds())
  const cliProviders = createMemo(() => props.providers.filter((provider) => ["opencode", "codex", "copilot", "kiro", "reasonix"].includes(provider.id)))
  const apiProviders = createMemo(() => props.providers.filter((provider) => !["opencode", "codex", "copilot", "kiro", "reasonix"].includes(provider.id)))

  onMount(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    onCleanup(() => clearInterval(interval))
  })

  return (
    <div class="home-desktop">
      <div class="home-time">{formatHomeTime(now())}</div>
      <section class="home-main-glass">
        <div class="home-glass-filter" />
        <div class="home-glass-overlay" />
        <div class="home-glass-specular" />
        <div class="home-main-content">
          <div class="home-title-row">
            <h1>DRAWMOON</h1>
            <div class="home-backend-panels">
              <HomeBackendStatus title="CLI" icon="system" providers={cliProviders()} runningIds={runningProviders()} onOpen={() => props.onView("system")} />
              <HomeBackendStatus title="LLM API" icon="api" providers={apiProviders()} runningIds={runningProviders()} onOpen={() => props.onView("llmApi")} />
            </div>
          </div>
          <div class="home-status-head">
            <span><b class="state-online" /> Running Workflows</span>
            <span><b class="state-online" /> {activeBackends()} backends / {props.providers.length} online</span>
            <span><b class="state-active" /> {activeWorkflows()} workflows active</span>
          </div>
          <div class="home-task-list">
            <For each={tasks()}>
              {(task) => <HomeTaskCard task={task} onOpen={() => props.onEntity(task.entity)} />}
            </For>
          </div>
        </div>
      </section>
    </div>
  )
}

