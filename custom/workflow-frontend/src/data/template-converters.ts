import {
  DIRECT_API_MODE_ID,
} from "./agent-mode-templates/direct-llm-modes"
import { migrateWorkflowTemplateIntents } from "@opencode-ai/backend-opencode/drawmoon/migrate-template-intents"
import { buildSharedSessions, sessionBindingFromStep } from "./session-utils"
import type { WorkflowTemplateBase } from "./workflow-template"

export const providerAgentId: Record<string, string> = {
  opencode: "agent-paper",
  codex: "agent-codex",
  copilot: "agent-copilot",
  kiro: "agent-kiro-cli",
  custom: "agent-kuaipao",
  openai: "agent-kuaipao",
  anthropic: "agent-kuaipao",
  deepseek: "agent-kuaipao",
}

export const providerAgentModeTemplateId: Record<string, string> = {
  opencode: "opencode-default-agent",
  codex: "codex-cli-build",
  copilot: "copilot-cli-chat",
  kiro: "kiro-cli-metadata",
  custom: "direct-api",
  openai: "direct-api",
  anthropic: "direct-api",
  deepseek: "direct-api",
}

export const kiroAgentModeTemplateIdByMode: Partial<Record<string, string>> = {
  plan: "kiro-cli-plan",
  agent: "kiro-cli-agent",
  chat: "kiro-cli-chat",
  review: "kiro-cli-review",
}

export const opencodeAgentModeTemplateIdByMode: Partial<Record<string, string>> = {
  chat: "opencode-chat",
  plan: "opencode-plan",
  build: "opencode-build",
  agent: "opencode-build",
}

export const providerLlmApiTemplateId: Record<string, string> = {
  custom: "kuaipao-openai-chat",
  openai: "kuaipao-openai-chat",
  anthropic: "kuaipao-openai-chat",
  deepseek: "kuaipao-openai-chat",
  copilot: "kuaipao-openai-chat",
}

export function nodeStateFromTemplateStatus(status: string): WorkflowNode["state"] {
  if (status === "success" || status === "cached") return "done"
  if (status === "failed") return "failed"
  if (status === "running") return "running"
  return "waiting"
}

export function convertBaseTemplate(base: WorkflowTemplateBase): WorkflowTemplate {
  const stageId = `${base.id}-stage`
  const columns = base.steps.map((step, index) => ({
    id: `${base.id}-c${index + 1}`,
    name: step.label,
    stageId,
    lanes: [{ id: `${base.id}-l${index + 1}`, name: step.transport, nodeIds: [step.id] }],
  }))
  const converted: WorkflowTemplate = {
    id: base.id,
    name: base.name,
    description: base.description,
    workingDirectory: base.cwd,
    defaultAgentId: providerAgentId[base.defaultSubagent.provider] ?? "agent-kuaipao",
    defaultAgentModeTemplateId: providerAgentModeTemplateId[base.defaultSubagent.provider] ?? "opencode-default-agent",
    defaultLlmApiTemplateId: providerLlmApiTemplateId[base.defaultSubagent.provider] ?? "kuaipao-openai-chat",
    agentModeTemplateIds: Object.values(providerAgentModeTemplateId),
    llmApiTemplateIds: Object.values(providerLlmApiTemplateId),
    stages: [{ id: stageId, name: base.name, color: "rgb(140,197,223)", columnIds: columns.map((column) => column.id) }],
    columns,
    nodes: base.steps.map((step, index): WorkflowNode => {
      const isCli = step.provider === "copilot" || step.provider === "codex" || step.provider === "kiro" || step.provider === "opencode"
      const isApiOnly = Boolean(providerLlmApiTemplateId[step.provider]) && !isCli
      const modality = step.modality ?? "text"
      const directMode = DIRECT_API_MODE_ID
      return {
        id: step.id,
        name: step.label,
        kind: isApiOnly ? "llm-step" : isCli ? "run-cli" : "agent-mode",
        stageId,
        columnId: columns[index]?.id ?? columns[0]?.id ?? `${base.id}-c1`,
        laneId: columns[index]?.lanes[0]?.id ?? `${base.id}-l1`,
        agentId: providerAgentId[step.provider] ?? "agent-kuaipao",
        executionMode: isApiOnly ? "llm-api" : "agent-mode",
        modality,
        agentModeTemplateId: isApiOnly
          ? directMode
          : step.provider === "kiro"
            ? (kiroAgentModeTemplateIdByMode[step.mode] ?? providerAgentModeTemplateId.kiro)
            : step.provider === "opencode"
              ? (opencodeAgentModeTemplateIdByMode[step.mode] ?? providerAgentModeTemplateId.opencode)
              : (providerAgentModeTemplateId[step.provider] ?? "opencode-default-agent"),
        llmApiTemplateId: providerLlmApiTemplateId[step.provider] ?? "kuaipao-openai-chat",
        promptTitle: step.label,
        promptPreview: step.prompt,
        outputContract: step.meaning,
        x: step.x,
        y: step.y,
        state: nodeStateFromTemplateStatus(step.status),
        session: sessionBindingFromStep(step),
        runtimeOverrides: {
          contextMode: step.contextMode,
          maxIterations: step.maxIterations,
          workingDirectory: base.cwd,
          customCommand: step.customCommand,
          customArgs: step.customArgs,
        },
      }
    }),
    edges: base.edges.map((edge, index) => ({
      id: `${base.id}-e${index + 1}`,
      from: edge.from,
      to: edge.to,
      kind: "normal" as const,
      color: "rgb(140,197,223)",
      annotation: edge.contextMode,
      contextMode: edge.contextMode,
    })),
    loopEdges: [],
    branchGroups: [],
    mergeGroups: [],
  }
  return migrateWorkflowTemplateIntents({
    ...converted,
    sharedSessions: buildSharedSessions(converted.nodes),
    sessionGroups: {},
  } as unknown as Record<string, unknown>) as WorkflowTemplate
}
