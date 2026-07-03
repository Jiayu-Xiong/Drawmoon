import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { AgentNodeConfig, WorkflowGraph, WorkflowNode } from "../../schema/types.js"
import type { Blackboard } from "./blackboard.js"
import { planNodeDelivery } from "./delivery/strategies.js"
import { resolveTransportMode } from "./transport.js"
import { ensureWriteCapability, readNodeArchetype } from "./write-capability.js"
import {
  FLAT_WRITE_PROMPT_RULE,
  IO_COLLAB_PLANNER_PROMPT_RULE,
  buildPlannerInquiryPhase1Rule,
  buildPlannerInquiryPhase2Rule,
  buildPlannerProducerAllowlist,
} from "../planner/io-strategy.js"
import { plannerInquiryPhase, readPlannerInquiry } from "../planner-inquiry.js"

export function enrichNodeWithContext(
  node: WorkflowNode,
  config: AgentNodeConfig,
  outputDir: string,
  blackboard: Blackboard,
  graph?: WorkflowGraph,
  upstreamSession?: import("../../schema/types.js").SessionState,
  runId?: string,
): AgentNodeConfig {
  const archetype = readNodeArchetype(node)
  let next = ensureWriteCapability({ ...config, cwd: outputDir }, archetype)
  if (archetype === "planner") {
    const allowlist = graph ? `\n\n${buildPlannerProducerAllowlist(graph, node.id)}` : ""
    next = { ...next, prompt: `${next.prompt}\n\n${IO_COLLAB_PLANNER_PROMPT_RULE}${allowlist}` }
    const inquiry = readPlannerInquiry(node)
    if (inquiry && runId) {
      const phase = plannerInquiryPhase(outputDir, inquiry, runId)
      if (phase === "phase2") {
        const reply = readFileSync(join(outputDir, inquiry.replyFile), "utf-8").trim()
        next = {
          ...next,
          prompt: `${next.prompt}\n\n${buildPlannerInquiryPhase2Rule(inquiry.questionsFile)}\n\n--- AUTHOR INQUIRY REPLY ---\n${reply}`,
        }
      } else {
        next = {
          ...next,
          prompt: `${next.prompt}\n\n${buildPlannerInquiryPhase1Rule(inquiry.questionsFile, inquiry.replyFile)}`,
        }
      }
    }
  }
  if (archetype === "worker" || next.flatWriteOnly) {
    next = { ...next, flatWriteOnly: true, prompt: `${next.prompt}\n\n${FLAT_WRITE_PROMPT_RULE}` }
  }

  const isLlmApiMedia = Boolean(next.llmApi?.endpoint) && (next.modality === "image" || next.modality === "audio")
  if (!isLlmApiMedia) {
    const delivery = planNodeDelivery(outputDir, node, next, blackboard)
    if (delivery.promptSuffix) {
      next = { ...next, prompt: `${next.prompt}${delivery.promptSuffix}` }
    }
    if (delivery.attachments.length) {
      next = { ...next, inputAttachments: delivery.attachments }
    }
  }

  if (graph) {
    const t = resolveTransportMode(node, next, graph, upstreamSession)
    if (t.edgeContextMode) next = { ...next, contextMode: t.edgeContextMode }
    if (t.skipUpstream) next = { ...next, contextMode: t.edgeContextMode }
  }
  return next
}
