import type { CliCapabilities } from "../console-model"

export const directApiCliCapabilities: CliCapabilities = {
  controlSurface: "customizable",
  modelBinding: "llm-api",
  supportedModes: ["chat"],
  quota: {
    kind: "unlimited",
    unitLabel: "API template",
  },
  allowDerivedAgentModes: false,
  modelCapabilities: [
    { id: "workflow-selected", supportedModes: ["chat"] },
  ],
}

export const opencodeCliCapabilities: CliCapabilities = {
  controlSurface: "customizable",
  modelBinding: "llm-api",
  supportedModes: ["chat", "plan", "build", "agent"],
  quota: {
    kind: "monthly_usd",
    probeCommandId: "opencode-usage-db",
    refreshIntervalMs: 120_000,
    unitLabel: "USD",
  },
  editableAgentModeFields: [
    "defaultSystemPrompt",
    "defaultUserPromptBias",
    "model",
    "contextMode",
    "maxIterations",
    "timeoutMs",
    "allowFileWrites",
  ],
  allowDerivedAgentModes: true,
  modelCapabilities: [
    { id: "workflow-selected", supportedModes: ["chat", "plan", "build", "agent"] },
  ],
}

export const codexCliCapabilities: CliCapabilities = {
  controlSurface: "cli-owned",
  modelBinding: "cli-native",
  supportedModes: ["build", "review"],
  quota: {
    kind: "weekly_percent",
    probeCommandId: "codex-usage",
    refreshIntervalMs: 300_000,
    unitLabel: "%",
  },
  allowDerivedAgentModes: false,
  modelCapabilities: [
    { id: "codex/configured", supportedModes: ["build", "review"] },
    { id: "codex/exec", supportedModes: ["build"] },
  ],
}

export const copilotCliCapabilities: CliCapabilities = {
  controlSurface: "cli-owned",
  modelBinding: "cli-native",
  supportedModes: ["chat"],
  quota: {
    kind: "hourly",
    probeCommandId: "gh-copilot-usage",
    refreshIntervalMs: 300_000,
    unitLabel: "hours",
  },
  allowDerivedAgentModes: false,
  modelCapabilities: [
    { id: "copilot/selected-model", supportedModes: ["chat"] },
  ],
}

export const claudeCodeCliCapabilities: CliCapabilities = {
  controlSurface: "cli-owned",
  modelBinding: "cli-native",
  supportedModes: ["build", "chat"],
  quota: {
    kind: "unknown",
    unitLabel: "subscription",
  },
  allowDerivedAgentModes: false,
  modelCapabilities: [
    { id: "claude-code/configured", supportedModes: ["build", "chat"] },
  ],
}

export const kiroCliCapabilities: CliCapabilities = {
  controlSurface: "customizable",
  modelBinding: "cli-native",
  supportedModes: ["chat", "plan", "agent", "review"],
  quota: {
    kind: "monthly_usd",
    probeCommandId: "whoami",
    refreshIntervalMs: 300_000,
    unitLabel: "USD",
  },
  editableAgentModeFields: [
    "defaultSystemPrompt",
    "defaultUserPromptBias",
    "contextMode",
    "maxIterations",
    "timeoutMs",
  ],
  allowDerivedAgentModes: true,
  modelCapabilities: [
    { id: "deepseek-3.2", costMultiplier: 0.25, supportedModes: ["chat", "agent", "review"] },
    { id: "minimax-m2.5", costMultiplier: 0.25, supportedModes: ["chat", "agent", "review"] },
    { id: "qwen3-coder-next", costMultiplier: 0.05, supportedModes: ["chat", "plan", "agent"] },
  ],
}
