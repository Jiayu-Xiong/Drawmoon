import { For, Show } from "solid-js"

import type { WorkflowNode, WorkflowTemplate } from "../../../../data/console-model"
import { syncTemplateSharedSessions } from "../../../../data/session-board"
import type { SessionPolicy } from "../../../../data/console-model"
import { nodesById, sessionTurnLabel } from "../../../../data/session-utils"
import { SessionField, SessionInput, SessionSelect } from "../../../../components/session-board/SessionField"

export function NodeSessionInspector(props: {
  template: WorkflowTemplate
  node: WorkflowNode
  onTemplateChange: (template: WorkflowTemplate) => void
}) {
  const lookup = () => nodesById(props.template.nodes)

  function patchNode(patch: Partial<WorkflowNode["session"]> & { clear?: boolean }) {
    props.onTemplateChange(syncTemplateSharedSessions({
      ...props.template,
      nodes: props.template.nodes.map((entry) => {
        if (entry.id !== props.node.id) return entry
        if (patch.clear) return { ...entry, session: undefined }
        return {
          ...entry,
          session: { ...(entry.session ?? { policy: "shared" as SessionPolicy }), ...patch },
        }
      }),
    }))
  }

  function setPolicy(policy: SessionPolicy) {
    props.onTemplateChange(syncTemplateSharedSessions({
      ...props.template,
      nodes: props.template.nodes.map((entry) => {
        if (entry.id !== props.node.id) return entry
        if (policy === "fresh" && !entry.session?.sessionKey) {
          return { ...entry, session: undefined }
        }
        return { ...entry, session: { ...(entry.session ?? {}), policy } }
      }),
    }))
  }

  return (
    <details class="advanced-section session-inspector" open>
      <summary>Session</summary>
      <div class="advanced-stack session-inspector__stack">
        <SessionField label="Policy">
          <SessionSelect value={props.node.session?.policy ?? "fresh"} onChange={setPolicy}>
            <option value="fresh">fresh</option>
            <option value="shared">shared</option>
            <option value="inherit">inherit</option>
            <option value="fork">fork</option>
            <option value="summary">summary</option>
            <option value="artifacts">artifacts</option>
          </SessionSelect>
        </SessionField>
        <SessionField label="Session key" hint="Shared thread identifier">
          <SessionInput
            value={props.node.session?.sessionKey ?? ""}
            placeholder="e.g. planner-thread"
            onInput={(sessionKey) => {
              props.onTemplateChange(syncTemplateSharedSessions({
                ...props.template,
                nodes: props.template.nodes.map((entry) => {
                  if (entry.id !== props.node.id) return entry
                  if (!sessionKey.trim()) {
                    return entry.session?.policy
                      ? { ...entry, session: { ...entry.session, sessionKey: undefined } }
                      : { ...entry, session: undefined }
                  }
                  return {
                    ...entry,
                    session: { policy: entry.session?.policy ?? "shared", ...entry.session, sessionKey: sessionKey.trim() },
                  }
                }),
              }))
            }}
          />
        </SessionField>
        <SessionField label="Anchor node">
          <SessionSelect
            value={props.node.session?.bindsToNodeId ?? ""}
            onChange={(bindsToNodeId) => patchNode({ bindsToNodeId: bindsToNodeId || undefined })}
          >
            <option value="">This node is anchor</option>
            <For each={props.template.nodes.filter((entry) => entry.id !== props.node.id)}>
              {(entry) => <option value={entry.id}>{entry.name}</option>}
            </For>
          </SessionSelect>
        </SessionField>
        <SessionField label="Turn order">
          <SessionInput
            value={props.node.session?.turnOrder != null ? String(props.node.session.turnOrder) : ""}
            placeholder="1"
            onInput={(raw) => {
              const turnOrder = Number(raw) || undefined
              patchNode(props.node.session ? { turnOrder } : { policy: "shared", turnOrder })
            }}
          />
        </SessionField>
        <div class="template-summary session-summary">
          <span>Preview</span>
          <b>{sessionTurnLabel(props.node, lookup()) ?? "isolated"}</b>
        </div>
      </div>
    </details>
  )
}
