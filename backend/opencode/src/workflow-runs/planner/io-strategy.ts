/**
 * OpenCode multi-node IO collaboration planner strategy.
 * Used by archetype "planner" nodes that coordinate file layout across downstream workers.
 */

import type { WorkflowGraph } from "../../schema/types.js"
import { readNodeArchetype } from "../context/write-capability.js"

export const IO_COLLAB_PLANNER_PROMPT_RULE = `**IO Collaboration Planner (OpenCode / workflow-io strategy)**

You are the workflow's **file-allocation planner**. Downstream nodes run via OpenCode with \`workflow-io\` MCP: each worker writes **flat files only** at the workspace root; this runtime **hard-creates folders** and **migrates** flat outputs into final paths after each producer completes.

Your FIRST output block must be a JSON code fence with this exact shape:
\`\`\`json
{
  "writeRoot": ".",
  "folders": ["paper/sections", "paper/figures"],
  "files": [
    {
      "flat": "section-intro.md",
      "dest": "paper/sections/intro.md",
      "producer": "section-intro",
      "criticality": "critical"
    }
  ]
}
\`\`\`

Rules:
- \`writeRoot\` must be \`"."\` — single entity output root for all nodes.
- \`flat\`: root-level filename the producer node will write (no subdirs).
- \`dest\`: final relative path after deterministic migration.
- \`producer\`: exact downstream node id that owns the flat file.
- \`folders\`: every directory that must exist before workers run.
- List **every** file the workflow will produce. Missing entries cause \`needs-repair\` gate — never assume silent recovery.
- Workers must not create directories; only you declare layout; runtime enforces it.
- **Producer ownership:** Only write file *bodies* for entries where \`producer\` is your node id. For other producers, declare \`flat\`→\`dest\` in JSON but do **not** create or fill those \`dest\` paths — workers write flat staging files; runtime migrates them and **replaces** any placeholder shells.
- **Venue / submission requirements:** When the task names a conference, journal, or style kit, use \`workflow-web\` MCP to fetch official author guidelines (page limits, template URL, anonymization, figure rules) before finalizing the allocation plan. Save a short summary to a planner-owned markdown file (e.g. \`venue-requirements.md\`) cited in \`journal-architecture.md\`.

After the JSON block you may add architecture notes, context packs, or other markdown for downstream nodes.`

/** Inject exact graph node ids so allocation JSON cannot use invented producer aliases. */
export function buildPlannerProducerAllowlist(graph: WorkflowGraph, plannerNodeId: string): string {
  const producers = graph.nodes
    .filter((node) => {
      const arch = readNodeArchetype(node)
      if (arch === "gate" || arch === "reviewer") return false
      const kind = (node.action as { kind?: string } | undefined)?.kind
      if (kind === "inquiry" || kind === "human-gate") return false
      return true
    })
    .map((node) => node.id)
    .sort()

  return `**Producer allowlist (allocation JSON \`producer\` must be one of these exact node ids):**
${producers.map((id) => `- \`${id}\``).join("\n")}

Planner-owned layout files must use producer \`${plannerNodeId}\` — never shorten to "architect" or "planner".`
}

export const FLAT_WRITE_PROMPT_RULE = `**Write constraint (OpenCode workflow-io):** Write output files ONLY as flat filenames in the workspace root (e.g. \`section-intro.md\`). Do NOT create subdirectories — the IO planner allocates folders and the runtime moves files after your turn.`

/** Phase-1 inquiry: author questions only — no IO JSON yet. */
export function buildPlannerInquiryPhase1Rule(questionsFile: string, replyFile: string): string {
  return `**Planner inquiry — Phase 1 (mandatory now):**
- Read mounted manuscript inputs first.
- Use **workflow-web** MCP (\`webfetch\`) to fetch official venue author guidelines (page limits, section structure, template URL, figure/anonymization rules) when the task names a conference or journal.
- Write **${questionsFile}** with **6–10 numbered questions only**.
- Each question must be **one sentence ending with \`?\`** — no bullet sub-questions, no nested lists under a question.
- After the numbered list, add **## Execution summary** (≤6 short lines): your planned conversion approach so the author can correct it before Phase 2.
- Stop without IO allocation JSON, \`venue-requirements.md\`, or worker-owned deliverable paths — the workflow pauses until the author replies in **${replyFile}**.`
}

export const ICLR_2026_STYLE_KIT_RULE = `**ICLR 2026 official LaTeX kit (Phase 2 — download via workflow-web):**
- Author guide: https://iclr.cc/Conferences/2026/AuthorGuide
- Official GitHub: https://github.com/ICLR/Master-Template/tree/master/iclr2026
- Download with \`webfetch\` and save under \`iclr2026/\` (do not tweak .sty files):
  - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/iclr2026_conference.sty
  - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/iclr2026_conference.bst
  - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/iclr2026_conference.tex (reference shell)
  - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/natbib.sty
  - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/fancyhdr.sty
  - https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/math_commands.tex
- Or fetch zip: https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026.zip
- Build \`iclr2026/main.tex\` using \\usepackage[submission]{iclr2026_conference} and \\input{} for section paths — never substitute unofficial style files.`

/** Phase-2 inquiry: after author reply — web research + IO plan. */
export function buildPlannerInquiryPhase2Rule(questionsFile: string): string {
  return `**Planner inquiry — Phase 2 (mandatory now):**
- Author reply is in the prompt above. Do **not** rewrite **${questionsFile}**.
- Use **workflow-web** MCP to fetch official venue author guidelines; write **venue-requirements.md** (planner-owned) with URLs, page/section/word limits, and formatting constraints for downstream nodes.
- ${ICLR_2026_STYLE_KIT_RULE}
- Cite **venue-requirements.md** in **journal-architecture.md** (or equivalent architecture pack).
- Then emit the IO allocation JSON manifest and remaining planner-owned artifacts.`
}
