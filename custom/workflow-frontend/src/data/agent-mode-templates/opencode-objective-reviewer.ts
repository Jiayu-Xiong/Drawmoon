import { opencodeCustomTemplate } from "./opencode-custom-template"

export const opencodeObjectiveReviewerTemplate = opencodeCustomTemplate({
  id: "opencode-objective-reviewer",
  name: "Objective Reviewer",
  description: "Independent review mode for novelty, method, evidence, clarity and limitations checks.",
  mode: "review",
  inheritsFromAgentModeId: "opencode-build",
  contextMode: "fresh",
  defaultSystemPromptFile: "agents/objective-reviewer.md",
  defaultSystemPrompt: "Review the manuscript objectively.",
  allowedTools: ["read_file", "review_json", "artifact_link"],
  outputKinds: ["json", "markdown"],
  maxIterations: 8,
  timeoutMs: 420_000,
  allowFileWrites: false,
  cacheFiles: ["reviews/**/*.json"],
  contextFiles: ["paper/**/*.tex", "figures/prompts/**/*.md"],
  retryPolicy: { attempts: 1, backoffMs: 0, continueOnPartialFailure: true },
})
