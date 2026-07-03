import { PlainAgentModeTemplate } from "../template-registry"
import type { AgentModeTemplate } from "../console-model"

function opencodeMode(mode: "chat" | "plan" | "build"): PlainAgentModeTemplate {
  const writes = mode !== "chat"
  const labels: Record<typeof mode, string> = {
    chat: "Chat",
    plan: "Plan",
    build: "Build",
  }
  return new PlainAgentModeTemplate({
    id: `opencode-${mode}`,
    name: `OpenCode ${labels[mode]}`,
    description: `OpenCode ${mode} strategy. CLI execution is fixed; workflow nodes bind the LLM API/model at runtime and derived modes may override prompt and iteration policy.`,
    provider: "opencode",
    cliTemplateId: "opencode-cli",
    strategyKind: "cli",
    controlSurface: "customizable",
    origin: "native-cli",
    mode,
    model: "workflow-selected",
    contextMode: mode === "chat" ? "fresh" : "inherit",
    defaultSystemPromptFile: `opencode://${mode}`,
    defaultSystemPrompt: mode === "chat"
      ? "Use OpenCode chat mode to answer the workflow node objective directly."
      : mode === "plan"
        ? "Use OpenCode plan mode to produce a concrete implementation or writing plan for the workflow node objective."
        : "Use OpenCode build mode to execute the workflow node objective and produce the declared artifact.",
    allowSystemPromptOverride: true,
    allowedTools: writes
      ? ["read_file", "write_file", "edit_file", "shell_metadata", "artifact_link"]
      : ["read_file", "artifact_link"],
    outputKinds: ["markdown", "json", "directory"] as AgentModeTemplate["outputKinds"],
    maxIterations: mode === "chat" ? 1 : 25,
    timeoutMs: mode === "chat" ? 300_000 : 900_000,
    allowFileWrites: writes,
    cacheFiles: [],
    contextFiles: [],
    retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
    fieldPolicy: {
      model: "inherited",
      defaultSystemPrompt: "editable",
      defaultUserPromptBias: "editable",
      contextMode: "editable",
      maxIterations: "editable",
      timeoutMs: "editable",
      allowFileWrites: "editable",
      allowSystemPromptOverride: "editable",
    },
  })
}

export const opencodeChatTemplate = opencodeMode("chat")
export const opencodePlanTemplate = opencodeMode("plan")
export const opencodeBuildTemplate = opencodeMode("build")
