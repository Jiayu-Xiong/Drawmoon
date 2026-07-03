import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type { WorkflowGraph, WorkflowNode } from "../../schema/types.js"
import type { Blackboard } from "../context/blackboard.js"
import {
  blockingMissing,
  readNodeArchetype,
  reconcileNodeOutputs,
  validateDeclaredOutputs,
} from "../context/index.js"
import {
  ensurePlanFolders,
  migrateProducerOutputs,
  parseAllocationPlan,
  readAllocationPlanEntity,
  validateAllocationPlan,
  writeAllocationPlanEntity,
} from "../allocator/index.js"
import {
  parsePlannerManifest,
  transportArtifactsFromManifest,
  writePlannerManifestEntity,
} from "../artifact-transport.js"
import {
  isPlannerInquiryReplyAuthorized,
  questionsWrittenThisRun,
  readPlannerInquiry,
  writePlannerInquiryPending,
} from "../planner-inquiry.js"

export interface PostNodeCompleteInput {
  workspaceDir: string
  node: WorkflowNode
  graph: WorkflowGraph
  blackboard: Blackboard
  nodeStartMs: number
  cleanedText: string
  runId: string
}

export interface PostNodeCompleteResult {
  repairMsg?: string
  inquiryPause?: boolean
  inquiryQuestionsText?: string
  inquiryQuestionsFile?: string
  warnings: string[]
}

function isPlannerNode(node: WorkflowNode): boolean {
  return readNodeArchetype(node) === "planner"
}

function handlePlannerAllocation(
  workspaceDir: string,
  node: WorkflowNode,
  graph: WorkflowGraph,
  blackboard: Blackboard,
  cleanedText: string,
  nodeStartMs: number,
  runId: string,
  warnings: string[],
): PostNodeCompleteResult | null {
  const inquiry = readPlannerInquiry(node)
  const inquiryAuthorized = inquiry
    ? isPlannerInquiryReplyAuthorized(workspaceDir, runId, inquiry)
    : false

  if (inquiry && !inquiryAuthorized) {
    const questionsPath = join(workspaceDir, inquiry.questionsFile)
    if (questionsWrittenThisRun(questionsPath, nodeStartMs)) {
      const inquiryQuestionsText = readFileSync(questionsPath, "utf-8").trim()
      if (inquiryQuestionsText) {
        writePlannerInquiryPending(workspaceDir, runId, inquiry)
        return {
          inquiryPause: true,
          inquiryQuestionsText,
          inquiryQuestionsFile: inquiry.questionsFile,
          warnings,
        }
      }
      warnings.push(`planner inquiry: ${inquiry.questionsFile} is empty`)
    } else if (existsSync(questionsPath)) {
      warnings.push(`planner inquiry: ignoring stale ${inquiry.questionsFile} from a prior run`)
    }

    const prematurePlan = parseAllocationPlan(cleanedText)
    if (prematurePlan?.files.length) {
      return {
        repairMsg: `needs-repair: ${node.id} author inquiry pending — write ${inquiry.questionsFile} only (no IO JSON until the author confirms in the UI)`,
        warnings,
      }
    }
  }

  const plan = parseAllocationPlan(cleanedText)
  if (plan?.files.length) {
    if (inquiry && !inquiryAuthorized) {
      return {
        repairMsg: `needs-repair: ${node.id} author inquiry pending — IO allocation JSON requires an authorized author reply from the UI`,
        warnings,
      }
    }
    const validation = validateAllocationPlan(plan, graph)
    if (!validation.ok) {
      return {
        repairMsg: `needs-repair: ${node.id} invalid allocation plan: ${validation.errors.join("; ")}`,
        warnings,
      }
    }
    const normalized = { ...plan, folders: validation.effectiveFolders }
    writeAllocationPlanEntity(workspaceDir, normalized)
    ensurePlanFolders(workspaceDir, validation.effectiveFolders)
    blackboard.put({
      key: "allocation-plan",
      path: ".workflow/allocation-plan.json",
      producerNodeId: node.id,
      reconciled: false,
    })
    return null
  }

  const manifest = parsePlannerManifest(cleanedText)
  if (manifest?.files.length) {
    writePlannerManifestEntity(workspaceDir, manifest)
    warnings.push("planner used legacy manifest format; prefer IO collaboration allocation plan JSON")
    return null
  }

  if (inquiry && !inquiryAuthorized) {
    return {
      repairMsg: `needs-repair: ${node.id} missing ${inquiry.questionsFile} — planner inquiry must pause for author reply before IO allocation`,
      warnings,
    }
  }

  return {
    repairMsg: `needs-repair: ${node.id} missing valid IO collaboration allocation plan JSON`,
    warnings,
  }
}

export function handlePostNodeComplete(input: PostNodeCompleteInput): PostNodeCompleteResult {
  const { workspaceDir, node, graph, blackboard, nodeStartMs, cleanedText, runId } = input
  const warnings: string[] = []

  const reconcile = reconcileNodeOutputs(workspaceDir, node, blackboard, nodeStartMs, cleanedText)
  warnings.push(...reconcile.warnings)

  const blocking = blockingMissing(graph, node.id, reconcile.missing)
  if (blocking.length) {
    return {
      repairMsg: `needs-repair: ${node.id} missing ${blocking.map((b) => b.path).join(", ")}`,
      warnings,
    }
  }

  if (isPlannerNode(node)) {
    const plannerResult = handlePlannerAllocation(workspaceDir, node, graph, blackboard, cleanedText, nodeStartMs, runId, warnings)
    if (plannerResult?.repairMsg || plannerResult?.inquiryPause) return plannerResult

    const manifest = parsePlannerManifest(cleanedText)
    if (manifest?.files.length) {
      const transport = transportArtifactsFromManifest(workspaceDir, manifest, nodeStartMs)
      warnings.push(...transport.moved.map((m) => `transport: ${m}`))
      warnings.push(...transport.warnings)
    }
  }

  const declaredError = validateDeclaredOutputs(workspaceDir, node, cleanedText)
  if (declaredError) {
    return { repairMsg: `needs-repair: ${declaredError}`, warnings }
  }

  const plan = readAllocationPlanEntity(workspaceDir)
  if (plan && !isPlannerNode(node)) {
    const migration = migrateProducerOutputs(workspaceDir, plan, node.id, cleanedText)
    warnings.push(...migration.moved.map((m) => `migrate: ${m}`))
    warnings.push(...migration.warnings)
    const criticalMissing = migration.missing.filter(
      (m) => plan.files.find((f) => f.dest === m.dest)?.criticality !== "optional",
    )
    if (criticalMissing.length) {
      return {
        repairMsg: `needs-repair: ${node.id} allocation missing ${criticalMissing.map((m) => m.dest).join(", ")}`,
        warnings,
      }
    }
    for (const entry of plan.files.filter((f) => f.producer === node.id)) {
      blackboard.put({
        key: entry.dest,
        path: entry.dest.replace(/\\/g, "/"),
        producerNodeId: node.id,
        reconciled: true,
      })
    }
  }

  return { warnings }
}
