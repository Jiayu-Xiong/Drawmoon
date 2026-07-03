import { PlainCliProviderTemplate } from "../template-registry"
import { opencodeCliCapabilities } from "./capabilities"
import { VENDORED_OPENCODE_CLI_DIR } from "@opencode-ai/backend-opencode/lib/product-paths"
import { xyMonorepoRoot } from "../../lib/repo-paths"

function joinPath(root: string, ...segments: string[]): string {
  const sep = root.includes("\\") ? "\\" : "/"
  const parts = [root.replace(/[/\\]+$/, ""), ...segments.map((s) => s.replace(/^[/\\]+|[/\\]+$/g, ""))]
  return parts.filter(Boolean).join(sep)
}

const opencodeCwd = joinPath(xyMonorepoRoot(), ...VENDORED_OPENCODE_CLI_DIR.split("/"))
const isWin = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent)
const bunCommand = isWin ? "bun.cmd" : "bun"
const opencodeArgs = ["run", "--cwd", opencodeCwd, "--conditions=browser", "src/index.ts"]

export const opencodeCliTemplate = new PlainCliProviderTemplate({
  id: "opencode-cli",
  name: "OpenCode",
  description: "OpenCode CLI binding with local DB usage telemetry, editable native agent modes, and model usage accounting.",
  startupCommand: `${bunCommand} ${opencodeArgs.join(" ")}`,
  providerId: "opencode",
  cliKind: "custom",
  promptCommand: {
    id: "run-json",
    label: "Run JSON",
    command: bunCommand,
    args: [...opencodeArgs, "run", "--format", "json", "--model", "{{model}}"],
    outputStyle: "json",
    consumesTokens: true,
  },
  fields: [
    { key: "usage source", value: "~/.local/share/opencode/opencode*.db" },
    { key: "today", value: "not reported" },
    { key: "month", value: "not reported" },
    { key: "active sessions", value: "not reported" },
    { key: "editable", value: "system prompt, model, context, iterations" },
  ],
  commands: [
    { id: "version", label: "Version", command: bunCommand, args: [...opencodeArgs, "--version"], outputStyle: "text", consumesTokens: false },
    { id: "help", label: "Help", command: bunCommand, args: [...opencodeArgs, "--help"], outputStyle: "text", consumesTokens: false },
  ],
  models: [
    {
      id: "workflow-selected",
      name: "workflow selected",
      statusLabel: "runtime-bound",
      fields: [
        { key: "source", value: "Workflow node LLM API/model" },
        { key: "context", value: "selected LLM API template" },
        { key: "quota", value: "local DB/token-monitor style estimate" },
      ],
    },
  ],
  capabilities: opencodeCliCapabilities,
})
