import { createMemo, For, Show } from "solid-js"

import type { WorkflowNode, WorkflowTemplate } from "../data/console-model"
import {
  assignNodeToColumn,
  buildSessionColumns,
  createSharedSessionColumn,
  isolatedSessionNodes,
  ISOLATED_SESSION_KEY,
  renameSessionColumn,
  syncTemplateSharedSessions,
  updateSessionColumnLabel,
} from "../data/session-board"
import { nodesById, sessionThreadSummary } from "../data/session-utils"
import { SessionInput, SessionSelect } from "./session-board/SessionField"

function nodeBindingKey(node: WorkflowNode): string {
  if ((node.executionMode ?? "agent-mode") === "llm-api") return `api:${node.llmApiTemplateId ?? "unbound"}`
  return `cli:${node.cliTemplateId ?? node.agentModeTemplateId ?? node.agentId ?? "unbound"}`
}

function nodeBindingLabel(node: WorkflowNode): string {
  if ((node.executionMode ?? "agent-mode") === "llm-api") return `API ${node.llmApiTemplateId ?? "unbound"}`
  return `CLI ${node.cliTemplateId ?? node.agentModeTemplateId ?? node.agentId ?? "unbound"}`
}

export function SharedSessionsBoard(props: {
  template: WorkflowTemplate
  selectedId?: string
  onTemplateChange: (template: WorkflowTemplate) => void
  onSelectNode: (nodeId: string) => void
}) {
  const lookup = createMemo(() => nodesById(props.template.nodes))
  const columns = createMemo(() => buildSessionColumns(props.template.nodes, props.template.sharedSessions))
  const isolated = createMemo(() => isolatedSessionNodes(props.template.nodes))

  function columnAnchor(anchorNodeId: string, nodes: WorkflowNode[]) {
    return lookup().get(anchorNodeId) ?? nodes[0]
  }

  function isCompatible(node: WorkflowNode, anchor?: WorkflowNode) {
    return !anchor || nodeBindingKey(node) === nodeBindingKey(anchor)
  }

  function commit(nodes: WorkflowNode[], sharedSessions = props.template.sharedSessions) {
    props.onTemplateChange(syncTemplateSharedSessions({ ...props.template, nodes, sharedSessions }))
  }

  function moveToColumn(nodeId: string, sessionKey: string, anchorNodeId: string) {
    commit(assignNodeToColumn(props.template.nodes, nodeId, { kind: "shared", sessionKey, anchorNodeId }))
  }

  function moveToIsolated(nodeId: string) {
    commit(assignNodeToColumn(props.template.nodes, nodeId, { kind: "isolated" }))
  }

  function addColumnFromNode(nodeId: string) {
    const node = lookup().get(nodeId)
    const { nodes, sessionKey } = createSharedSessionColumn(props.template.nodes, nodeId, node?.name)
    commit(nodes)
    props.onSelectNode(nodeId)
    void sessionKey
  }

  return (
    <div class="shared-sessions-board">
      <header class="shared-sessions-head">
        <div>
          <strong>Shared sessions</strong>
          <p>Each column is one conversation thread. Nodes should share the same CLI or API binding to reuse context safely.</p>
        </div>
        <Show when={isolated().length}>
          <span class="shared-sessions-hint">{isolated().length} node(s) not in a column</span>
        </Show>
      </header>
      <div class="shared-sessions-track">
        <For each={columns()}>
          {(column) => {
            const anchor = () => columnAnchor(column.anchorNodeId, column.nodes)
            const mixed = () => column.nodes.some((node) => !isCompatible(node, anchor()))
            return (
              <section class="shared-session-column wf-glass" classList={{ "shared-session-column--mixed": mixed() }}>
                <header class="shared-session-column-head">
                  <SessionInput
                    class="shared-session-title"
                    value={column.label}
                    onInput={(value) => {
                      props.onTemplateChange(updateSessionColumnLabel(props.template, column.key, value))
                    }}
                  />
                  <input
                    class="session-control session-control--input shared-session-key"
                    defaultValue={column.key}
                    onBlur={(event) => {
                      const value = event.currentTarget.value
                      if (value !== column.key) {
                        commit(renameSessionColumn(props.template.nodes, column.key, value, column.label))
                      }
                    }}
                  />
                  <span class="shared-session-policy">shared · {column.nodes.length} node(s) · {anchor() ? nodeBindingLabel(anchor()!) : "unbound"}</span>
                </header>
                <p class="shared-session-thread">{sessionThreadSummary(column.session, lookup())}</p>
                <div class="shared-session-nodes">
                  <For each={column.nodes}>
                    {(node) => {
                      const compatible = () => isCompatible(node, anchor())
                      return (
                        <article
                          class="shared-session-node"
                          classList={{ active: node.id === props.selectedId, incompatible: !compatible() }}
                          onClick={() => props.onSelectNode(node.id)}
                        >
                          <div class="shared-session-node-head">
                            <b>#{node.session?.turnOrder ?? "?"}</b>
                            <strong>{node.name}</strong>
                          </div>
                          <p>{node.promptPreview.slice(0, 96)}{node.promptPreview.length > 96 ? "..." : ""}</p>
                          <div class="shared-session-node-meta">
                            <span>{node.runtimeOverrides?.contextMode ?? node.session?.policy ?? "inherit"}</span>
                            <span>{nodeBindingLabel(node)}</span>
                            <Show when={!compatible()}>
                              <span class="shared-session-warning">not same CLI/API · no context cache hit</span>
                            </Show>
                            <Show when={node.session?.bindsToNodeId}>
                              <span>anchor {lookup().get(node.session!.bindsToNodeId!)?.name ?? node.session!.bindsToNodeId}</span>
                            </Show>
                          </div>
                          <div class="shared-session-node-actions">
                            <button type="button" class="wf-button wf-button--soft" onClick={(event) => { event.stopPropagation(); moveToIsolated(node.id) }}>Detach</button>
                          </div>
                        </article>
                      )
                    }}
                  </For>
                </div>
              </section>
            )
          }}
        </For>

        <section class="shared-session-column shared-session-column--isolated wf-glass">
          <header class="shared-session-column-head">
            <strong>Isolated</strong>
            <span class="shared-session-policy">fresh · no sessionKey</span>
          </header>
          <p class="shared-session-thread">Each node starts a new thread, or inherits via edge contextMode only.</p>
          <div class="shared-session-nodes">
            <For each={isolated()}>
              {(node) => (
                <article
                  class="shared-session-node"
                  classList={{ active: node.id === props.selectedId }}
                  onClick={() => props.onSelectNode(node.id)}
                >
                  <div class="shared-session-node-head">
                    <strong>{node.name}</strong>
                  </div>
                  <p>{node.promptPreview.slice(0, 96)}{node.promptPreview.length > 96 ? "..." : ""}</p>
                  <div class="shared-session-node-meta">
                    <span>{nodeBindingLabel(node)}</span>
                  </div>
                  <div class="shared-session-node-actions">
                    <SessionSelect
                      value={ISOLATED_SESSION_KEY}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(value) => {
                        if (value === ISOLATED_SESSION_KEY) return
                        const [sessionKey, anchorNodeId] = value.split("::")
                        if (sessionKey && anchorNodeId) moveToColumn(node.id, sessionKey, anchorNodeId)
                      }}
                    >
                      <option value={ISOLATED_SESSION_KEY}>Move to column...</option>
                      <For each={columns()}>
                        {(column) => {
                          const anchor = lookup().get(column.anchorNodeId)
                          const compatible = isCompatible(node, anchor)
                          return <option value={`${column.key}::${column.anchorNodeId}`}>{column.label}{compatible ? "" : " · incompatible"}</option>
                        }}
                      </For>
                    </SessionSelect>
                    <button type="button" class="wf-button wf-button--soft" onClick={(event) => { event.stopPropagation(); addColumnFromNode(node.id) }}>New column</button>
                  </div>
                </article>
              )}
            </For>
            <Show when={!isolated().length}>
              <p class="shared-session-empty">All nodes are assigned to shared columns.</p>
            </Show>
          </div>
        </section>
      </div>
    </div>
  )
}
