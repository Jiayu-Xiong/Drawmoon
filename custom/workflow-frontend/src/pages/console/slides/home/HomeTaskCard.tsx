import { Show } from "solid-js"

import { Icon, type IconName } from "../../../../components/Icon"
import type { NodeState, WorkflowEntity } from "../../../../data/console-model"
import { statusClass, type HomeTaskSummary } from "../../shared/core"
export function HomeTaskCard(props: { task: HomeTaskSummary; onOpen: () => void }) {
  return (
    <article class="home-task-card">
      <button class="home-card-open" title="Open workflow" onClick={props.onOpen}>
        <Icon name="play" size={14} />
      </button>
      <div class="home-task-main">
        <span class={`home-task-spinner ${statusClass(props.task.currentStage.state)}`} style={{ "--stage-color": props.task.currentStage.color }} />
        <strong>{props.task.title}</strong>
      </div>
      <div class="home-task-meta">
        <span>{props.task.currentStage.name}</span>
        <span>Stage {props.task.currentStage.index} of {props.task.currentStage.total}</span>
        <span>Column {props.task.currentColumn} of {props.task.totalColumns}</span>
      </div>
      <div class="home-task-progress">
        <div class="home-progress-track"><span style={{ width: `${props.task.progress}%` }} /></div>
        <b>{props.task.progress}%</b>
      </div>
      <div class="home-task-mini">
        <span>parallel {props.task.parallelCount}</span>
        <span>done {props.task.doneCount}</span>
        <Show when={props.task.entity.tokenUsage}>
          {(usage) => (
            <span>
              {usage().totalTokens.toLocaleString()} tok · in {usage().inputTokens.toLocaleString()} · out {usage().outputTokens.toLocaleString()}
            </span>
          )}
        </Show>
      </div>
    </article>
  )
}

