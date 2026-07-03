import { createMemo, createSignal, For, Show } from "solid-js"

import { agents, backendProviders, paperTemplate, systemSnapshot, getWorkflowEntities } from "../../../data/console-mock"
import type { AgentItem, BackendProvider, ContextMode, LlmApiTemplate, NodeKind, NodeModality, NodeState, WorkflowEdge, WorkflowEntity, WorkflowNode, WorkflowStatus, WorkflowTemplate } from "../../../data/console-model"
import { ensureTemplateBootstrap, getBootstrappedWorkflowTemplates, resolveDefaultWorkflowTemplate } from "../../../data/bootstrap-templates"
import { cliTemplateByProvider } from "../../../data/cli-templates"
import { resolveNodeCliTemplate, runtimeAgentModeId } from "../../../data/cli-cascade"
import { resolveExecutorBinding } from "../../../data/node-executor-binding"
import { nodeUsesExternalLlmApi, resolveCliNodeModel } from "../../../data/node-llm-binding"
import {
  getAgentModeTemplate,
  getLlmApiTemplate,
  getWorkflowUiTemplate,
  importWorkflowUiTemplateFromJson,
  registerWorkflowUiTemplate,
} from "../../../data/template-registry"
import {
  listWorkflowEntities,
  resolveNodeExecutor,
  subscribeWorkflowEntities,
  workflowEntityTemplate,
} from "../../../data/workflow-entity"
import { agentModeTemplates } from "../../../data/agent-mode-templates"
import { listLlmApiTemplates, llmApiTemplates } from "../../../data/llm-api-templates"
import { convertBaseTemplate, providerAgentId, providerAgentModeTemplateId, providerLlmApiTemplateId, nodeStateFromTemplateStatus } from "../../../data/template-converters"
import { nodesById, resolveSessionKey } from "../../../data/session-utils"
import { executionAncestorIds } from "../../../data/execution-flow"
import { hasToolConstraints, resolveNodeToolConstraints } from "../../../data/tool-constraints"
import { resolveNodeArchetype } from "../../../data/agent-mode-runtime"
import { composeStrategySystemPrompt } from "../../../data/agent-mode-strategy-kv"
import { formatProviderModelLabel } from "../../../utils/display-label"
import { Icon, type IconName } from "../../../components/Icon"
import { AppButton, Glass, switchPaneAttrs } from "../../../ui-kit"

ensureTemplateBootstrap()

export { agentModeTemplates, agents, backendProviders, llmApiTemplates, paperTemplate, systemSnapshot, resolveDefaultWorkflowTemplate }
export { convertBaseTemplate, nodeStateFromTemplateStatus, providerAgentId, providerAgentModeTemplateId, providerLlmApiTemplateId }
export { buildSharedSessions, nodesById, resolveSessionKey, sessionThreadSummary, sessionTurnLabel } from "../../../data/session-utils"
export { importWorkflowUiTemplateFromJson, registerWorkflowUiTemplate, resolveNodeExecutor, workflowEntityTemplate }

// Bridge the imperative workflow-entity registry (a plain Map + listener set)
// into Solid reactivity. Consumers that read getWorkflowEntityList() inside a
// tracking scope will re-run whenever the registry emits a change (SSE stream,
// poll, lifecycle patch), so entity lists refresh live without a full reload.
//
// The registry already de-dups emits by UI signature, but a single update burst
// can still fire many times (importRuntimeWorkflowRuns / poll registering every
// run in a loop). Coalesce those into one revision bump per microtask so the
// whole console isn't re-rendered once per entity during active runs.
const [entitiesRevision, setEntitiesRevision] = createSignal(0)
let entitiesBumpScheduled = false
subscribeWorkflowEntities(() => {
  if (entitiesBumpScheduled) return
  entitiesBumpScheduled = true
  queueMicrotask(() => {
    entitiesBumpScheduled = false
    setEntitiesRevision((value) => value + 1)
  })
})

export function getWorkflowEntityList() {
  entitiesRevision()
  return listWorkflowEntities()
}

export { getWorkflowEntityList as getWorkflowEntities }
export const workflowEntities = new Proxy([] as WorkflowEntity[], {
  get(_target, prop, receiver) {
    const list = listWorkflowEntities()
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list)
    const value = Reflect.get(list, prop, receiver)
    return typeof value === "function" ? value.bind(list) : value
  },
})

export function getWorkflowTemplates(): WorkflowTemplate[] {
  return getBootstrappedWorkflowTemplates()
}

export const workflowTemplates: WorkflowTemplate[] = new Proxy([] as WorkflowTemplate[], {
  get(_target, prop, receiver) {
    const list = getBootstrappedWorkflowTemplates()
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list)
    const value = Reflect.get(list, prop, receiver)
    return typeof value === "function" ? value.bind(list) : value
  },
})

export function createWorkflowEntitySwitch(initial: WorkflowEntity) {
  const [entity, setEntityRaw] = createSignal(initial)
  const [switchDir, setSwitchDir] = createSignal(1)
  const [switchTick, setSwitchTick] = createSignal(0)
  let lastIndex = Math.max(0, getWorkflowEntityList().findIndex((item) => item.id === initial.id))

  function selectEntity(item: WorkflowEntity) {
    const nextIndex = getWorkflowEntityList().findIndex((entry) => entry.id === item.id)
    if (nextIndex < 0) return
    if (nextIndex !== lastIndex) {
      setSwitchDir(nextIndex > lastIndex ? 1 : -1)
      lastIndex = nextIndex
      setSwitchTick(0)
      requestAnimationFrame(() => setSwitchTick((tick) => tick + 1))
    }
    setEntityRaw(item)
  }

  function syncEntity(item: WorkflowEntity) {
    const nextIndex = getWorkflowEntityList().findIndex((entry) => entry.id === item.id)
    if (nextIndex >= 0) lastIndex = nextIndex
    setEntityRaw(item)
  }

  function switchAttrs() {
    return switchPaneAttrs(switchTick(), switchDir() as 1 | -1)
  }

  return { entity, selectEntity, syncEntity, switchAttrs }
}

export type HomeTaskSummary = {
  id: string
  title: string
  progress: number
  currentColumn: number
  totalColumns: number
  parallelCount: number
  doneCount: number
  currentStage: { index: number; total: number; name: string; color: string; state: NodeState }
  nodeStates: Array<{ label: string; state: NodeState }>
  stages: Array<{ id: string; name: string; color: string; state: NodeState }>
  entity: WorkflowEntity
}

export const componentKinds: Array<{ kind: NodeKind; label: string; icon: IconName }> = [
  { kind: "input", label: "Input", icon: "import" },
  { kind: "plan", label: "Plan", icon: "template" },
  { kind: "route", label: "Route", icon: "branch" },
  { kind: "run-cli", label: "Run CLI", icon: "system" },
  { kind: "parallel-tools", label: "Parallel Tools", icon: "workflow" },
  { kind: "merge", label: "Merge", icon: "merge" },
  { kind: "verify", label: "Verify", icon: "status" },
  { kind: "summarize", label: "Summarize", icon: "template" },
  { kind: "output", label: "Output", icon: "export" },
  { kind: "agent-mode", label: "Agent Mode", icon: "agent" },
  { kind: "condition", label: "Condition", icon: "branch" },
  { kind: "loop", label: "Loop", icon: "loop" },
  { kind: "tool-step", label: "Tool Step", icon: "settings" },
  { kind: "llm-step", label: "LLM Step", icon: "api" },
]

export function statusClass(status: WorkflowStatus | NodeState | BackendProvider["status"]) {
  return `state-${status}`
}

export { AppButton, Glass } from "../../../ui-kit"

export function MiniBelt(props: { entity: WorkflowEntity; compact?: boolean }) {
  return (
    <div class="mini-belt" classList={{ "mini-belt--compact": props.compact }}>
      <For each={props.entity.columnStates}>
        {(col, index) => (
          <div class={`mini-col ${statusClass(col.state)}`} classList={{ "is-current": index() + 1 === props.entity.currentColumn }}>
            <div class="mini-track">
              <For each={Array.from({ length: Math.max(1, col.parallel) })}>
                {(_, botIndex) => <span class="mini-bot" classList={{ "is-done": botIndex() < col.done }} />}
              </For>
            </div>
            <span class="mini-col-label">{index() + 1}</span>
          </div>
        )}
      </For>
      <svg class="mini-loop" viewBox="0 0 100 28" aria-hidden="true">
        <path d="M 74 22 C 96 22 96 4 72 4" />
      </svg>
    </div>
  )
}

export function Sparkline(props: { samples: number[] }) {
  const d = createMemo(() => {
    const max = Math.max(...props.samples, 1)
    return props.samples.map((v, i) => `${i ? "L" : "M"} ${i * 13} ${32 - (v / max) * 28}`).join(" ")
  })
  return (
    <svg class="sparkline" viewBox="0 0 92 36" aria-hidden="true">
      <path d={d()} />
    </svg>
  )
}

export function Robot(props: { agent: AgentItem; node?: WorkflowNode; small?: boolean }) {
  return (
    <div class={`agent-bot ${statusClass(props.agent.status)}`} classList={{ "agent-bot--small": props.small }} tabIndex={0}>
      <span class="bot-antenna" />
      <span class="bot-eye bot-eye--left" />
      <span class="bot-eye bot-eye--right" />
      <span class="bot-mouth" />
      <div class="bot-popover">
        <strong>{props.agent.name}</strong>
        <span>{props.agent.role} / {props.agent.status}</span>
        <p><b>{props.agent.promptTitle}</b></p>
        <p>{props.agent.promptPreview}</p>
        <p>Last: {props.agent.lastOutput}</p>
        <div class="bot-meta">
          <em>{props.agent.tokens.toLocaleString()} tokens</em>
          <Show when={props.agent.tokenUsage}>
            {(usage) => (
              <em>
                in {usage().inputTokens.toLocaleString()} · out {usage().outputTokens.toLocaleString()}
                · cache {usage().cacheReadTokens}/{usage().cacheWriteTokens}
              </em>
            )}
          </Show>
          <em>{props.agent.tools.join(", ") || "no tools"}</em>
        </div>
      </div>
    </div>
  )
}

export function nodeIcon(kind: NodeKind): IconName {
  return componentKinds.find((item) => item.kind === kind)?.icon ?? "template"
}

export function agentById(id: string) {
  return agents.find((agent) => agent.id === id) ?? agents[0]
}

export function agentModeById(id?: string) {
  return getAgentModeTemplate(id) ?? agentModeTemplates[0]
}

export function llmApiById(id?: string) {
  return getLlmApiTemplate(id) ?? listLlmApiTemplates()[0]
}

export function executionLabel(node: WorkflowNode, template: WorkflowTemplate = paperTemplate) {
  const executor = resolveNodeExecutor(node, template)
  if (executor.executionMode === "llm-api") return executor.llmApi?.name ?? "LLM API"
  if (executor.executionMode === "agent-mode") return executor.agentMode?.name ?? "Agent Mode"
  if (executor.executionMode === "cli") return executor.cli?.name ?? "CLI metadata/tool"
  if (node.executionMode === "tool") return "Tool runner"
  if (node.executionMode === "human-gate") return "Human gate"
  if (node.executionMode === "inquiry") return "Inquiry"
  return agentById(node.agentId)?.name ?? node.agentId
}

export function stationState(node: WorkflowNode, entity?: WorkflowEntity) {
  const agent = entity?.activeAgents.find((item) => item.currentNodeId === node.id)
  return agent?.status ?? node.state ?? "waiting"
}

export function formatHomeTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function homeTaskSummaries(): HomeTaskSummary[] {
  return getWorkflowEntityList().filter((entity) => entity.status === "running" || entity.status === "looping").slice(0, 3).map((entity) => {
    const template = workflowEntityTemplate(entity)
    const current = entity.columnStates[entity.currentColumn - 1]
    const nodeStates = entity.columnStates.slice(0, 6).map((columnState, index) => {
      const column = template.columns[index]
      return {
        label: column?.name.split(" ")[0] ?? `Col ${index + 1}`,
        state: columnState.state,
      }
    })
    const stages = template.stages.map((stage) => {
      const stageColumns = entity.columnStates.filter((column) => stage.columnIds.includes(column.columnId))
      const state = stageColumns.some((column) => column.state === "running" || column.state === "looping")
        ? "running"
        : stageColumns.every((column) => column.state === "done")
          ? "done"
          : stageColumns.some((column) => column.state === "failed")
            ? "failed"
            : "waiting"
      return { id: stage.id, name: stage.name, color: stage.color, state: state as NodeState }
    })
    const currentStageIndex = Math.max(0, stages.findIndex((stage) => stage.id === entity.currentStageId))
    const currentStage = stages[currentStageIndex] ?? stages.find((stage) => stage.state === "running") ?? stages[0]!

    return {
      id: entity.id,
      title: entity.name,
      progress: entity.progress,
      currentColumn: entity.currentColumn,
      totalColumns: entity.columnStates.length,
      parallelCount: current?.parallel ?? 0,
      doneCount: current?.done ?? 0,
      currentStage: {
        index: (currentStageIndex >= 0 ? currentStageIndex : 0) + 1,
        total: stages.length,
        name: currentStage.name,
        color: currentStage.color,
        state: currentStage.state,
      },
      nodeStates,
      stages,
      entity,
    }
  })
}

export const CARD_HALF_WIDTH = 115
export const ARROW_HEAD = 18
export const ARROW_HALF = 10

export function edgeFill(color: string) {
  if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", ", 0.58)")
  if (color.startsWith("rgba(")) return color.replace(/,\s*[\d.]+\)$/, ", 0.58)")
  return color
}

export function templateArtifactForPdf(entity: WorkflowEntity, template: WorkflowTemplate) {
  return [...entity.artifacts, ...template.nodes.flatMap((node) => node.artifacts ?? [])].find((artifact) => artifact.kind === "pdf")
}

export function colorToHex(color: string) {
  if (color.startsWith("#")) return color
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return "#e9bf55"
  return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`
}

export function providerFromNode(node: WorkflowNode, template: WorkflowTemplate = paperTemplate): string {
  return resolveNodeExecutor(node, template).provider
}

function runtimeModeFromNode(node: WorkflowNode) {
  const agentMode = node.agentModeTemplateId ? getAgentModeTemplate(node.agentModeTemplateId) : undefined
  const raw = node.runtimeMode ?? agentMode?.mode
  if (raw === "agent") return "agent"
  if (raw === "plan") return "plan"
  if (raw === "review") return "review"
  if (raw === "chat") return "chat"
  if (node.executionMode === "llm-api") return "chat"
  if (node.executionMode === "cli") return "review"
  return "build"
}

function workflowSelectedModel(node: WorkflowNode, template: WorkflowTemplate, llmApi?: LlmApiTemplate) {
  if (!nodeUsesExternalLlmApi(node, template)) return resolveCliNodeModel(node)
  const override = node.runtimeOverrides?.model?.trim()
  if (override) return override
  return llmApi?.model
}

function outputFileFromNode(node: WorkflowNode) {
  if (node.modality === "image") {
    const imageArtifact = node.artifacts?.find((artifact) => artifact.kind === "image" && artifact.path?.trim())
    if (imageArtifact?.path) return imageArtifact.path
    const pngArtifact = node.artifacts?.find((artifact) => /\.png$/i.test(artifact.path ?? ""))
    if (pngArtifact?.path) return pngArtifact.path
    return `${node.id}.png`
  }
  const textArtifact = node.artifacts?.find((artifact) => {
    const path = artifact.path?.trim()
    if (!path) return false
    if (artifact.kind === "markdown" || /\.(md|tex|html|json|txt)$/i.test(path)) return true
    return false
  })
  if (textArtifact?.path) return textArtifact.path

  const pathArtifact = node.artifacts?.find((artifact) => {
    const path = artifact.path?.trim()
    if (!path) return false
    return !/\.(pdf|png|jpe?g|gif|webp)$/i.test(path)
  })
  if (pathArtifact?.path) return pathArtifact.path

  const preferred = node.artifacts?.find((artifact) =>
    artifact.kind === "markdown" || artifact.label.endsWith(".md") || artifact.label.endsWith(".html"),
  )
  if (preferred?.path) return preferred.path
  if (preferred?.label) return preferred.label
  if (node.modality === "image") return `${node.id}.png`
  return `${node.id}.md`
}

function readRunFilesForNode(template: WorkflowTemplate, node: WorkflowNode) {
  const fromOverride = node.runtimeOverrides?.readRunFiles?.filter(Boolean)
  if (fromOverride?.length) return [...new Set(fromOverride)]
  if (node.id !== "final-review" && node.id !== "final-output") return undefined
  const ancestors = executionAncestorIds(template, node.id)
  const files = template.nodes
    .filter((candidate) => ancestors.has(candidate.id))
    .map(outputFileFromNode)
    .filter((name) => name.endsWith(".md"))
  const plan = template.nodes.find((candidate) => candidate.id === "master-plan")
  const planFile = plan && ancestors.has(plan.id) ? outputFileFromNode(plan) : undefined
  return [...new Set([planFile, ...files].filter((name): name is string => Boolean(name)))]
}

function fallbackWorkflowLlmApi(node: WorkflowNode): LlmApiTemplate | undefined {
  const id = node.llmApiTemplateId
  if (!id?.startsWith("kuaipao-") && !id?.startsWith("deepseek-")) return undefined
  const model = node.runtimeOverrides?.model?.trim()
  if (!model) return undefined
  const isImage = node.modality === "image" || /image|gpt-image|dall-e/i.test(model)
  const isDeepseek = id.startsWith("deepseek-") || /deepseek/i.test(model)
  return {
    id,
    name: formatProviderModelLabel(isDeepseek && id.startsWith("deepseek-") ? "DeepSeek" : "Kuaipao", model),
    description: "Fallback runtime binding until live model discovery completes.",
    provider: "custom",
    endpoint: isDeepseek && id.startsWith("deepseek-") ? "https://api.deepseek.com/v1" : "https://kuaipao.pro/v1",
    protocol: "openai-compatible",
    wireProtocol: isDeepseek ? "deepseek-chat" : "openai-chat",
    model,
    contextWindow: 0,
    temperature: isImage ? undefined : node.runtimeOverrides?.temperature ?? 0.7,
    topP: node.runtimeOverrides?.topP,
    maxOutputTokens: node.runtimeOverrides?.maxOutputTokens ?? (isImage ? undefined : 8192),
    responseFormat: node.runtimeOverrides?.responseFormat ?? "markdown",
    modalities: [node.modality ?? (isImage ? "image" : "text")],
    defaultSystemPrompt: "",
    allowSystemPromptOverride: true,
    allowUserPromptBias: false,
    apiKeyEnv: isDeepseek && id.startsWith("deepseek-") ? "DEEPSEEK_API_KEY" : isImage ? "KUAIPAO_CDK_1_API_KEY" : "KUAIPAO_API_KEY",
    timeoutMs: node.runtimeOverrides?.timeoutMs ?? (isImage ? 180_000 : 300_000),
    retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
  }
}

export function workflowToRuntimeGraph(template: WorkflowTemplate) {
  const lookup = nodesById(template.nodes)
  return {
    nodes: template.nodes.map((node) => {
      const session = node.session
      const sessionKey = resolveSessionKey(node, lookup)
      const binding = resolveExecutorBinding(node, template)
      const agentMode = node.agentModeTemplateId ? getAgentModeTemplate(node.agentModeTemplateId) : undefined
      const cli = resolveNodeCliTemplate(node)
      const provider = cli?.providerId ?? providerFromNode(node, template)
      const mode = runtimeModeFromNode(node)
      const contextMode = node.runtimeOverrides?.contextMode ?? agentMode?.contextMode ?? "fresh"
      const modality: NodeModality = node.modality ?? "text"
      const executionKind = node.executionMode === "tool"
        ? "tool"
        : node.executionMode === "human-gate"
          ? "human-gate"
          : node.executionMode === "inquiry"
            ? "inquiry"
            : binding.isDirectApi || node.executionMode === "llm-api"
            ? "llm-api"
            : "agent-mode"
      const llmApi = binding.modelSource === "llm-api" && node.llmApiTemplateId
        ? (getLlmApiTemplate(node.llmApiTemplateId) ?? fallbackWorkflowLlmApi(node))
        : undefined
      const model = workflowSelectedModel(node, template, llmApi)
      const toolConstraints = resolveNodeToolConstraints(node, agentMode)
      const llmApiBinding = llmApi && {
        id: llmApi.id,
        endpoint: llmApi.endpoint,
        protocol: llmApi.wireProtocol ?? llmApi.protocol,
        model: model || llmApi.model,
        apiKeyEnv: llmApi.apiKeyEnv,
        timeoutMs: node.runtimeOverrides?.timeoutMs ?? llmApi.timeoutMs,
        temperature: node.runtimeOverrides?.temperature ?? llmApi.temperature,
        topP: node.runtimeOverrides?.topP ?? llmApi.topP,
        maxOutputTokens: node.runtimeOverrides?.maxOutputTokens ?? llmApi.maxOutputTokens,
        responseFormat: node.runtimeOverrides?.responseFormat ?? llmApi.responseFormat,
        system: node.promptOverrides?.systemPrompt ?? llmApi.defaultSystemPrompt,
      }
      const outputFile = outputFileFromNode(node)
      const readRunFiles = readRunFilesForNode(template, node)
      const contextFiles = node.runtimeOverrides?.contextFiles ?? agentMode?.contextFiles ?? []
      const cacheFiles = node.runtimeOverrides?.cacheFiles ?? agentMode?.cacheFiles ?? []
      const archetype = resolveNodeArchetype(node, agentMode)
      const contract = node.runtimeOverrides?.contract ?? agentMode?.defaultRuntimeOverrides?.contract
      const intent = node.runtimeOverrides?.intent

      return {
        id: node.id,
        label: node.name,
        position: { x: node.x, y: node.y },
        metadata: {
          outputFile,
          ...(readRunFiles?.length ? { readRunFiles } : {}),
          ...(archetype ? { archetype } : {}),
          ...(intent ? { intent } : {}),
          ...(contract ? { contract } : {}),
          ...(node.runtimeOverrides?.plannerInquiry ? { plannerInquiry: true } : {}),
          ...(node.runtimeOverrides?.inquiryQuestionsFile
            ? { inquiryQuestionsFile: node.runtimeOverrides.inquiryQuestionsFile }
            : {}),
          ...(node.runtimeOverrides?.inquiryReplyFile
            ? { inquiryReplyFile: node.runtimeOverrides.inquiryReplyFile }
            : {}),
          ...(node.runtimeOverrides?.gateRequiredArtifacts?.length
            ? { gateRequiredArtifacts: node.runtimeOverrides.gateRequiredArtifacts }
            : {}),
        },
        config: {
          provider,
          mode,
          cwd: "",
          prompt: node.promptPreview,
          contextMode,
          maxIterations: node.runtimeOverrides?.maxIterations ?? agentMode?.maxIterations,
          timeoutMs: node.runtimeOverrides?.timeoutMs ?? agentMode?.timeoutMs,
          allowFileWrites: agentMode?.allowFileWrites ?? false,
          customCommand: node.runtimeOverrides?.customCommand,
          customArgs: node.runtimeOverrides?.customArgs,
          model,
          llmApi: llmApiBinding,
          modality,
          agentModeId: runtimeAgentModeId(node.agentModeTemplateId),
          ...(session && {
            sessionPolicy: session.policy,
            sessionKey,
          }),
        },
        action: {
          id: node.id,
          kind: executionKind,
          label: node.name,
          inputs: {
            prompt: node.promptPreview,
            contextFiles,
            cacheFiles,
            tools: agentMode?.allowedTools ?? [],
          },
          binding: {
            agentModeId: runtimeAgentModeId(node.agentModeTemplateId),
            llmApiTemplateId: node.llmApiTemplateId,
            providerId: provider,
          },
          metadata: {
            modality,
            llmApi: llmApiBinding,
            outputFile,
            ...(readRunFiles?.length ? { readRunFiles } : {}),
          },
          overrides: {
            provider,
            mode,
            model,
            contextMode,
            maxIterations: node.runtimeOverrides?.maxIterations,
            timeoutMs: node.runtimeOverrides?.timeoutMs,
            allowFileWrites: agentMode?.allowFileWrites,
            customCommand: node.runtimeOverrides?.customCommand,
            customArgs: node.runtimeOverrides?.customArgs,
            systemPromptFile: agentMode?.defaultSystemPromptFile,
            ...(agentMode ? { systemPrompt: composeStrategySystemPrompt(agentMode) } : {}),
          },
          session: session ? {
            policy: session.policy,
            sessionKey,
          } : { policy: contextMode },
          constraints: hasToolConstraints(toolConstraints) ? toolConstraints : {},
          execution: {
            timeoutMs: node.runtimeOverrides?.timeoutMs ?? agentMode?.timeoutMs,
            allowWrites: agentMode?.allowFileWrites ?? false,
            maxIterations: node.runtimeOverrides?.maxIterations ?? agentMode?.maxIterations,
          },
          output: { expectedFormat: modality === "text" ? (node.runtimeOverrides?.responseFormat ?? "text") : modality, summaryPolicy: "inherit" },
          ...(node.executionMode === "human-gate" ? {
            humanGate: {
              gateLabel: node.name,
              approvalText: node.promptPreview || "Review upstream output and continue.",
            },
          } : {}),
          ...(node.executionMode === "inquiry" ? {
            inquiry: {
              inquiryLabel: node.name,
              promptText: node.promptPreview || "Reply with clarifications for the LLM before continuing.",
            },
          } : {}),
        },
      }
    }),
    edges: template.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      contextMode: (edge.contextMode ?? edge.annotation ?? "inherit") as ContextMode,
    })),
    sessionGroups: template.sessionGroups ?? {},
    budgetPolicies: template.budgetPolicies,
    ...(template.readDirectory ? { readDirectory: template.readDirectory } : {}),
    ...(template.inputMounts?.length ? { inputMounts: template.inputMounts } : {}),
  }
}

export { subscribeWorkflowEntities }
