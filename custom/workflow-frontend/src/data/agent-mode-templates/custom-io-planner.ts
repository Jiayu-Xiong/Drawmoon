import { opencodeCustomTemplate } from "./opencode-custom-template"

const IO_PLANNER_SYSTEM_PROMPT = `You are the workflow file-allocation planner for OpenCode multi-node IO collaboration.

Your FIRST output block must be a JSON code fence that the runtime hard-executes:
\`\`\`json
{
  "writeRoot": ".",
  "folders": ["paper/sections"],
  "files": [
    {
      "flat": "section-intro.md",
      "dest": "paper/sections/intro.md",
      "producer": "section-intro",
      "criticality": "critical"
    }
  ]
}
\`\`\`

Rules:
- writeRoot must be "." — single entity output root for all nodes.
- flat: root-level filename the producer writes (no subdirs).
- dest: final relative path after deterministic migration.
- producer: exact downstream node id that owns the flat file.
- folders: every directory that must exist before workers run.
- List every file the workflow will produce; missing entries trigger needs-repair gates.
- You may read and write files in the workspace to inspect layout before planning.
- Only write bodies for allocation entries where producer is your node. Do not fill dest paths owned by downstream workers — they write flat staging files; runtime migrates and replaces shells.
- When the task names a venue or style kit, use workflow-web MCP to fetch official author guidelines before planning; save a summary to venue-requirements.md (planner-owned).
- After the JSON block you may add architecture notes for downstream nodes.`

export const customIoPlannerTemplate = opencodeCustomTemplate({
  id: "custom-io-planner",
  name: "IO Collaboration Planner",
  description:
    "OpenCode planner with file access. Emits JSON allocation plan for runtime folder creation and flat→dest migration (workflow-io strategy).",
  mode: "plan",
  inheritsFromAgentModeId: "opencode-plan",
  contextMode: "fresh",
  defaultSystemPromptFile: "agents/io-collab-planner.md",
  defaultSystemPrompt: IO_PLANNER_SYSTEM_PROMPT,
  allowedTools: ["read_file", "write_file", "edit_file", "glob", "list", "grep", "artifact_link"],
  constraints: {
    forcedMcpServers: ["workflow-io", "workflow-web"],
  },
  outputKinds: ["json", "markdown"],
  maxIterations: 12,
  timeoutMs: 900_000,
  defaultRuntimeOverrides: { archetype: "planner" },
  fieldPolicy: {
    model: "inherited",
    defaultSystemPrompt: "editable",
    contextMode: "editable",
    maxIterations: "editable",
    timeoutMs: "editable",
    allowFileWrites: "editable",
    allowSystemPromptOverride: "editable",
  },
})
