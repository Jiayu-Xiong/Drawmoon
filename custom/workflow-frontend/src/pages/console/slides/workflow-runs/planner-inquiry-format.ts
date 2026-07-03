export interface PlannerInquiryItem {
  n: number
  text: string
}

export interface PlannerInquiryFormatted {
  preamble: string
  items: PlannerInquiryItem[]
  appendix: string
  raw: string
}

/**
 * Section-aware parser: numbered/bullet items are only collected inside the
 * "Clarification questions" section so that a proposed architecture (bulleted)
 * or execution summary never gets mistaken for extra questions.
 */
export function formatPlannerInquiryQuestions(raw: string): PlannerInquiryFormatted {
  const trimmed = raw.trim()
  const lines = trimmed.split(/\r?\n/)
  const items: PlannerInquiryItem[] = []
  const preambleLines: string[] = []
  const appendixLines: string[] = []
  let section: "pre" | "questions" | "other" = "pre"
  let sawQuestionsHeader = false

  for (const line of lines) {
    const header = line.match(/^\s*#{1,6}\s*(.+?)\s*$/)
    if (header) {
      const title = header[1]!.toLowerCase()
      if (/question|clarif/.test(title)) {
        section = "questions"
        sawQuestionsHeader = true
        continue
      }
      section = "other"
      appendixLines.push(line)
      continue
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)/)
    const bullet = !numbered && line.match(/^\s*[-*•]\s+(.+)/)

    if (section === "questions") {
      if (numbered) {
        items.push({ n: Number(numbered[1]), text: numbered[2]!.trim() })
      } else if (bullet) {
        items.push({ n: items.length + 1, text: bullet[1]!.trim() })
      } else if (line.trim() && items.length) {
        items[items.length - 1]!.text += ` ${line.trim()}`
      }
      continue
    }

    if (section === "other") {
      appendixLines.push(line)
      continue
    }

    // section === "pre": support legacy files that start with a bare numbered list.
    if (!sawQuestionsHeader && numbered) {
      section = "questions"
      items.push({ n: Number(numbered[1]), text: numbered[2]!.trim() })
      continue
    }
    if (line.trim()) preambleLines.push(line)
  }

  return {
    preamble: preambleLines.join("\n").trim(),
    items,
    appendix: appendixLines.join("\n").trim(),
    raw: trimmed,
  }
}
