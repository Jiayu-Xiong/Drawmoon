import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { WorkflowNode } from "../schema/types.js"
import type { WorkflowNodeContextMeta } from "./context/types.js"

export interface PlannerInquiryConfig {
  questionsFile: string
  replyFile: string
}

type PlannerInquiryMeta = WorkflowNodeContextMeta & {
  plannerInquiry?: boolean
  inquiryQuestionsFile?: string
  inquiryReplyFile?: string
}

export interface PlannerInquiryState {
  runId: string
  status: "pending" | "answered"
  questionsFile: string
  replyFile: string
  pausedAt?: string
  answeredAt?: string
}

const STATE_REL = ".workflow/planner-inquiry-state.json"
const INQUIRY_MTIME_TOLERANCE_MS = 2_000

/** Read planner-inquiry settings from graph node metadata (UI template → runtime graph). */
export function readNodeContextMeta(node: WorkflowNode): PlannerInquiryMeta {
  const fromMetadata = (node.metadata ?? {}) as PlannerInquiryMeta
  const legacy = node as WorkflowNode & { runtimeOverrides?: PlannerInquiryMeta }
  return { ...legacy.runtimeOverrides, ...fromMetadata }
}

export function readPlannerInquiry(node: WorkflowNode): PlannerInquiryConfig | null {
  const meta = readNodeContextMeta(node)
  if (!meta.plannerInquiry) return null
  return {
    questionsFile: meta.inquiryQuestionsFile?.trim() || "planner-inquiry-questions.md",
    replyFile: meta.inquiryReplyFile?.trim() || "planner-inquiry-reply.md",
  }
}

export function plannerInquiryStatePath(workspaceDir: string): string {
  return join(workspaceDir, STATE_REL)
}

export function readPlannerInquiryState(workspaceDir: string): PlannerInquiryState | null {
  const path = plannerInquiryStatePath(workspaceDir)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PlannerInquiryState
  } catch {
    return null
  }
}

export function writePlannerInquiryPending(
  workspaceDir: string,
  runId: string,
  inquiry: PlannerInquiryConfig,
): void {
  mkdirSync(join(workspaceDir, ".workflow"), { recursive: true })
  const state: PlannerInquiryState = {
    runId,
    status: "pending",
    questionsFile: inquiry.questionsFile,
    replyFile: inquiry.replyFile,
    pausedAt: new Date().toISOString(),
  }
  writeFileSync(plannerInquiryStatePath(workspaceDir), JSON.stringify(state, null, 2), "utf-8")
}

export function writePlannerInquiryAnswered(
  workspaceDir: string,
  runId: string,
  inquiry: PlannerInquiryConfig,
): void {
  mkdirSync(join(workspaceDir, ".workflow"), { recursive: true })
  const prev = readPlannerInquiryState(workspaceDir)
  const state: PlannerInquiryState = {
    runId,
    status: "answered",
    questionsFile: inquiry.questionsFile,
    replyFile: inquiry.replyFile,
    pausedAt: prev?.pausedAt,
    answeredAt: new Date().toISOString(),
  }
  writeFileSync(plannerInquiryStatePath(workspaceDir), JSON.stringify(state, null, 2), "utf-8")
}

export function isPlannerInquiryReplyAuthorized(
  workspaceDir: string,
  runId: string,
  inquiry: PlannerInquiryConfig,
): boolean {
  const state = readPlannerInquiryState(workspaceDir)
  if (!state || state.runId !== runId || state.status !== "answered") return false
  return existsSync(join(workspaceDir, inquiry.replyFile))
}

/** Before planner runs: drop unauthorized reply files that would skip the inquiry gate. */
export function preparePlannerInquiryNodeRun(
  workspaceDir: string,
  runId: string,
  node: WorkflowNode,
): void {
  const inquiry = readPlannerInquiry(node)
  if (!inquiry) return
  if (isPlannerInquiryReplyAuthorized(workspaceDir, runId, inquiry)) return
  const replyPath = join(workspaceDir, inquiry.replyFile)
  if (existsSync(replyPath)) rmSync(replyPath)
  const state = readPlannerInquiryState(workspaceDir)
  if (state && (state.runId !== runId || state.status === "answered")) {
    rmSync(plannerInquiryStatePath(workspaceDir), { force: true })
  }
}

export function questionsWrittenThisRun(questionsPath: string, nodeStartMs: number): boolean {
  try {
    return existsSync(questionsPath)
      && readFileSync(questionsPath, "utf-8").trim().length > 0
      && statSync(questionsPath).mtimeMs >= nodeStartMs - INQUIRY_MTIME_TOLERANCE_MS
  } catch {
    return false
  }
}

export function plannerInquiryPhase(
  workspaceDir: string,
  inquiry: PlannerInquiryConfig,
  runId: string,
): "phase1" | "phase2" {
  if (isPlannerInquiryReplyAuthorized(workspaceDir, runId, inquiry)) return "phase2"
  return "phase1"
}
