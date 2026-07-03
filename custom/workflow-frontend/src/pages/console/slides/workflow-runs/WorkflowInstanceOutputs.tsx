import { createMemo, createSignal, For, Show } from "solid-js"

import { DocumentViewer } from "../../../../components/DocumentViewer"
import { MarkdownBody } from "../../../../components/MarkdownBody"
import { MasonryColumns } from "../../../../components/MasonryColumns"
import type { WorkflowRunRecord as RuntimeWorkflowRunRecord } from "../../../../api"
import { Glass } from "../../shared/core"
import { mapDisplayStatus } from "./instance-utils"
import { resolveArtifactHref } from "./workflow-run-detail-utils"

function artifactHref(run: RuntimeWorkflowRunRecord, runId: string, ref?: string, fallbackFile?: string) {
  const trimmed = (ref ?? fallbackFile ?? "").trim()
  if (!trimmed) return ""
  const href = trimmed.startsWith("/") ? trimmed : resolveArtifactHref(run, trimmed)
  if (/[?&]runId=/.test(href)) return href
  const separator = href.includes("?") ? "&" : "?"
  return `${href}${separator}runId=${encodeURIComponent(runId)}`
}

export function WorkflowInstanceOutputs(props: {
  run: RuntimeWorkflowRunRecord
  runId: string
  columns: number
  liveOutputs?: Record<string, string>
}) {
  const graphNodes = createMemo(() => props.run.graph.nodes)
  const outputs = createMemo(() => Object.entries(props.run.history?.nodeOutputs ?? {}))
  const artifacts = createMemo(() => props.run.history?.artifacts ?? [])
  const finalOutput = createMemo(() => props.run.history?.finalOutput ?? "")
  const previewHref = createMemo(() => {
    const html = artifacts().find((item) => (item.href || item.path).endsWith("final-novel.html"))
    return artifactHref(props.run, props.runId, html?.href || html?.path, "final-novel.html")
  })
  const mdHref = createMemo(() => {
    const md = artifacts().find((item) => (item.href || item.path).endsWith("final-novel.md"))
    return artifactHref(props.run, props.runId, md?.href || md?.path, "final-novel.md")
  })
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null)

  function artifactPreview(artifact: { label: string; href?: string; path?: string; kind: string }) {
    const href = artifactHref(props.run, props.runId, artifact.href, artifact.path)
    if (/\.(png|jpe?g|webp|gif)($|\?)/i.test(href)) {
      return (
        <figure class="workflow-output-image-preview">
          <img src={href} alt={artifact.label} loading="lazy" />
          <figcaption>{artifact.label}</figcaption>
        </figure>
      )
    }
    if (/\.(md|markdown|html?|pdf)($|\?)/i.test(href)) {
      return <DocumentViewer href={href} kind="auto" title={artifact.label} />
    }
    return <a href={href} target="_blank" rel="noreferrer">{artifact.label}</a>
  }

  const outputCards = createMemo(() => {
    const cards = []
    // Final output first (duplicated hero card)
    cards.push(
      <Glass class="runtime-output-card runtime-output-card--final runtime-output-card--hero">
        <div class="panel-heading"><span>Final Output</span><strong>{props.run.status}</strong></div>
        <Show when={finalOutput()} fallback={<p class="workflow-output-empty">{props.run.error || "Final output appears after the review node completes."}</p>}>
          <DocumentViewer href={previewHref()} markdown={finalOutput()} kind="auto" title="Final novel" />
        </Show>
        <div class="workflow-output-preview-links">
          <a href={previewHref()} target="_blank" rel="noreferrer">HTML preview</a>
          <a href={mdHref()} target="_blank" rel="noreferrer">Markdown source</a>
        </div>
      </Glass>,
    )

    // Per-node output cards (unequal heights via masonry)
    for (const [nodeId, text] of outputs()) {
      const node = graphNodes().find((n) => n.id === nodeId)
      const nodeArtifacts = artifacts().filter((a) => a.nodeId === nodeId || a.label.startsWith(`${nodeId}-`))
      const status = props.run.nodeStates[nodeId]?.status ?? "done"
      const liveText = props.liveOutputs?.[nodeId]
      const displayText = text || (status === "running" && liveText ? liveText : "")
      cards.push(
        <Glass class="runtime-output-card runtime-output-card--node">
          <div class="panel-heading">
            <span>{node?.label ?? nodeId}</span>
            <strong>{status}</strong>
          </div>
          <button
            type="button"
            classList={{ "node-output-select": true, active: selectedNodeId() === nodeId }}
            onClick={() => setSelectedNodeId(nodeId)}
          >
            {mapDisplayStatus(status)}
          </button>
          <div class="runtime-io-block">
            <b>Input</b>
            <pre>{String(node?.config?.prompt ?? "No prompt recorded.")}</pre>
          </div>
          <div class="runtime-io-block">
            <b>Output</b>
            <Show when={displayText} fallback={<p class="workflow-output-empty">No output for this node yet.</p>}>
              <MarkdownBody text={displayText} />
              <Show when={status === "running" && liveText && !text}>
                <p class="workflow-output-streaming-hint">Streaming…</p>
              </Show>
            </Show>
          </div>
          <Show when={nodeArtifacts.length}>
            <div class="workflow-output-artifacts">
              <For each={nodeArtifacts}>
                {(artifact) => artifactPreview(artifact)}
              </For>
            </div>
          </Show>
        </Glass>,
      )
    }

    // Running nodes with live stream but no persisted output yet
    const outputNodeIds = new Set(outputs().map(([nodeId]) => nodeId))
    for (const [nodeId, liveText] of Object.entries(props.liveOutputs ?? {})) {
      if (outputNodeIds.has(nodeId) || !liveText.trim()) continue
      const node = graphNodes().find((n) => n.id === nodeId)
      const status = props.run.nodeStates[nodeId]?.status ?? "running"
      cards.push(
        <Glass class="runtime-output-card runtime-output-card--node runtime-output-card--live">
          <div class="panel-heading">
            <span>{node?.label ?? nodeId}</span>
            <strong>{status}</strong>
          </div>
          <div class="runtime-io-block">
            <b>Output (live)</b>
            <MarkdownBody text={liveText} />
            <p class="workflow-output-streaming-hint">Streaming…</p>
          </div>
        </Glass>,
      )
    }

    return cards
  })

  return (
    <MasonryColumns
      class="detail-bottom workflow-run-outputs workflow-run-output-masonry"
      columns={props.columns}
      items={outputCards()}
    />
  )
}
