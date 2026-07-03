import {
  cancelWorkflowRun,
  continueWorkflowRun,
  interruptWorkflowRun,
  pauseWorkflowRun,
  retryWorkflowNode,
  type WorkflowRunRecord,
} from "../../api"
import { mergeCachedRunDetail } from "../../runtime-bridge/workflow-run-store"
import { getWorkflowEntityInstance } from "./index"

export class WorkflowEntityRunControls {
  constructor(readonly runId: string) {}

  static for(runId: string) {
    return new WorkflowEntityRunControls(runId)
  }

  static fromInstance(id: string) {
    const instance = getWorkflowEntityInstance(id)
    if (!instance) return null
    return new WorkflowEntityRunControls(instance.id)
  }

  private apply(run: WorkflowRunRecord) {
    mergeCachedRunDetail(this.runId, run)
    return run
  }

  async pauseGraceful() {
    return this.apply(await pauseWorkflowRun(this.runId))
  }

  async interruptHard() {
    return this.apply(await interruptWorkflowRun(this.runId))
  }

  async cancel() {
    return this.apply(await cancelWorkflowRun(this.runId))
  }

  async retryNode(nodeId: string) {
    return this.apply(await retryWorkflowNode(this.runId, nodeId))
  }

  async continue(options?: { inquiryReply?: string }) {
    return this.apply(await continueWorkflowRun(this.runId, options))
  }
}

export function workflowEntityRunControls(runId: string) {
  return WorkflowEntityRunControls.for(runId)
}
