import type { WorkflowRunSummary, WorkflowTemplateBase } from "./workflow-template"

export type {
  StepStatus,
  StepTransport,
  TemplateDefaults,
  TemplateStep,
  WorkflowRunSummary,
  WorkflowTemplateData,
} from "./workflow-template"
export { WorkflowTemplateBase } from "./workflow-template"

/** Repo smoke starters are not registered in the UI — workflows load from ~/.drawmoon only. */
export const workflowTemplates: WorkflowTemplateBase[] = []

export const staticRuns: WorkflowRunSummary[] = [
  {
    id: "run-paper-demo-001",
    templateId: "paper-journal-default",
    title: "Paper journal pipeline",
    status: "success",
    startedAt: "2026-06-07 10:15",
    duration: "14s",
    cacheHits: 0,
    currentStepId: "intake",
  },
]

export const defaultRun = staticRuns[0]!
