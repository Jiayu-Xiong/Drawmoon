import { createMemo, createSignal, For, onMount, Show } from "solid-js"

import { saveDrawmoonWorkflowTemplate, validateDrawmoonWorkflowTemplate } from "../../../../api/drawmoon"
import { fetchDrawmoonWorkflowTemplate, fetchDrawmoonWorkflowTemplates } from "../../../../api/runtime-api"
import { runNode } from "../../../../api/commands-api"
import {
  applyAgentModeChange,
  applyModelOptionChange,
  groupAgentModesForNode,
  listTemplateGenModelOptions,
  refreshCliForAgentMode,
} from "../../../../data/node-executor-binding"
import { getAgentModeTemplate } from "../../../../data/template-registry"
import type { AgentModeTemplate, LlmApiTemplate, WorkflowNode } from "../../../../data/console-model"
import { listLlmApiTemplates } from "../../../../data/llm-api-templates"
import { importSavedDrawmoonWorkflowTemplate } from "../../../../data/drawmoon/templates-sync"
import { useI18n } from "../../../../i18n"
import { AppButton, Glass } from "../../shared/core"
import {
  buildTemplateGeneratorConfig,
  buildTemplateGeneratorPrompt,
  buildTemplateModifierPrompt,
  extractWorkflowTemplateJson,
  formatValidationMessage,
  slugifyTemplateId,
} from "./generator"

type GenMode = "create" | "modify"

function normalizeGeneratedTemplate(
  parsed: Record<string, unknown>,
  draftNode: Partial<WorkflowNode>,
  id: string,
  name: string,
) {
  return {
    loopEdges: [],
    branchGroups: [],
    mergeGroups: [],
    sharedSessions: [],
    sessionGroups: {},
    workingDirectory: ".",
    defaultAgentId: "agent-paper",
    defaultAgentModeTemplateId: draftNode.agentModeTemplateId,
    defaultLlmApiTemplateId: draftNode.llmApiTemplateId,
    ...parsed,
    id,
    name,
  }
}

const TEMPLATE_GEN_DRAFT: WorkflowNode = {
  id: "template-gen-draft",
  name: "draft",
  kind: "agent-mode",
  stageId: "stage",
  columnId: "col",
  laneId: "lane",
  x: 0,
  y: 0,
  agentId: "agent-paper",
  executionMode: "agent-mode",
  modality: "text",
  agentModeTemplateId: "direct-api",
  cliTemplateId: "direct-api-cli",
  promptTitle: "",
  promptPreview: "",
  outputContract: "",
}

export function TemplateGenView() {
  const { t } = useI18n()
  const [genMode, setGenMode] = createSignal<GenMode>("create")
  const [agentModeId, setAgentModeId] = createSignal("direct-api")
  const [modelOptionId, setModelOptionId] = createSignal("")
  const [templateId, setTemplateId] = createSignal("")
  const [templateName, setTemplateName] = createSignal("")
  const [brief, setBrief] = createSignal("")
  const [sourceTemplateId, setSourceTemplateId] = createSignal("")
  const [sourceTemplates, setSourceTemplates] = createSignal<Array<{ id: string; name: string }>>([])
  const [running, setRunning] = createSignal(false)
  const [validating, setValidating] = createSignal(false)
  const [message, setMessage] = createSignal<string | null>(null)
  const [rawOutput, setRawOutput] = createSignal("")
  const [preview, setPreview] = createSignal("")

  onMount(() => {
    void fetchDrawmoonWorkflowTemplates()
      .then((list) => setSourceTemplates(list.map((item) => ({ id: item.id, name: item.name }))))
      .catch(() => setSourceTemplates([]))
    const initial = listTemplateGenModelOptions(TEMPLATE_GEN_DRAFT)
    setModelOptionId(initial[0]?.id ?? "")
  })

  const draftNode = createMemo<WorkflowNode>(() => ({
    ...TEMPLATE_GEN_DRAFT,
    agentModeTemplateId: agentModeId(),
    llmApiTemplateId: modelOptionId() || undefined,
  }))

  const agentModeGroups = createMemo(() => groupAgentModesForNode(draftNode()))
  const modelOptions = createMemo(() => listTemplateGenModelOptions(draftNode()))
  const selectedAgentMode = createMemo<AgentModeTemplate | undefined>(() => getAgentModeTemplate(agentModeId()))
  const selectedLlmApi = createMemo<LlmApiTemplate | undefined>(() => {
    const option = modelOptions().find((item) => item.id === modelOptionId())
    if (option?.kind === "llm-api") return option.api
    return undefined
  })

  function onAgentModeChange(nextId: string) {
    setAgentModeId(nextId)
    void refreshCliForAgentMode(nextId)
    const base = draftNode()
    const patch = applyAgentModeChange(base, nextId)
    const options = listTemplateGenModelOptions({ ...base, ...patch })
    setModelOptionId(options[0]?.id ?? "")
  }

  async function runLlm(prompt: string) {
    const mode = selectedAgentMode()
    if (!mode) throw new Error("Select an agent mode first.")
    const api = selectedLlmApi()
    const needsApi = modelOptions().some((item) => item.kind === "llm-api")
    if (needsApi && !api) throw new Error("Select an LLM API template first.")
    const config = api
      ? buildTemplateGeneratorConfig(mode, api, prompt)
      : buildTemplateGeneratorConfig(mode, listLlmApiTemplates().find((item) => (item.modalities ?? ["text"]).includes("text"))!, prompt)

    let text = ""
    for await (const event of runNode(config, true)) {
      if (event.type === "stdout" && event.data) text += event.data
      if (event.type === "complete" && event.result && typeof event.result.text === "string") {
        text = event.result.text
      }
      if (event.type === "error") {
        throw new Error(event.error ?? event.message ?? "Agent run failed")
      }
    }
    if (!text.trim()) throw new Error("Agent returned empty output")
    return text
  }

  async function finalizeAndSave(parsed: Record<string, unknown>, id: string, name: string) {
    const mode = selectedAgentMode()!
    const draftPatch = applyAgentModeChange(draftNode(), mode.id)
    const modelPatch = modelOptions().find((item) => item.id === modelOptionId())
      ? applyModelOptionChange({ ...draftNode(), ...draftPatch }, modelOptions().find((item) => item.id === modelOptionId())!)
      : {}
    const normalized = normalizeGeneratedTemplate(parsed, { ...draftPatch, ...modelPatch }, id, name)
    setPreview(JSON.stringify(normalized, null, 2))

    const validation = await validateDrawmoonWorkflowTemplate(normalized)
    if (!validation.ok) {
      setMessage(`${t("templateGen.validationFailed")}\n${formatValidationMessage(validation)}`)
      return
    }
    if (validation.warnings.length) {
      setMessage(formatValidationMessage(validation))
    }

    const saved = await saveDrawmoonWorkflowTemplate(normalized)
    await importSavedDrawmoonWorkflowTemplate(saved.meta.id)
    setMessage(`${t("templateGen.saved")}: ${saved.meta.path}`)
  }

  async function validatePreview() {
    if (validating()) return
    const text = preview().trim()
    if (!text) {
      setMessage(t("templateGen.validateEmpty"))
      return
    }
    setValidating(true)
    setMessage(null)
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const result = await validateDrawmoonWorkflowTemplate(parsed)
      setMessage(formatValidationMessage(result))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setValidating(false)
    }
  }

  async function generateAndSave() {
    if (running()) return
    if (!brief().trim()) {
      setMessage(genMode() === "modify" ? t("templateGen.modifyInstructionsRequired") : "Workflow brief is required.")
      return
    }

    setRunning(true)
    setMessage(null)
    setRawOutput("")
    setPreview("")

    try {
      const mode = selectedAgentMode()!
      const api = selectedLlmApi()
      let text: string

      if (genMode() === "modify") {
        const srcId = sourceTemplateId().trim()
        if (!srcId) {
          setMessage(t("templateGen.sourceTemplateRequired"))
          return
        }
        const loaded = await fetchDrawmoonWorkflowTemplate(srcId)
        const prompt = buildTemplateModifierPrompt({
          instructions: brief(),
          template: loaded as Record<string, unknown>,
          outputTemplateId: templateId() || srcId,
          outputTemplateName: templateName(),
          agentModeId: mode.id,
          llmApiId: api?.id,
        })
        text = await runLlm(prompt)
      } else {
        const prompt = buildTemplateGeneratorPrompt({
          brief: brief(),
          templateId: templateId(),
          templateName: templateName(),
          agentModeId: mode.id,
          llmApiId: api?.id,
        })
        text = await runLlm(prompt)
      }

      setRawOutput(text)
      const parsed = extractWorkflowTemplateJson(text)
      const id = slugifyTemplateId(templateId() || String(parsed.id ?? "") || templateName())
      const name = templateName().trim() || (typeof parsed.name === "string" ? parsed.name : id)
      await finalizeAndSave(parsed, id, name)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div class="view-stack template-gen-view">
      <header class="view-heading view-heading--split">
        <div>
          <span class="eyebrow">{t("templateGen.title")}</span>
          <h2>~/.drawmoon/templates/workflows</h2>
          <p>{t("templateGen.subtitle")}</p>
          <p class="tools-hint">{t("settings.drawmoonHint")}</p>
        </div>
        <div class="quick-actions">
          <Show when={preview()}>
            <AppButton icon="save" onClick={() => { if (!validating()) void validatePreview() }}>
              {validating() ? t("templateGen.validating") : t("templateGen.validate")}
            </AppButton>
          </Show>
          <AppButton icon="workflow" onClick={() => { if (!running()) void generateAndSave() }}>
            {running()
              ? (genMode() === "modify" ? t("templateGen.modifying") : t("templateGen.generating"))
              : (genMode() === "modify" ? t("templateGen.modify") : t("templateGen.generate"))}
          </AppButton>
        </div>
      </header>

      <Show when={message()}>
        {(text) => <pre class="tools-message template-gen-message">{text()}</pre>}
      </Show>

      <Glass class="template-gen-form">
        <div class="template-gen-mode-tabs">
          <button type="button" classList={{ "is-active": genMode() === "create" }} onClick={() => setGenMode("create")}>
            {t("templateGen.modeCreate")}
          </button>
          <button type="button" classList={{ "is-active": genMode() === "modify" }} onClick={() => setGenMode("modify")}>
            {t("templateGen.modeModify")}
          </button>
        </div>

        <div class="template-gen-grid">
          <Show when={genMode() === "modify"}>
            <label>
              <span>{t("templateGen.sourceTemplate")}</span>
              <select value={sourceTemplateId()} onChange={(event) => setSourceTemplateId(event.currentTarget.value)}>
                <option value="">{t("templateGen.sourceTemplatePlaceholder")}</option>
                <For each={sourceTemplates()}>
                  {(item) => <option value={item.id}>{item.name} ({item.id})</option>}
                </For>
              </select>
            </label>
          </Show>
          <label>
            <span>{t("templateGen.templateId")}</span>
            <input value={templateId()} onInput={(event) => setTemplateId(event.currentTarget.value)} placeholder="my-workflow" />
          </label>
          <label>
            <span>{t("templateGen.templateName")}</span>
            <input value={templateName()} onInput={(event) => setTemplateName(event.currentTarget.value)} placeholder="My Workflow" />
          </label>
          <label>
            <span>{t("templateGen.agentMode")}</span>
            <select value={agentModeId()} onChange={(event) => onAgentModeChange(event.currentTarget.value)}>
              <For each={agentModeGroups()}>
                {(group) => (
                  <optgroup label={group.label}>
                    <For each={group.modes}>
                      {(mode) => <option value={mode.id}>{mode.name}</option>}
                    </For>
                  </optgroup>
                )}
              </For>
            </select>
          </label>
          <Show when={modelOptions().length}>
            <label>
              <span>{modelOptions()[0]?.kind === "llm-api" ? t("templateGen.llmApi") : "CLI model"}</span>
              <select
                value={modelOptionId() || modelOptions()[0]?.id || ""}
                onChange={(event) => setModelOptionId(event.currentTarget.value)}
              >
                <For each={modelOptions()}>
                  {(option) => (
                    <option value={option.id}>
                      {option.kind === "llm-api" ? `${option.name} / ${option.model}` : option.name}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </Show>
        </div>
        <label class="template-gen-brief">
          <span>{genMode() === "modify" ? t("templateGen.modifyInstructions") : t("templateGen.brief")}</span>
          <textarea
            rows={8}
            value={brief()}
            onInput={(event) => setBrief(event.currentTarget.value)}
            placeholder={genMode() === "modify" ? t("templateGen.modifyPlaceholder") : t("templateGen.briefPlaceholder")}
          />
        </label>
      </Glass>

      <Show when={rawOutput()}>
        <Glass class="template-gen-output">
          <span class="eyebrow">{t("templateGen.output")}</span>
          <pre>{rawOutput()}</pre>
        </Glass>
      </Show>

      <Show when={preview()}>
        <Glass class="template-gen-output">
          <span class="eyebrow">{t("templateGen.preview")}</span>
          <pre>{preview()}</pre>
        </Glass>
      </Show>
    </div>
  )
}
