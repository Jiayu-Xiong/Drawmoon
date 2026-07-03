import { opencodeCustomTemplate } from "./opencode-custom-template"

/** Generic academic-paper roles — per-workflow detail lives in node prompts + runtimeOverrides. */

export const opencodePaperPlannerTemplate = opencodeCustomTemplate({
  id: "opencode-paper-planner",
  name: "Paper Planner",
  description: "Conference/journal planning: structure, revision plans, review synthesis. Node prompt defines venue and paths.",
  mode: "plan",
  inheritsFromAgentModeId: "opencode-plan",
  contextMode: "fresh",
  defaultSystemPromptFile: "agents/paper-default.md",
  defaultSystemPrompt: "Plan manuscript structure and edits from the node objective. Read only paths named in the user prompt.",
  allowedTools: ["read_file", "write_file", "edit_file", "glob", "list", "grep", "webfetch", "artifact_link"],
  outputKinds: ["markdown", "json"],
  maxIterations: 12,
})

export const opencodePaperSectionTemplate = opencodeCustomTemplate({
  id: "opencode-paper-section",
  name: "Paper Section Writer",
  description: "Isolated section drafting (LaTeX). Use readRunFiles / contextFiles overrides per node.",
  mode: "build",
  inheritsFromAgentModeId: "opencode-build",
  contextMode: "fresh",
  defaultSystemPromptFile: "agents/paper-default.md",
  defaultSystemPrompt: "Draft LaTeX section fragments per the node prompt. Do not replan the whole paper.",
  allowedTools: ["read_file", "write_file", "edit_file", "latex_patch", "glob", "list", "grep", "artifact_link"],
  outputKinds: ["latex", "markdown"],
  maxIterations: 20,
})

export const opencodePaperCompileTemplate = opencodeCustomTemplate({
  id: "opencode-paper-compile",
  name: "Paper Compile & Audit",
  description: "Merge sections, compile PDF, layout/length audits. Paths come from the node prompt.",
  mode: "build",
  inheritsFromAgentModeId: "opencode-build",
  contextMode: "fresh",
  defaultSystemPromptFile: "agents/layout-auditor.md",
  defaultSystemPrompt: "Build or audit the manuscript PDF under paths given in the node prompt.",
  allowedTools: ["latex_build", "pdf_audit", "read_file", "write_file", "edit_file", "artifact_link"],
  outputKinds: ["pdf", "markdown"],
  maxIterations: 8,
  timeoutMs: 600_000,
  allowFileWrites: true,
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
})

export const opencodePaperReviewerTemplate = opencodeCustomTemplate({
  id: "opencode-paper-reviewer",
  name: "Paper Peer Reviewer",
  description: "Independent review from manuscript PDF (or paths in node prompt). No default tex glob injection.",
  mode: "review",
  inheritsFromAgentModeId: "opencode-build",
  contextMode: "fresh",
  defaultSystemPromptFile: "agents/objective-reviewer.md",
  defaultSystemPrompt: "Review the manuscript objectively. Follow the node prompt for input paths and output file.",
  allowedTools: ["read_file", "review_json", "artifact_link"],
  outputKinds: ["markdown", "json"],
  maxIterations: 6,
  timeoutMs: 420_000,
  allowFileWrites: false,
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
})
