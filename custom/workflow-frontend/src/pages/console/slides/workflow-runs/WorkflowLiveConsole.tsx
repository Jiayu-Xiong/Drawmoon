import { createEffect, on, Show } from "solid-js"

import { useI18n } from "../../../../i18n"
import { StreamingOutput } from "../../../../components/StreamingOutput"
import type { WorkflowStreamLogEntry } from "../../../../runtime-bridge"

export function WorkflowLiveConsole(props: {
  activeNodeId: string | null
  activeNodeLabel: string
  liveText: string
  streamLogs: WorkflowStreamLogEntry[]
  runStatus?: string
}) {
  const { t } = useI18n()
  let streamRef: HTMLDivElement | undefined
  let logRef: HTMLDivElement | undefined
  let renderedLogCount = 0
  let boundRunKey = ""

  function appendLogRow(log: WorkflowStreamLogEntry) {
    if (!logRef) return
    const row = document.createElement("div")
    row.className = `workflow-instance-log workflow-instance-log--${log.level}`
    const time = document.createElement("b")
    time.textContent = log.time
    const body = document.createElement("span")
    body.textContent = log.nodeId ? `[${log.nodeId}] ${log.message}` : log.message
    row.append(time, body)
    logRef.append(row)
  }

  function resetLogPanel(logs: WorkflowStreamLogEntry[]) {
    if (!logRef) return
    logRef.replaceChildren()
    renderedLogCount = 0
    for (const log of logs) appendLogRow(log)
    renderedLogCount = logs.length
    logRef.scrollTop = logRef.scrollHeight
  }

  createEffect(on(() => props.liveText, () => {
    if (streamRef) streamRef.scrollTop = streamRef.scrollHeight
  }))

  createEffect(on(
    () => [props.streamLogs.length, props.streamLogs[0]?.time ?? "", props.runStatus ?? ""] as const,
    ([len, firstTime]) => {
      const key = `${props.runStatus ?? ""}:${firstTime}:${len}`
      if (key !== boundRunKey) {
        boundRunKey = key
        resetLogPanel(props.streamLogs)
        return
      }
      const logs = props.streamLogs
      for (let i = renderedLogCount; i < logs.length; i++) {
        appendLogRow(logs[i]!)
      }
      renderedLogCount = logs.length
      if (logRef && renderedLogCount > 0) {
        logRef.scrollTop = logRef.scrollHeight
      }
    },
  ))

  return (
    <div class="wf-live-console wf-live-console--slim">
      <div class="wf-live-console__stream-panel">
        <div class="wf-live-console__head">
          <span>运行中输出</span>
          <Show when={props.runStatus}>
            <span class="wf-live-console__status">{props.runStatus}</span>
          </Show>
          <Show when={props.activeNodeId} fallback={<strong class="wf-live-console__idle">{t("run.liveIdle")}</strong>}>
            <strong>{props.activeNodeLabel}</strong>
          </Show>
        </div>
        <div class="wf-live-console__stream" ref={streamRef}>
          <Show
            when={props.liveText}
            fallback={<p class="wf-live-console__placeholder">{t("run.livePlaceholder")}</p>}
          >
            <StreamingOutput text={props.liveText} live class="wf-live-console__text" />
          </Show>
        </div>
      </div>
      <div class="wf-live-console__activity-panel">
        <div class="wf-live-console__head">
          <span>Activity</span>
          <strong>{props.streamLogs.length}</strong>
        </div>
        <div class="wf-live-console__activity" ref={logRef} />
      </div>
    </div>
  )
}
