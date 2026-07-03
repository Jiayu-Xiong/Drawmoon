import { describe, expect, test } from "bun:test"

import { paperJournalDefaultTemplate } from "./bundled-templates/paper-journal-default.js"
import { validateWorkflowUiTemplate } from "./template-validator.js"

describe("paperJournalDefaultTemplate", () => {
  test("passes zero-token validation", () => {
    const template = paperJournalDefaultTemplate()
    const result = validateWorkflowUiTemplate(template)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.stats.nodeCount).toBeGreaterThan(30)
  })
})
