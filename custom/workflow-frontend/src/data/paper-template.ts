import type { WorkflowRunSummary, WorkflowTemplate } from "./console-model"

/** Demo metadata only; journal-paper-default UI template loads from ~/.drawmoon/templates/workflows/. */
export const mockWorkflowTemplates: WorkflowTemplate[] = []

export const staticRuns: WorkflowRunSummary[] = [
  {
    id: "run-isolation-smoke-001",
    templateId: "opencode-tool-isolation-smoke",
    title: "OpenCode tool isolation smoke",
    status: "success",
    startedAt: "2026-06-25 00:48",
    duration: "22s",
    cacheHits: 0,
    currentStepId: "node-beta",
  },
]
