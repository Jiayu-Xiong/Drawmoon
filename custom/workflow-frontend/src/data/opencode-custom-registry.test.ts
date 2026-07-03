import { describe, expect, test } from "bun:test"

import { ensureAgentModeTemplatesRegistered } from "./agent-mode-templates"
import { listAgentModeTemplates } from "./template-registry"
import {
  canonicalOpencodeCustomModeId,
  groupOpencodeCustomModes,
  isOpencodeCustomCardMode,
} from "./opencode-custom-registry"

ensureAgentModeTemplatesRegistered()

describe("opencode-custom-registry", () => {
  test("native opencode modes are excluded from custom card", () => {
    const modes = listAgentModeTemplates()
    expect(isOpencodeCustomCardMode(modes.find((m) => m.id === "opencode-chat")!)).toBe(false)
    expect(isOpencodeCustomCardMode(modes.find((m) => m.id === "custom-io-planner")!)).toBe(true)
  })

  test("similar modes alias to canonical ids", () => {
    expect(canonicalOpencodeCustomModeId("opencode-paper-reviewer")).toBe("opencode-objective-reviewer")
    expect(canonicalOpencodeCustomModeId("opencode-paper-compile")).toBe("opencode-layout-auditor")
  })

  test("custom groups include io planner role first", () => {
    const groups = groupOpencodeCustomModes(listAgentModeTemplates())
    expect(groups[0]?.role).toBe("io-planner")
    expect(groups[0]?.modes.some((m) => m.id === "custom-io-planner")).toBe(true)
  })
})
