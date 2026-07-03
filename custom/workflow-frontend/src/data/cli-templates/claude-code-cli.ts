import { PlainCliProviderTemplate } from "../template-registry"
import { claudeCodeCliCapabilities } from "./capabilities"

export const claudeCodeCliTemplate = new PlainCliProviderTemplate({
  id: "claude-code-cli",
  name: "Claude Code",
  description: "Anthropic Claude Code CLI (claude) for local agentic coding sessions.",
  startupCommand: "claude",
  providerId: "custom",
  cliKind: "official",
  promptCommand: {
    id: "prompt",
    label: "Prompt",
    command: "claude",
    args: ["-p", "{{prompt}}"],
    outputStyle: "text",
    consumesTokens: true,
  },
  fields: [
    { key: "command", value: "claude" },
    { key: "mode", value: "agentic coding" },
    { key: "quota", value: "Anthropic subscription" },
  ],
  commands: [
    { id: "version", label: "Version", command: "claude", args: ["--version"], outputStyle: "text", consumesTokens: false },
    { id: "help", label: "Help", command: "claude", args: ["--help"], outputStyle: "text", consumesTokens: false },
  ],
  models: [
    {
      id: "claude-code/configured",
      name: "configured default",
      statusLabel: "active",
      fields: [{ key: "source", value: "local claude config" }],
    },
  ],
  capabilities: claudeCodeCliCapabilities,
})
