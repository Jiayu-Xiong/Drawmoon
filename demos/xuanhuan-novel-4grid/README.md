# Demo — Xuanhuan novel + cover

A 7-node creative-writing workflow: a planner drafts the book bible, four chapter
writers fork the shared planner context and write in parallel, a final editor
merges them into one manuscript (Markdown / HTML / PDF) and emits a cover prompt,
and an image node renders the cover.

- **Template:** [`template.json`](template.json) (id `opencode-xuanhuan-novel-4ch-image`)
- **Status:** completed · 7/7 nodes
- **Active time:** ~13 min
- **Machine-readable summary:** [`run-summary.json`](run-summary.json)

> The template is English; the generated novel is Simplified Chinese and kept as-is.

## Token consumption

| | Input | Output | Cache read | Total |
|---|---:|---:|---:|---:|
| **Run total** | 175,573 | 48,570 | 723,456 | **947,599** |

## Execution entities & per-node token usage

| Node | Executor | Model | Input | Output | Cache read | Total |
|------|----------|-------|---:|---:|---:|---:|
| master-plan | `opencode-plan` | GPT-5.5 | 2,847 | 4,858 | 9,216 | 16,921 |
| chapter-1 | `opencode-chat` (fork) | DeepSeek V4 Flash | 11,051 | 4,279 | 17,920 | 33,250 |
| chapter-2 | `opencode-chat` (fork) | DeepSeek V4 Flash | 19,978 | 8,706 | 110,720 | 139,404 |
| chapter-3 | `opencode-chat` (fork) | DeepSeek V4 Flash | 26,535 | 13,247 | 321,152 | 360,934 |
| chapter-4 | `opencode-chat` (fork) | DeepSeek V4 Flash | 27,082 | 8,130 | 264,448 | 299,660 |
| final-review | `opencode-default-agent` | GPT-5.5 | 88,080 | 9,350 | 0 | 97,430 |
| generate-cover | `direct-api` | GPT Image 2 | — | — | — | image node |

## Execution output

- **[`outputs/final-novel.pdf`](outputs/final-novel.pdf)** · [`final-novel.md`](outputs/final-novel.md) — merged manuscript.
- **[`outputs/chapters/`](outputs/chapters/)** — the four chapter drafts.
- **[`outputs/master-plan.md`](outputs/master-plan.md)** — book bible / plan.
- **[`outputs/cover.png`](outputs/cover.png)** — generated cover ([prompt](outputs/cover-prompt.md)).

<p align="center">
  <img src="outputs/cover.png" alt="Generated novel cover" width="320" />
</p>
