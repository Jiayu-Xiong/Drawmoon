import type { WorkflowEdge } from "@opencode-ai/backend-opencode/schema/types"
import { WorkflowTemplateBase, type TemplateStep } from "../workflow-template"

import { defaultWorkflowCwd } from "../../lib/repo-paths"

const CWD = defaultWorkflowCwd()

const steps: TemplateStep[] = [
  {
    id: "brief",
    label: "Brief",
    meaning: "Normalize the user request before any worker starts.",
    provider: "opencode",
    mode: "chat",
    contextMode: "fresh",
    transport: "belt",
    prompt: "Read the user goal and produce a compact execution brief.",
    promptFile: "prompts/brief.md",
    subagentFiles: [],
    cacheFiles: ["xy/STYLES_FRONTEND_REFERENCE.md"],
    x: 140,
    y: 170,
    status: "success",
    duration: "1.1s",
    maxIterations: 1,
    allowFileWrites: false,
  },
  {
    id: "planner",
    label: "Planner",
    meaning: "Choose planner, subagent files and downstream context shape.",
    provider: "opencode",
    mode: "plan",
    contextMode: "summary",
    transport: "tube",
    prompt: "Plan the workflow, choose files, prompts, recursion limits, planner and subagent shape.",
    promptFile: "prompts/planner.md",
    plannerFile: "agents/opencode-planner.md",
    subagentFiles: ["agents/opencode-frontend.md", "agents/opencode-runtime.md"],
    cacheFiles: ["backend/opencode/src/**/*.ts"],
    x: 430,
    y: 300,
    status: "cached",
    duration: "0.2s",
  },
  {
    id: "builder",
    label: "Builder",
    meaning: "Edit or build files with the local CLI agent.",
    provider: "opencode",
    mode: "build",
    contextMode: "fork",
    transport: "belt",
    prompt: "Implement the selected workflow node changes with local CLI build mode.",
    promptFile: "prompts/build.md",
    plannerFile: "agents/opencode-planner.md",
    subagentFiles: ["agents/opencode-frontend-worker.md", "agents/opencode-api-worker.md"],
    cacheFiles: ["xy/custom/workflow-frontend/src/**/*"],
    x: 720,
    y: 170,
    status: "running",
    duration: "2m 18s",
  },
  {
    id: "review",
    label: "Review",
    meaning: "Check results, traces, cache hits and artifacts before handoff.",
    provider: "opencode",
    mode: "review",
    contextMode: "summary",
    transport: "exit",
    prompt: "Review output, cache hits, trace and changed files before handoff.",
    promptFile: "prompts/review.md",
    subagentFiles: ["agents/opencode-reviewer.md"],
    cacheFiles: ["xy/custom/workflow-frontend/src/**/*", "xy/FRONTEND_API_SURFACE.md"],
    x: 1010,
    y: 300,
    status: "waiting",
    duration: "-",
    maxIterations: 2,
    allowFileWrites: false,
  },
]

const edges: WorkflowEdge[] = [
  { from: "brief", to: "planner", contextMode: "inherit" },
  { from: "planner", to: "builder", contextMode: "fork" },
  { from: "builder", to: "review", contextMode: "summary" },
]

export class LocalCliAgentBuildTemplate extends WorkflowTemplateBase {
  constructor() {
    super({
      id: "local-cli-agent-build",
      name: "Local CLI Agent Build",
      description: "Debug template for running workflow nodes through local CLI providers.",
      cwd: CWD,
      cacheMode: "input-only + cacheFiles",
      defaultSubagent: {
        provider: "opencode",
        mode: "agent",
        contextMode: "fresh",
        maxIterations: 25,
        allowFileWrites: true,
        systemPromptFile: "agents/opencode-default.md",
        contextFiles: ["README.md", "xy/STYLES_FRONTEND_REFERENCE.md"],
      },
      steps,
      edges,
    })
  }
}

export const localCliAgentBuildTemplate = new LocalCliAgentBuildTemplate()

