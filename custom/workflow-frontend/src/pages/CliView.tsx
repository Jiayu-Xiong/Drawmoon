import { createSignal, For } from "solid-js"

import { Icon } from "../components/Icon"
import type { AgentRuntimeMode, CliProviderTemplate, CliTemplateCommand, CliTemplateKv } from "../data/console-model"
import { listCliTemplates, registerCliTemplate, renameCliTemplateId } from "../data/cli-templates"
import { PlainCliProviderTemplate } from "../data/template-registry"

function newCli(): CliProviderTemplate {
  return {
    id: `cli-${Date.now()}`,
    name: "New CLI",
    description: "Custom CLI binding with KV probe fields and commands.",
    startupCommand: "my-cli",
    providerId: "custom",
    promptCommand: {
      id: "prompt",
      label: "Prompt",
      command: "my-cli",
      args: ["{{prompt}}"],
      outputStyle: "text",
      consumesTokens: true,
    },
    fields: [{ key: "status", value: "unknown" }],
    commands: [
      { id: "version", label: "Version", command: "my-cli", args: ["--version"], outputStyle: "text", consumesTokens: false },
    ],
    models: [],
    capabilities: {
      controlSurface: "customizable",
      supportedModes: ["chat", "build"],
      quota: { kind: "unknown", unitLabel: "unknown" },
      allowDerivedAgentModes: true,
      editableAgentModeFields: ["defaultSystemPrompt", "maxIterations", "timeoutMs", "contextMode"],
    },
  }
}

function modeLabel(mode: AgentRuntimeMode) {
  return mode[0]?.toUpperCase() + mode.slice(1)
}

function defaultStrategyLabel(cli: CliProviderTemplate) {
  return cli.capabilities.controlSurface === "cli-owned" ? `${cli.name} (default)` : `${cli.name} strategy`
}

export function CliView() {
  const [items, setItems] = createSignal<CliProviderTemplate[]>(listCliTemplates().map((cli) => ({
    ...cli,
    fields: cli.fields.map((field) => ({ ...field })),
    commands: cli.commands.map((command) => ({ ...command, args: [...command.args] })),
    models: cli.models.map((model) => ({ ...model, fields: model.fields.map((field) => ({ ...field })) })),
  })))
  const [selectedId, setSelectedId] = createSignal(items()[0]?.id ?? "")
  const selected = () => items().find((cli) => cli.id === selectedId()) ?? items()[0]

  function persist(current: CliProviderTemplate, previousId: string) {
    if (previousId !== current.id) {
      renameCliTemplateId(previousId, current.id, current)
    } else {
      registerCliTemplate(new PlainCliProviderTemplate(current))
    }
  }

  function update(patch: Partial<CliProviderTemplate>, previousId?: string) {
    const current = selected()
    if (!current) return
    const next = { ...current, ...patch }
    const oldId = previousId ?? current.id
    setItems((list) => list.map((cli) => cli.id === oldId ? next : cli))
    if (patch.id) setSelectedId(patch.id)
    persist(next, oldId)
  }

  function updateFields(fields: CliTemplateKv[]) {
    update({ fields })
  }

  function updateCommands(commands: CliTemplateCommand[]) {
    update({ commands })
  }

  function createCli() {
    const cli = newCli()
    registerCliTemplate(new PlainCliProviderTemplate(cli))
    setItems((list) => [cli, ...list])
    setSelectedId(cli.id)
  }

  function deleteCli() {
    const id = selectedId()
    setItems((list) => list.filter((cli) => cli.id !== id))
    const next = items().find((cli) => cli.id !== id)
    setSelectedId(next?.id ?? "")
  }

  return (
    <div class="template-registry-view">
      <header class="view-heading view-heading--split">
        <div>
          <span class="eyebrow">Template Base</span>
          <h2>CLI</h2>
          <p>Built-in OpenCode, Codex, Copilot, Kiro, and Claude Code. New CLI templates support custom KV fields and probe commands.</p>
        </div>
        <button class="registry-add-button" onClick={createCli}><Icon name="plus" size={15} />New CLI</button>
      </header>
      <div class="registry-editor-layout">
        <div class="template-registry-grid">
          <For each={items()}>
            {(cli) => (
              <article class="template-registry-card wf-glass" classList={{ active: cli.id === selectedId() }} onClick={() => setSelectedId(cli.id)}>
                <div class="registry-card-head">
                  <Icon name="system" size={22} />
                  <div>
                    <h3>{cli.name}</h3>
                    <span>{cli.providerId} · {cli.startupCommand}</span>
                  </div>
                </div>
                <p>{cli.description}</p>
                <div class="registry-meta-grid">
                  <For each={cli.fields.slice(0, 4)}>
                    {(field) => <span>{field.key} <b>{field.value}</b></span>}
                  </For>
                  <span>modes <b>{cli.capabilities.supportedModes.map(modeLabel).join(" / ") || "none"}</b></span>
                  <span>strategy <b>{cli.capabilities.controlSurface === "cli-owned" ? "CLI-owned" : "derivable"}</b></span>
                </div>
              </article>
            )}
          </For>
        </div>
        <aside class="registry-editor wf-glass">
          <div class="panel-heading"><span>Edit CLI</span><strong>{selected()?.id ?? "none"}</strong></div>
          <For each={selected() ? [selected()!] : []}>
            {(cli) => (
              <div class="editor-form">
                <label>ID<input value={cli.id} onInput={(event) => update({ id: event.currentTarget.value }, cli.id)} /></label>
                <label>Name<input value={cli.name} onInput={(event) => update({ name: event.currentTarget.value })} /></label>
                <label>Provider ID<input value={cli.providerId} onInput={(event) => update({ providerId: event.currentTarget.value as CliProviderTemplate["providerId"] })} /></label>
                <label>Startup Command<input value={cli.startupCommand} onInput={(event) => update({ startupCommand: event.currentTarget.value })} /></label>
                <label>Description<textarea value={cli.description} onInput={(event) => update({ description: event.currentTarget.value })} /></label>
                <div class="editor-subhead">Default strategy</div>
                <div class="template-summary">
                  <span>{defaultStrategyLabel(cli)}</span>
                  <b>{cli.capabilities.controlSurface === "cli-owned" ? "readonly" : "customizable"}</b>
                </div>
                <div class="registry-meta-grid">
                  <span>native modes <b>{cli.capabilities.supportedModes.map(modeLabel).join(" / ") || "none"}</b></span>
                  <span>derived modes <b>{cli.capabilities.allowDerivedAgentModes ? "allowed" : "off"}</b></span>
                  <span>editable <b>{cli.capabilities.editableAgentModeFields?.join(", ") || "none"}</b></span>
                  <span>model source <b>{cli.models[0]?.name ?? "workflow/API selected"}</b></span>
                </div>
                <div class="editor-subhead">KV fields (slide panel / probe display)</div>
                <For each={cli.fields}>
                  {(field, index) => (
                    <div class="editor-kv-row">
                      <input
                        placeholder="key"
                        value={field.key}
                        onInput={(event) => {
                          const fields = [...cli.fields]
                          fields[index()] = { ...fields[index()]!, key: event.currentTarget.value }
                          updateFields(fields)
                        }}
                      />
                      <input
                        placeholder="value"
                        value={field.value}
                        onInput={(event) => {
                          const fields = [...cli.fields]
                          fields[index()] = { ...fields[index()]!, value: event.currentTarget.value }
                          updateFields(fields)
                        }}
                      />
                    </div>
                  )}
                </For>
                <button class="wf-button" type="button" onClick={() => updateFields([...cli.fields, { key: "new-key", value: "" }])}>+ KV</button>
                <div class="editor-subhead">Probe commands</div>
                <For each={cli.commands}>
                  {(command, index) => (
                    <div class="editor-kv-row editor-kv-row--stack">
                      <input
                        value={command.id}
                        placeholder="id"
                        onInput={(event) => {
                          const commands = [...cli.commands]
                          commands[index()] = { ...commands[index()]!, id: event.currentTarget.value }
                          updateCommands(commands)
                        }}
                      />
                      <input
                        value={command.command}
                        placeholder="command"
                        onInput={(event) => {
                          const commands = [...cli.commands]
                          commands[index()] = { ...commands[index()]!, command: event.currentTarget.value }
                          updateCommands(commands)
                        }}
                      />
                      <input
                        value={command.args.join(" ")}
                        placeholder="args (space separated)"
                        onInput={(event) => {
                          const commands = [...cli.commands]
                          commands[index()] = { ...commands[index()]!, args: event.currentTarget.value.split(/\s+/).filter(Boolean) }
                          updateCommands(commands)
                        }}
                      />
                    </div>
                  )}
                </For>
                <button class="wf-button" type="button" onClick={() => updateCommands([...cli.commands, { id: `cmd-${Date.now()}`, label: "Probe", command: cli.startupCommand, args: ["--help"], outputStyle: "text", consumesTokens: false }])}>+ Command</button>
                <button class="wf-button wf-button--danger" onClick={deleteCli}>Delete CLI</button>
              </div>
            )}
          </For>
        </aside>
      </div>
    </div>
  )
}
