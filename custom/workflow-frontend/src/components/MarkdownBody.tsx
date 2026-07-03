import { createMemo } from "solid-js"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderMarkdown(source: string) {
  const blocks = source.split(/```/)
  return blocks.map((block, index) => {
    if (index % 2 === 1) {
      return `<pre class="md-code"><code>${escapeHtml(block.trim())}</code></pre>`
    }
    return escapeHtml(block)
      .replace(/^###### (.+)$/gm, "<h6>$1</h6>")
      .replace(/^##### (.+)$/gm, "<h5>$1</h5>")
      .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\n/g, "<br />")
  }).join("").replace(/^/, "<p>").replace(/$/, "</p>")
}

export function MarkdownBody(props: { text: string; class?: string }) {
  const html = createMemo(() => renderMarkdown(props.text || ""))
  return <div class={`markdown-body${props.class ? ` ${props.class}` : ""}`} innerHTML={html()} />
}
