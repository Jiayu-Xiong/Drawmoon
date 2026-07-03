import { opencodeCustomTemplate } from "./opencode-custom-template"

export const opencodeLayoutAuditorTemplate = opencodeCustomTemplate({
  id: "opencode-layout-auditor",
  name: "Layout Auditor",
  description: "Build and inspect generated PDF artifacts.",
  mode: "build",
  inheritsFromAgentModeId: "opencode-build",
  contextMode: "artifacts",
  defaultSystemPromptFile: "agents/layout-auditor.md",
  defaultSystemPrompt: "Build the LaTeX PDF and report layout defects.",
  allowedTools: ["latex_build", "pdf_audit", "read_file", "write_file", "edit_file", "artifact_link"],
  outputKinds: ["pdf", "json"],
  maxIterations: 6,
  timeoutMs: 600_000,
  cacheFiles: ["build/**/*.pdf", "build/**/*.log"],
  contextFiles: ["paper/main.tex", "paper/**/*.tex", "figures/**/*"],
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
})
