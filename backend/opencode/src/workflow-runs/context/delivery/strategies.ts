import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { NodeInputAttachment } from "../../../schema/types.js"
import { readWorkspaceFile, sliceText } from "../resolver.js"
import type { Blackboard } from "../blackboard.js"
import type { WorkflowNode } from "../../../schema/types.js"
import type { NodeContractInput, WorkflowNodeContextMeta } from "../types.js"
import { mergeContract } from "../archetypes.js"
import { resolveWorkspaceFile } from "../resolver.js"
import {
  createInputDescriptor,
  describeInputDescriptor,
  isBinaryLikeDescriptor,
  isTextLikeDescriptor,
  type InputDescriptor,
} from "./input-descriptor.js"
import {
  providerSupportsInputKind,
  resolveDelegateCapability,
  type DelegateCapability,
} from "./delegate-capability.js"
import type { AgentNodeConfig } from "../../../schema/types.js"

const INLINE_TEXT_MAX = 400
const SUMMARY_ONE_LINE_MAX = 120

export interface DeliveryResult {
  promptLine?: string
  attachment?: NodeInputAttachment
  warning?: string
}

export interface DeliveryPlan {
  promptSuffix: string
  attachments: NodeInputAttachment[]
  warnings: string[]
}

export interface DeliveryStrategyContext {
  workspaceDir: string
  blackboard: Blackboard
  config: AgentNodeConfig
}

export interface DeliveryStrategy {
  id: string
  supports(desc: InputDescriptor, caps: DelegateCapability): boolean
  render(desc: InputDescriptor, caps: DelegateCapability, ctx: DeliveryStrategyContext): DeliveryResult
}

function resolveInputKey(from: string): string {
  if (from.includes(":")) return from.split(":")[1] ?? from
  return from
}

function readTextHead(workspaceDir: string, path: string, maxBytes = 2048): string | null {
  try {
    const abs = join(workspaceDir, path.replace(/^\/+/, "").replace(/\\/g, "/"))
    const buf = readFileSync(abs)
    return buf.subarray(0, maxBytes).toString("utf-8").trim() || null
  } catch {
    return null
  }
}

function oneLineFromText(text: string | null, max = SUMMARY_ONE_LINE_MAX): string {
  if (!text) return "(missing)"
  const line = text.split("\n").find((l) => {
    const t = l.trim()
    return t && !t.startsWith("#") && !t.startsWith("---")
  })
  return (line ?? text).trim().slice(0, max)
}

export const PathReferenceDelivery: DeliveryStrategy = {
  id: "path-reference",
  supports(desc, caps) {
    if (isBinaryLikeDescriptor(desc)) return caps.modalities.filesByPath
    return caps.modalities.filesByPath || caps.modalities.attachmentChannel === "none"
  },
  render(desc) {
    return {
      promptLine: describeInputDescriptor(desc),
      attachment: { kind: "path", key: desc.key, path: desc.path, mimeType: desc.mime },
    }
  },
}

export const InlineTextDelivery: DeliveryStrategy = {
  id: "inline-text",
  supports(desc, caps) {
    if (!isTextLikeDescriptor(desc)) return false
    if (desc.mode !== "inline" && desc.mode !== "summary") return false
    return caps.modalities.filesByPath || caps.modalities.attachmentChannel === "base64"
  },
  render(desc, _caps, ctx) {
    const resolved = resolveWorkspaceFile(ctx.workspaceDir, desc.path, ctx.blackboard)
    const raw = readWorkspaceFile(ctx.workspaceDir, resolved)
    const sliced = raw ? sliceText(raw, desc.slice) : null
    if (desc.mode === "summary") {
      const summary = oneLineFromText(sliced)
      return {
        promptLine: `Input [${desc.key}]: ${desc.path} — ${summary}`,
      }
    }
    const inline = (sliced ?? "").slice(0, INLINE_TEXT_MAX)
    if (!inline) {
      return { promptLine: describeInputDescriptor(desc) }
    }
    return {
      promptLine: `--- ${desc.key} (${desc.path}) ---\n${inline}`,
    }
  },
}

export const ImageBase64Delivery: DeliveryStrategy = {
  id: "image-base64",
  supports(desc, caps) {
    return desc.kind === "image" && caps.modalities.images && caps.modalities.attachmentChannel === "base64"
  },
  render(desc, _caps, ctx) {
    const resolved = resolveWorkspaceFile(ctx.workspaceDir, desc.path, ctx.blackboard)
    if (!resolved.exists) {
      return {
        promptLine: describeInputDescriptor(desc),
        warning: `Image input missing: ${desc.path}`,
      }
    }
    try {
      const abs = join(ctx.workspaceDir, resolved.path.replace(/^\/+/, "").replace(/\\/g, "/"))
      const base64 = readFileSync(abs).toString("base64")
      return {
        promptLine: `Input [${desc.key}]: ${desc.path} — image attached`,
        attachment: { kind: "image", key: desc.key, path: resolved.path, base64, mimeType: desc.mime },
      }
    } catch {
      return {
        promptLine: describeInputDescriptor(desc),
        warning: `Failed to read image: ${desc.path}`,
      }
    }
  },
}

export const PathOnlyWarnDelivery: DeliveryStrategy = {
  id: "path-warn",
  supports: () => true,
  render(desc, caps) {
    const supported = providerSupportsInputKind(caps, desc.kind)
    const line = describeInputDescriptor(desc)
    if (supported) {
      return {
        promptLine: line,
        attachment: { kind: "path", key: desc.key, path: desc.path, mimeType: desc.mime },
      }
    }
    return {
      promptLine: line,
      attachment: { kind: "path", key: desc.key, path: desc.path, mimeType: desc.mime },
      warning: `Delegate may not support ${desc.kind} input: ${desc.path}`,
    }
  },
}

const STRATEGY_CHAIN: DeliveryStrategy[] = [
  ImageBase64Delivery,
  InlineTextDelivery,
  PathReferenceDelivery,
  PathOnlyWarnDelivery,
]

export class DeliveryPlanner {
  plan(descriptors: InputDescriptor[], caps: DelegateCapability, ctx: DeliveryStrategyContext): DeliveryPlan {
    const lines: string[] = []
    const attachments: NodeInputAttachment[] = []
    const warnings: string[] = []

    for (const desc of descriptors) {
      const strategy = STRATEGY_CHAIN.find((s) => s.supports(desc, caps)) ?? PathOnlyWarnDelivery
      const result = strategy.render(desc, caps, ctx)
      if (result.promptLine) lines.push(result.promptLine)
      if (result.attachment) attachments.push(result.attachment)
      if (result.warning) warnings.push(result.warning)
    }

    const promptSuffix = lines.length ? `\n\n## Input manifest\n${lines.join("\n")}` : ""
    return { promptSuffix, attachments, warnings }
  }
}

export function collectInputDescriptors(
  workspaceDir: string,
  node: WorkflowNode,
  blackboard: Blackboard,
): InputDescriptor[] {
  const meta = node.metadata as WorkflowNodeContextMeta | undefined
  const contract = mergeContract(meta?.archetype, meta?.contract)
  const descriptors: InputDescriptor[] = []

  for (const input of contract?.inputs ?? []) {
    const key = resolveInputKey(input.from)
    const bb = blackboard.get(key)
    const path = bb?.path ?? input.from
    const resolved = resolveWorkspaceFile(workspaceDir, path, blackboard)
    descriptors.push(createInputDescriptor(key, resolved, { mode: input.mode ?? "reference", slice: input.slice }))
  }

  for (const name of meta?.readRunFiles ?? []) {
    const resolved = resolveWorkspaceFile(workspaceDir, name, blackboard)
    if (!resolved.exists) continue
    descriptors.push(createInputDescriptor(name, resolved, { mode: "reference" }))
  }

  return descriptors
}

export function planNodeDelivery(
  workspaceDir: string,
  node: WorkflowNode,
  config: AgentNodeConfig,
  blackboard: Blackboard,
): DeliveryPlan {
  const caps = resolveDelegateCapability(config)
  const descriptors = collectInputDescriptors(workspaceDir, node, blackboard)
  const planner = new DeliveryPlanner()
  return planner.plan(descriptors, caps, { workspaceDir, blackboard, config })
}
