import { PlainCliProviderTemplate } from "../template-registry"
import { directApiCliCapabilities } from "./capabilities"

/** Virtual CLI — no process to spawn; nodes bind an LLM API template directly. */
export const DIRECT_API_CLI_ID = "direct-api-cli"

export const directApiCliTemplate = new PlainCliProviderTemplate({
  id: DIRECT_API_CLI_ID,
  name: "Direct API",
  description: "Virtual executor: call a registered LLM API template directly without delegating to a real CLI.",
  startupCommand: "",
  providerId: "direct-api",
  cliKind: "custom",
  promptCommand: {
    id: "noop",
    label: "Direct API (virtual)",
    command: "",
    args: [],
    outputStyle: "text",
    consumesTokens: false,
  },
  fields: [
    { key: "type", value: "virtual CLI" },
    { key: "model source", value: "node LLM API template" },
    { key: "runtime", value: "llm-api action (no subprocess)" },
  ],
  commands: [],
  models: [
    {
      id: "workflow-selected",
      name: "from LLM API template",
      statusLabel: "api-bound",
      fields: [{ key: "source", value: "Workflow node llmApiTemplateId" }],
    },
  ],
  capabilities: directApiCliCapabilities,
})
