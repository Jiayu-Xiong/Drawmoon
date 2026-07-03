import { PlainCliProviderTemplate } from "../template-registry"
import { codexCliCapabilities } from "./capabilities"

export const codexCliTemplate = new PlainCliProviderTemplate({
  id: "codex-cli",
  name: "Codex",
  description: "Codex CLI binding focused on configured model, reasoning effort, sandbox, and reported weekly quota percentage.",
  startupCommand: "codex",
  providerId: "codex",
  cliKind: "official",
  promptCommand: { id: "exec-prompt", label: "Exec Prompt", command: "codex", args: ["exec", "{{prompt}}"], outputStyle: "text", consumesTokens: true },
  fields: [
    { key: "weekly remaining", value: "not reported" },
    { key: "weekly used", value: "not reported" },
    { key: "refresh", value: "not reported" },
    { key: "current model", value: "configured default" },
    { key: "reasoning", value: "configured effort" },
    { key: "sandbox", value: "workspace-write" },
  ],
  commands: [
    { id: "version", label: "Version", command: "codex", args: ["--version"], outputStyle: "text", consumesTokens: false },
    { id: "model-config", label: "Model Config", command: "codex", args: ["config"], outputStyle: "code", consumesTokens: false },
    { id: "features", label: "Feature Flags", command: "codex", args: ["features", "list"], outputStyle: "table", consumesTokens: false },
    { id: "exec-help", label: "Exec Help", command: "codex", args: ["exec", "--help"], outputStyle: "text", consumesTokens: false },
  ],
  models: [
    { id: "codex/configured", name: "configured default", statusLabel: "active", fields: [{ key: "source", value: "~/.codex/config.toml" }, { key: "reasoning", value: "configured effort" }, { key: "weekly quota", value: "shared account limit" }, { key: "remaining", value: "not reported" }] },
    { id: "codex/exec", name: "exec mode", statusLabel: "available", fields: [{ key: "source", value: "codex exec --help" }, { key: "quota", value: "shared account limit" }, { key: "file access", value: "sandbox controlled" }] },
  ],
  capabilities: codexCliCapabilities,
})
