import { createMemo, createResource, createSignal, For, Show } from "solid-js"

import { fetchLibraryManifest } from "../../../../api/drawmoon"
import type { NodeToolConstraints, WorkflowNode, WorkflowTemplate } from "../../../../data/console-model"
import { getAgentModeTemplate } from "../../../../data/template-registry"
import { hasToolConstraints, resolveNodeToolConstraints } from "../../../../data/tool-constraints"
import { lookupSystemToolMapping } from "../../../../data/tool-mapping"
import { strategyToolSourceBadge } from "../../../../data/agent-mode-strategy-kv"
import { SessionField } from "../../../../components/session-board/SessionField"
import { useI18n } from "../../../../i18n"

type ToolScope = "inherit" | "force" | "allow"
type ToolTab = "skills" | "mcp"

function scopeFor(constraints: NodeToolConstraints, forcedKey: keyof NodeToolConstraints, allowedKey: keyof NodeToolConstraints): ToolScope {
  const forced = constraints[forcedKey]
  const allowed = constraints[allowedKey]
  if (forced !== undefined) return "force"
  if (allowed !== undefined) return "allow"
  return "inherit"
}

export function NodeToolsInspector(props: {
  template: WorkflowTemplate
  node: WorkflowNode
  onTemplateChange: (template: WorkflowTemplate) => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = createSignal<ToolTab>("skills")
  const [manifest] = createResource(() => fetchLibraryManifest().catch(() => ({ skills: [], mcp: [], updatedAt: "" })))

  const constraints = createMemo(() => props.node.toolConstraints ?? {})

  function patchNode(nextConstraints: NodeToolConstraints | undefined) {
    props.onTemplateChange({
      ...props.template,
      nodes: props.template.nodes.map((entry) => entry.id === props.node.id
        ? { ...entry, toolConstraints: nextConstraints }
        : entry),
    })
  }

  function patch(patch: Partial<NodeToolConstraints>) {
    patchNode({ ...(props.node.toolConstraints ?? {}), ...patch })
  }

  function setScope(
    forcedKey: keyof NodeToolConstraints,
    allowedKey: keyof NodeToolConstraints,
    scope: ToolScope,
  ) {
    const current = { ...(props.node.toolConstraints ?? {}) }
    if (scope === "inherit") {
      delete current[forcedKey]
      delete current[allowedKey]
    } else if (scope === "force") {
      current[forcedKey] = current[forcedKey] ?? []
      delete current[allowedKey]
    } else {
      current[allowedKey] = current[allowedKey] ?? []
      delete current[forcedKey]
    }
    const empty = Object.keys(current).length === 0
    patchNode(empty ? undefined : current)
  }

  function toggleList(key: keyof NodeToolConstraints, id: string) {
    const list = constraints()[key] ?? []
    const set = new Set(list)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    patch({ [key]: [...set] })
  }

  const skillScope = createMemo(() => scopeFor(constraints(), "forcedSkills", "allowedSkills"))
  const mcpScope = createMemo(() => scopeFor(constraints(), "forcedMcpServers", "allowedMcpServers"))
  const agentMode = createMemo(() => getAgentModeTemplate(props.node.agentModeTemplateId))
  const effective = createMemo(() => resolveNodeToolConstraints(props.node, agentMode()))
  const effectiveTools = createMemo(() => {
    const c = effective()
    return c.forcedTools ?? c.allowedTools ?? agentMode()?.allowedTools ?? []
  })
  const defaultOpen = createMemo(() => hasToolConstraints(effective()) || effectiveTools().length > 0)

  return (
    <details class="advanced-section session-inspector node-tools-inspector" open={defaultOpen() || undefined}>
      <summary>{t("tools.nodeBindings")}</summary>
      <div class="advanced-stack session-inspector__stack">
        <p class="node-tools-hint">{t("tools.nodeIsolationHint")}</p>
        <Show when={effectiveTools().length}>
          <SessionField label={t("tools.workflowTools")}>
            <div class="tools-chip-grid">
              <For each={effectiveTools()}>
                {(toolId) => {
                  const mapping = lookupSystemToolMapping(toolId)
                  return (
                    <span class="tools-chip tools-chip--readonly" title={mapping?.description}>
                      {toolId}
                      <Show when={mapping?.opencodeToolId}>
                        <code>→ {mapping!.opencodeToolId}</code>
                      </Show>
                      <span class="strategy-kv-tag">{strategyToolSourceBadge(t, mapping?.source ?? "static")}</span>
                    </span>
                  )
                }}
              </For>
            </div>
          </SessionField>
        </Show>
        <div class="node-tools-tabs">
          <button type="button" classList={{ active: tab() === "skills" }} onClick={() => setTab("skills")}>{t("tools.skills")}</button>
          <button type="button" classList={{ active: tab() === "mcp" }} onClick={() => setTab("mcp")}>{t("tools.mcp")}</button>
        </div>
        <Show when={manifest.loading}>
          <p class="tools-empty">{t("tools.loadingLibrary")}</p>
        </Show>
        <Show when={tab() === "skills"}>
          <ScopePicker
            label={t("tools.skills")}
            scope={skillScope()}
            onScope={(scope) => setScope("forcedSkills", "allowedSkills", scope)}
          />
          <Show when={skillScope() !== "inherit"}>
            <div class="tools-chip-grid">
              <For each={manifest()?.skills ?? []}>
                {(skill) => (
                  <button
                    type="button"
                    class="tools-chip"
                    classList={{
                      active: skillScope() === "force"
                        ? (constraints().forcedSkills ?? []).includes(skill.id)
                        : (constraints().allowedSkills ?? []).includes(skill.id),
                    }}
                    onClick={() => toggleList(skillScope() === "force" ? "forcedSkills" : "allowedSkills", skill.id)}
                  >
                    {skill.name}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
        <Show when={tab() === "mcp"}>
          <ScopePicker
            label={t("tools.mcp")}
            scope={mcpScope()}
            onScope={(scope) => setScope("forcedMcpServers", "allowedMcpServers", scope)}
          />
          <Show when={mcpScope() !== "inherit"}>
            <div class="tools-chip-grid">
              <For each={manifest()?.mcp ?? []}>
                {(entry) => (
                  <button
                    type="button"
                    class="tools-chip"
                    classList={{
                      active: mcpScope() === "force"
                        ? (constraints().forcedMcpServers ?? []).includes(entry.id)
                        : (constraints().allowedMcpServers ?? []).includes(entry.id),
                    }}
                    onClick={() => toggleList(mcpScope() === "force" ? "forcedMcpServers" : "allowedMcpServers", entry.id)}
                  >
                    {entry.name}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
        <SessionField label={t("tools.resetNode")}>
          <button type="button" class="wf-button wf-button--soft" onClick={() => patchNode(undefined)}>
            {t("tools.resetNode")}
          </button>
        </SessionField>
      </div>
    </details>
  )
}

function ScopePicker(props: { label: string; scope: ToolScope; onScope: (scope: ToolScope) => void }) {
  const { t } = useI18n()
  return (
    <SessionField label={props.label}>
      <div class="node-tools-scope">
        <button type="button" classList={{ active: props.scope === "inherit" }} onClick={() => props.onScope("inherit")}>{t("tools.scopeInherit")}</button>
        <button type="button" classList={{ active: props.scope === "force" }} onClick={() => props.onScope("force")}>{t("tools.scopeForce")}</button>
        <button type="button" classList={{ active: props.scope === "allow" }} onClick={() => props.onScope("allow")}>{t("tools.scopeAllow")}</button>
      </div>
    </SessionField>
  )
}
