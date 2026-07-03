import { opencodeCustomTemplate } from "./opencode-custom-template"
import {
  ISOLATION_PROBE_AGENT_SYSTEM,
  ISOLATION_PROBE_SECRETS,
} from "@opencode-ai/backend-opencode/drawmoon/isolation-smoke-probes"

function isolationMode(
  id: "opencode-chat-isolation-alpha" | "opencode-chat-isolation-beta",
  name: string,
  skillId: string,
  mcpId: string,
  side: keyof typeof ISOLATION_PROBE_SECRETS,
) {
  const secrets = ISOLATION_PROBE_SECRETS[side]
  return opencodeCustomTemplate({
    id,
    name,
    description: `OpenCode chat bound to ${skillId} + ${mcpId}. Expect SKILL=${secrets.skillReplyToken} MCP=${secrets.mcpReplyToken} from loaded entities only.`,
    mode: "chat",
    inheritsFromAgentModeId: "opencode-chat",
    contextMode: "fresh",
    defaultSystemPromptFile: `opencode://${id}`,
    defaultSystemPrompt: ISOLATION_PROBE_AGENT_SYSTEM,
    allowedTools: ["read_file", "artifact_link", "skill"],
    constraints: {
      forcedSkills: [skillId],
      forcedMcpServers: [mcpId],
    },
    outputKinds: ["markdown"],
    maxIterations: 4,
    timeoutMs: 180_000,
    allowFileWrites: false,
    fieldPolicy: {
      model: "inherited",
      defaultSystemPrompt: "editable",
      contextMode: "readonly",
      maxIterations: "readonly",
      timeoutMs: "editable",
      allowFileWrites: "readonly",
    },
  })
}

export const opencodeChatIsolationAlphaTemplate = isolationMode(
  "opencode-chat-isolation-alpha",
  "OpenCode Isolation Alpha",
  "skill-alpha",
  "mcp-alpha",
  "alpha",
)

export const opencodeChatIsolationBetaTemplate = isolationMode(
  "opencode-chat-isolation-beta",
  "OpenCode Isolation Beta",
  "skill-beta",
  "mcp-beta",
  "beta",
)
