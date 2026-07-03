import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"

import { Icon } from "../../../../components/Icon"
import { TokenUsageCard } from "../../../../components/TokenUsageCard"
import { nodesById, sessionThreadSummary } from "../../../../data/session-utils"
import { restoreWorkflowTemplateFromSnapshot } from "../../../../data/workflow-template-snapshot"
import { useI18n } from "../../../../i18n"
import { statusClass, workflowTemplates } from "../../shared/core"
import { formatActiveDuration, formatWhen, itemLabels, mapDisplayStatus, type WorkflowInstanceItem } from "./instance-utils"

function cardLabels(labels: string[]) {
  return itemLabels(labels).slice(0, 4)
}

export function WorkflowInstanceCard(props: {
  item: WorkflowInstanceItem
  focused?: boolean
  onOpen: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [restoring, setRestoring] = createSignal(false)
  const [restoreMsg, setRestoreMsg] = createSignal<string | null>(null)
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal(props.item.name)
  const displayStatus = createMemo(() => mapDisplayStatus(props.item.status))
  const [clockMs, setClockMs] = createSignal(Date.now())
  onMount(() => {
    const timer = setInterval(() => {
      if (props.item.status === "running") setClockMs(Date.now())
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })
  const activeDuration = createMemo(() => formatActiveDuration({
    status: props.item.status,
    activeDurationMs: props.item.activeDurationMs,
    activeSegmentStartedAt: props.item.activeSegmentStartedAt,
    startedAt: props.item.startedAt,
    finishedAt: props.item.finishedAt,
  }, clockMs()))
  const templateDef = createMemo(() => workflowTemplates.find((item) => item.id === props.item.templateId))
  const sharedSessions = createMemo(() => templateDef()?.sharedSessions ?? [])
  const sessionLookup = createMemo(() => nodesById(templateDef()?.nodes ?? []))

  createEffect(() => {
    if (!editing()) setDraft(props.item.name)
  })

  function commitRename() {
    const next = draft().trim()
    if (next && next !== props.item.name) props.onRename(next)
    setEditing(false)
  }

  function shouldIgnoreCardTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest(".workflow-instance-edit, input, textarea"))
  }

  function openCard() {
    if (!editing()) props.onOpen()
  }

  let pressX = 0
  let pressY = 0
  let pressing = false

  function beginPress(event: PointerEvent) {
    if (event.button !== 0 || shouldIgnoreCardTarget(event.target)) return
    pressX = event.clientX
    pressY = event.clientY
    pressing = true
  }

  function finishPress(event: PointerEvent) {
    if (!pressing || event.button !== 0 || shouldIgnoreCardTarget(event.target)) {
      pressing = false
      return
    }
    pressing = false
    if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > 10) return
    event.preventDefault()
    event.stopPropagation()
    openCard()
  }

  return (
    <div
      class={`node-manager-card workflow-instance-card slide-data-card ${statusClass(displayStatus())}`}
      classList={{ "is-focused": props.focused }}
      data-workflow-instance-id={props.item.id}
      data-workflow-instance-name={props.item.name}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (shouldIgnoreCardTarget(event.target)) return
        openCard()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          openCard()
        }
      }}
      onPointerDown={beginPress}
      onPointerUp={finishPress}
      onPointerCancel={() => { pressing = false }}
    >
      <div class="workflow-instance-card-body">
        <div class="node-manager-card-head">
          <Icon name="workflow" size={16} />
          <span>{props.item.templateName}</span>
          <b class={statusClass(displayStatus())}>{props.item.status}</b>
        </div>
        <Show
          when={!editing()}
          fallback={(
            <input
              class="workflow-instance-rename"
              value={draft()}
              onClick={(event) => event.stopPropagation()}
              onInput={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === "Enter") commitRename()
                if (event.key === "Escape") {
                  setDraft(props.item.name)
                  setEditing(false)
                }
              }}
              onBlur={commitRename}
            />
          )}
        >
          <h3>{props.item.name}</h3>
        </Show>
        <p class="path-line">{props.item.templateId}</p>
        <Show when={props.item.templateMissing && props.item.templateSnapshot}>
          <button
            type="button"
            class="workflow-restore-template"
            disabled={restoring()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setRestoring(true)
              setRestoreMsg(null)
              void restoreWorkflowTemplateFromSnapshot(props.item.templateSnapshot)
                .then(() => setRestoreMsg(t("run.restoreWorkflowDone")))
                .catch((err) => setRestoreMsg(err instanceof Error ? err.message : "Restore failed"))
                .finally(() => setRestoring(false))
            }}
          >
            {restoring() ? "…" : t("run.restoreWorkflow")}
          </button>
        </Show>
        <Show when={restoreMsg()}>
          {(msg) => <p class="workflow-restore-msg">{msg()}</p>}
        </Show>
        <div class="registry-meta-grid">
          <span>created <b>{formatWhen(props.item.createdAt)}</b></span>
          <span>started <b>{formatWhen(props.item.startedAt)}</b></span>
          <span>duration <b>{activeDuration()}</b></span>
          <span>progress <b>{props.item.completedNodes}/{props.item.totalNodes} · {props.item.progressPercent}%</b></span>
          <span>source <b>{props.item.source}</b></span>
        </div>
        <Show when={props.item.tokenUsage}>
          {(usage) => (
            <TokenUsageCard
              usage={{
                ...usage(),
                source: "run-results",
                updatedAt: props.item.updatedAt,
              }}
              compact
            />
          )}
        </Show>
        <Show when={sharedSessions().length}>
          <div class="workflow-instance-sessions">
            <For each={sharedSessions()}>
              {(session) => (
                <div class="workflow-instance-session">
                  <Icon name="agent" size={12} />
                  <span class="workflow-instance-session-label">{session.label}</span>
                  <span class="workflow-instance-session-thread">{sessionThreadSummary(session, sessionLookup())}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
        <div class="workflow-instance-card-foot">
          <div class="node-manager-badges">
            <For each={cardLabels(props.item.labels)}>{(label) => <span>{label}</span>}</For>
          </div>
          <div class="workflow-instance-card-actions">
            <button
              type="button"
              class="workflow-instance-edit"
              title="Rename"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => {
                event.stopPropagation()
                setEditing(true)
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <Icon name="settings" size={13} />
            </button>
            <button
              type="button"
              class="workflow-instance-edit workflow-instance-delete"
              title="Delete history"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => {
                event.stopPropagation()
                props.onDelete()
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        </div>
        <div class="workflow-instance-progress-strip" aria-label={`Progress ${props.item.progressPercent}%`}>
          <span style={{ width: `${Math.max(0, Math.min(100, props.item.progressPercent))}%` }} />
        </div>
      </div>
    </div>
  )
}
