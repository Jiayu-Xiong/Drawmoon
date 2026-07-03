import { describe, expect, test } from "bun:test"

import { rebindWorkflowTemplateJson } from "./rebind-workflow-template.js"

describe("rebindWorkflowTemplateJson", () => {
  test("migrates legacy direct-llm-image to direct-api with llmId", () => {
    const raw = {
      id: "t",
      name: "T",
      nodes: [{
        id: "img",
        executionMode: "llm-api",
        agentModeTemplateId: "direct-llm-image",
        llmApiTemplateId: "kuaipao-openai-image",
        modality: "image",
      }],
    }
    const next = rebindWorkflowTemplateJson(raw)
    const node = (next.nodes as Record<string, unknown>[])[0]!
    expect(node.agentModeTemplateId).toBe("direct-api")
    expect(node.executorId).toBe("direct-api")
    expect(node.llmId).toBe("kuaipao-openai-image")
    expect(node.executionMode).toBe("agent-mode")
  })
})
