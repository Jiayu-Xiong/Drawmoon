import { createMemo, createResource, Show } from "solid-js"

import { MarkdownBody } from "../../../../components/MarkdownBody"
import { formatPlannerInquiryQuestions } from "./planner-inquiry-format"

export function PlannerInquiryQuestions(props: {
  href: string
  markdown?: string
  fileName: string
}) {
  const [fetched] = createResource(
    () => (props.markdown ? null : props.href),
    async (href) => {
      const response = await fetch(href, { cache: "no-store" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.text()
    },
  )

  const sourceText = createMemo(() => props.markdown ?? fetched() ?? "")
  const formatted = createMemo(() => formatPlannerInquiryQuestions(sourceText()))

  return (
    <div class="wf-inquiry-questions-panel">
      <header class="wf-inquiry-questions-head">
        <strong>{props.fileName}</strong>
        <a class="wf-inquiry-questions-link" href={props.href} target="_blank" rel="noreferrer">Open file</a>
      </header>

      <Show when={!props.markdown && fetched.loading}>
        <p class="wf-inquiry-questions-status">Loading planner questions…</p>
      </Show>

      <Show when={sourceText()}>
        <Show
          when={formatted().items.length > 0}
          fallback={<MarkdownBody text={sourceText()} class="wf-inquiry-questions-fallback wf-prose" />}
        >
          <Show when={formatted().preamble}>
            {(preamble) => <MarkdownBody text={preamble()} class="wf-inquiry-questions-preamble wf-prose" />}
          </Show>
          <ol class="wf-inquiry-question-list">
            {formatted().items.map((item) => (
              <li class="wf-inquiry-question-item">
                <span class="wf-inquiry-question-index">{item.n}</span>
                <div class="wf-inquiry-question-body">
                  <MarkdownBody text={item.text} class="wf-prose wf-inquiry-question-text" />
                </div>
              </li>
            ))}
          </ol>
          <Show when={formatted().appendix}>
            {(appendix) => <MarkdownBody text={appendix()} class="wf-inquiry-questions-appendix wf-prose" />}
          </Show>
        </Show>
      </Show>
    </div>
  )
}
