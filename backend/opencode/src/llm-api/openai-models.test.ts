import { describe, expect, test } from "bun:test"

import { parseOpenAiModelEntry } from "./openai-models.js"
import { inferWireProtocolFromModel } from "./unified/protocol.js"

describe("parseOpenAiModelEntry", () => {
  test("uses remote display name when present", () => {
    const entry = parseOpenAiModelEntry({
      id: "gpt-5.5",
      name: "GPT 5.5",
      owned_by: "openai",
    })
    expect(entry?.name).toBe("GPT 5.5")
    expect(entry?.ownedBy).toBe("openai")
  })

  test("defaults gpt-5 proxy models to openai-chat", () => {
    expect(inferWireProtocolFromModel("gpt-5.5")).toBe("openai-chat")
    expect(parseOpenAiModelEntry({ id: "gpt-5.5" })?.wireProtocol).toBe("openai-chat")
  })

  test("uses responses only when endpoint types include responses", () => {
    expect(inferWireProtocolFromModel("gpt-5.5", ["responses"])).toBe("openai-responses")
  })
})
