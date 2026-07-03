/**
 * Isolation smoke probe secrets.
 * These tokens must ONLY appear in skill files / MCP tool responses — never in prompts.
 */
export const ISOLATION_PROBE_SECRETS = {
  alpha: {
    skillReplyToken: "SK_ALPHA_Q7m2K9",
    mcpReplyToken: "MCP_ALPHA_w2p5",
    mcpTool: "alpha_isolation_probe",
  },
  beta: {
    skillReplyToken: "SK_BETA_R4n8",
    mcpReplyToken: "MCP_BETA_z8k1",
    mcpTool: "beta_isolation_probe",
  },
} as const

export type IsolationProbeSide = keyof typeof ISOLATION_PROBE_SECRETS

/** Node prompt — deliberately contains NO answer tokens. */
export const ISOLATION_PROBE_NODE_PROMPT = [
  "Isolation probe. The prompt does NOT contain answer tokens.",
  "1) Use the skill tool to load the only skill available to this node and read its body.",
  "2) Call the only MCP probe tool once and read its return value.",
  "3) Reply exactly one line: SKILL=<token from skill body> MCP=<token from MCP tool>",
  "If skill or MCP is unavailable, reply: MISSING",
  "Do not guess or invent tokens.",
].join(" ")

export const ISOLATION_PROBE_AGENT_SYSTEM = [
  "Follow the node objective. Answer tokens exist only inside the loaded skill file and MCP tool output.",
  "Never copy tokens from the user prompt — it has none.",
].join(" ")

export function foreignSecrets(side: IsolationProbeSide) {
  const other = side === "alpha" ? "beta" : "alpha"
  const mine = ISOLATION_PROBE_SECRETS[side]
  const theirs = ISOLATION_PROBE_SECRETS[other]
  return {
    foreignSkillToken: theirs.skillReplyToken,
    foreignMcpToken: theirs.mcpReplyToken,
  }
}

export function evaluateIsolationOutput(side: IsolationProbeSide, text: string) {
  const mine = ISOLATION_PROBE_SECRETS[side]
  const foreign = foreignSecrets(side)
  const normalized = text.trim()
  return {
    hasOwnSkillToken: normalized.includes(mine.skillReplyToken),
    hasOwnMcpToken: normalized.includes(mine.mcpReplyToken),
    lacksForeignSkill: !normalized.includes(foreign.foreignSkillToken),
    lacksForeignMcp: !normalized.includes(foreign.foreignMcpToken),
    text: normalized.slice(0, 240),
  }
}
