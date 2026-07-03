import { opencodeCustomTemplate } from "./opencode-custom-template"

export const opencodePaperWriterTemplate = opencodeCustomTemplate({
  id: "opencode-paper-writer",
  name: "Paper Writer",
  description: "LaTeX manuscript drafting mode based on the opencode build agent with paper-writing context.",
  mode: "build",
  inheritsFromAgentModeId: "opencode-build",
  contextMode: "fork",
  defaultSystemPromptFile: "agents/paper-default.md",
  defaultSystemPrompt: "Draft and patch LaTeX manuscript content objectively.",
  defaultUserPromptBias: "Prefer concise journal prose and explicit uncertainty over inflated claims.",
  allowedTools: ["read_file", "write_file", "edit_file", "latex_patch", "glob", "list", "grep", "artifact_link"],
  outputKinds: ["latex", "markdown", "json"],
  cacheFiles: ["paper/**/*.tex", "paper/**/*.bib"],
  contextFiles: ["inputs/idea.md", "analysis/requirements.md", "paper/main.tex"],
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: false },
})
