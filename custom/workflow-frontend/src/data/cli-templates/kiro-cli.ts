import { PlainCliProviderTemplate } from "../template-registry"
import { kiroCliCapabilities } from "./capabilities"

export const kiroCliTemplate = new PlainCliProviderTemplate({
  id: "kiro-cli",
  name: "KIRO",
  description: "KIRO CLI binding with editable display fields.",
  startupCommand: "kiro-cli",
  providerId: "kiro",
  cliKind: "official",
  promptCommand: { id: "send-prompt", label: "Send Prompt", command: "kiro-cli", args: ["chat", "--no-interactive", "{{prompt}}"], outputStyle: "text", consumesTokens: true },
  fields: [
    { key: "balance", value: "$18.42" },
    { key: "usage", value: "$1.58 used this month" },
    { key: "quota", value: "$20.00 monthly" },
    { key: "remaining", value: "$18.42" },
    { key: "current model", value: "deepseek-3.2" },
    { key: "billing cycle", value: "monthly" },
  ],
  commands: [
    { id: "models", label: "Model List", command: "kiro-cli", args: ["chat", "--list-models", "--format", "json"], outputStyle: "json", consumesTokens: false },
    { id: "whoami", label: "Who Am I", command: "kiro-cli", args: ["whoami"], outputStyle: "text", consumesTokens: false },
    { id: "settings", label: "Settings", command: "kiro-cli", args: ["settings"], outputStyle: "text", consumesTokens: false },
  ],
  models: [
    { id: "deepseek-3.2", name: "deepseek-3.2", statusLabel: "preview", fields: [{ key: "credits", value: "0.25x" }, { key: "description", value: "Experimental preview of DeepSeek V3.2" }] },
    { id: "minimax-m2.5", name: "minimax-m2.5", statusLabel: "available", fields: [{ key: "credits", value: "0.25x" }, { key: "description", value: "The MiniMax M2.5 model" }] },
    { id: "qwen3-coder-next", name: "qwen3-coder-next", statusLabel: "active", fields: [{ key: "credits", value: "0.05x" }, { key: "description", value: "Experimental preview of Qwen3 Coder Next" }] },
  ],
  capabilities: kiroCliCapabilities,
})
