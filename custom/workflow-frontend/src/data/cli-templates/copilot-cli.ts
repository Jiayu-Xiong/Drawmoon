import { PlainCliProviderTemplate } from "../template-registry"
import { copilotCliCapabilities } from "./capabilities"

export const copilotCliTemplate = new PlainCliProviderTemplate({
  id: "copilot-cli",
  name: "Copilot",
  description: "GitHub Copilot CLI. Supports non-interactive mode, JSON output, and model selection.",
  startupCommand: "copilot",
  providerId: "copilot",
  cliKind: "official",
  promptCommand: { id: "send-prompt", label: "Send Prompt", command: "copilot", args: ["-p", "{{prompt}}", "-s", "--output-format", "json"], outputStyle: "json", consumesTokens: true },
  fields: [
    { key: "version", value: "1.0.59" },
    { key: "model", value: "copilot/selected-model" },
    { key: "status", value: "ready" },
    { key: "mode", value: "non-interactive" },
  ],
  commands: [
    { id: "version", label: "Version", command: "copilot", args: ["--version"], outputStyle: "text", consumesTokens: false },
    { id: "help", label: "Help", command: "copilot", args: ["--help"], outputStyle: "text", consumesTokens: false },
    { id: "completion", label: "Completion", command: "copilot", args: ["completion", "bash"], outputStyle: "code", consumesTokens: false },
  ],
  models: [
    { id: "copilot/selected-model", name: "selected model", statusLabel: "active", fields: [{ key: "source", value: "copilot --model <model>" }, { key: "usage", value: "copilot subscription" }, { key: "note", value: "Zero-credit commands: --version, --help, completion" }] },
  ],
  capabilities: copilotCliCapabilities,
})
