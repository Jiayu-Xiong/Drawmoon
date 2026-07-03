import type { WorkflowRunRecord } from "./types.js"

const PREVIEW_CHARS = 600

/** Strip megabyte-scale node text from API responses; files remain on disk. */
export function toLightWorkflowRunRecord(run: WorkflowRunRecord): WorkflowRunRecord {
  const nodeResults = Object.fromEntries(
    Object.entries(run.nodeResults ?? {}).map(([nodeId, result]) => {
      const hasFileArtifact = (result.artifacts ?? []).some((artifact) => {
        const name = String(artifact.name ?? artifact.content ?? "")
        return /\.(md|markdown|html?|pdf|png|jpe?g|webp)$/i.test(name)
      })
      const summary = String(result.summary ?? "").trim()
      const text = String(result.text ?? "").trim()
      const compact = summary || (!hasFileArtifact ? text.slice(0, PREVIEW_CHARS) : "")
      return [nodeId, {
        ...result,
        text: compact.length < text.length ? compact : (hasFileArtifact && text.length > PREVIEW_CHARS ? compact : text),
        summary: compact || summary,
      }]
    }),
  )

  const finalOutput = run.history?.finalOutput
  const lightFinal = finalOutput && finalOutput.length > PREVIEW_CHARS
    ? `${finalOutput.slice(0, PREVIEW_CHARS)}…`
    : finalOutput

  return {
    ...run,
    nodeResults,
    history: {
      ...run.history,
      nodeOutputs: undefined,
      finalOutput: lightFinal,
    },
  }
}
