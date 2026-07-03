import type { WorkflowAction, WorkflowActionKind } from "./types.js"

export type WorkflowActionValidationErrorCode = "required" | "invalid-type" | "invalid-value"

export interface WorkflowActionValidationError {
  path: string
  code: WorkflowActionValidationErrorCode
  message: string
}

export interface WorkflowActionValidationResult {
  valid: boolean
  errors: WorkflowActionValidationError[]
}

const WORKFLOW_ACTION_KINDS: WorkflowActionKind[] = [
  "agent-mode",
  "llm-api",
  "cli",
  "tool",
  "human-gate",
  "inquiry",
  "condition",
  "merge",
  "parallel",
  "loop",
  "artifact",
]

export function validateWorkflowAction(input: unknown): WorkflowActionValidationResult {
  const errors: WorkflowActionValidationError[] = []

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [{ path: "$", code: "invalid-type", message: "Workflow action must be an object." }],
    }
  }

  requireString(input, "id", errors)
  requireString(input, "label", errors)

  if (!isNonEmptyString(input.kind)) {
    errors.push({ path: "kind", code: "required", message: "Workflow action kind is required." })
  } else if (!WORKFLOW_ACTION_KINDS.includes(input.kind as WorkflowActionKind)) {
    errors.push({ path: "kind", code: "invalid-value", message: `Unsupported workflow action kind "${input.kind}".` })
  }

  requireObject(input, "inputs", errors)
  requireObject(input, "binding", errors)
  requireObject(input, "overrides", errors)
  requireObject(input, "session", errors)
  requireObject(input, "constraints", errors)
  requireObject(input, "execution", errors)
  requireObject(input, "output", errors)

  if (isRecord(input.session)) {
    requireString(input.session, "policy", errors, "session.policy")
  }

  if (isRecord(input.constraints)) {
    validateStringArray(input.constraints, "forcedSkills", errors, "constraints.forcedSkills")
    validateStringArray(input.constraints, "allowedSkills", errors, "constraints.allowedSkills")
    validateStringArray(input.constraints, "forcedMcpServers", errors, "constraints.forcedMcpServers")
    validateStringArray(input.constraints, "allowedMcpServers", errors, "constraints.allowedMcpServers")
    validateStringArray(input.constraints, "forcedTools", errors, "constraints.forcedTools")
    validateStringArray(input.constraints, "allowedTools", errors, "constraints.allowedTools")
  }

  if (WORKFLOW_ACTION_KINDS.includes(input.kind as WorkflowActionKind)) {
    validateKindRequirements(input as unknown as WorkflowAction, errors)
  }

  return { valid: errors.length === 0, errors }
}

function validateKindRequirements(action: WorkflowAction, errors: WorkflowActionValidationError[]): void {
  switch (action.kind) {
    case "agent-mode":
      requireNestedString(action.binding, "agentModeId", errors, "binding.agentModeId")
      break
    case "llm-api":
      requireNestedString(action.binding, "llmApiTemplateId", errors, "binding.llmApiTemplateId")
      break
    case "cli":
      if (!isNonEmptyString(action.binding.providerId) && !isNonEmptyString(action.binding.commandId)) {
        errors.push({
          path: "binding.providerId",
          code: "required",
          message: "CLI actions require binding.providerId or binding.commandId.",
        })
      }
      break
    case "tool":
      requireNestedString(action.binding, "toolId", errors, "binding.toolId")
      break
    case "human-gate":
      if (!isNonEmptyString(action.humanGate?.approvalText) && !isNonEmptyString(action.humanGate?.gateLabel)) {
        errors.push({ path: "humanGate", code: "required", message: "Human gate actions require approval text or a gate label." })
      }
      break
    case "inquiry":
      if (!isNonEmptyString(action.inquiry?.promptText) && !isNonEmptyString(action.inquiry?.inquiryLabel)) {
        errors.push({ path: "inquiry", code: "required", message: "Inquiry actions require prompt text or an inquiry label." })
      }
      break
    case "condition":
      if (!isNonEmptyString(action.condition?.expression) && !isRecord(action.condition?.selector)) {
        errors.push({ path: "condition", code: "required", message: "Condition actions require an expression or selector." })
      }
      break
    case "merge":
      requireNestedString(action.merge, "strategy", errors, "merge.strategy")
      break
    case "parallel":
      if (!Array.isArray(action.parallel?.childRefs) || action.parallel.childRefs.length === 0) {
        errors.push({ path: "parallel.childRefs", code: "required", message: "Parallel actions require child node/action refs." })
      }
      break
    case "loop":
      if (!isNonEmptyString(action.loop?.condition)) {
        errors.push({ path: "loop.condition", code: "required", message: "Loop actions require a loop condition." })
      }
      if (!Number.isFinite(action.loop?.maxIterations) || Number(action.loop?.maxIterations) < 1) {
        errors.push({ path: "loop.maxIterations", code: "required", message: "Loop actions require a positive max iteration guard." })
      }
      break
    case "artifact":
      requireNestedString(action.artifact, "operation", errors, "artifact.operation")
      if (!isRecord(action.artifact?.selector) && !isNonEmptyString(action.artifact?.path)) {
        errors.push({ path: "artifact", code: "required", message: "Artifact actions require an artifact selector or path." })
      }
      break
  }
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  errors: WorkflowActionValidationError[],
  path = key,
): void {
  if (!isNonEmptyString(record[key])) {
    errors.push({ path, code: "required", message: `${path} is required.` })
  }
}

function requireNestedString(
  record: unknown,
  key: string,
  errors: WorkflowActionValidationError[],
  path: string,
): void {
  if (!isRecord(record) || !isNonEmptyString(record[key])) {
    errors.push({ path, code: "required", message: `${path} is required.` })
  }
}

function requireObject(record: Record<string, unknown>, key: string, errors: WorkflowActionValidationError[]): void {
  if (!isRecord(record[key])) {
    errors.push({ path: key, code: "required", message: `${key} is required and must be an object.` })
  }
}

function validateStringArray(
  record: Record<string, unknown>,
  key: string,
  errors: WorkflowActionValidationError[],
  path: string,
): void {
  const value = record[key]
  if (value === undefined) return
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push({ path, code: "invalid-type", message: `${path} must be an array of strings.` })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}