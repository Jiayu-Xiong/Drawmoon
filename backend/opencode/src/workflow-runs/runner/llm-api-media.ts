import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { ulid } from "ulid"

import type { LlmClientConfig } from "../../llm-api/unified/types.js"
import type { AgentNodeOutput } from "../../schema/types.js"
import type { WorkflowOutputContext } from "../node-output-files.js"
import { workflowArtifactHref } from "../workspace-paths.js"

export function mediaPrompt(prompt: string, upstreamOutput: AgentNodeOutput | undefined): string {
  const imagePrompt = extractImagePrompt(upstreamOutput?.text) ?? extractImagePrompt(upstreamOutput?.summary)
  if (imagePrompt) {
    return [
      imagePrompt,
      prompt,
      "Safety constraints: use symbolic fantasy cover art only. Show no gore, wounds, blood, dismemberment, explicit violence, or active fighting. Use mystical light, artifacts, landscape, robes, clouds, and dramatic but non-violent composition.",
    ].join("\n\n")
  }
  const parts = [
    upstreamOutput?.summary ? `Upstream summary:\n${upstreamOutput.summary}` : "",
    upstreamOutput?.text ? `Upstream output:\n${upstreamOutput.text.slice(0, 4000)}` : "",
    prompt,
    "Safety constraints: if this is an image request, avoid gore, wounds, blood, dismemberment, explicit violence, or active fighting.",
  ].filter(Boolean)
  return parts.join("\n\n")
}

export function extractImagePrompt(text: string | undefined): string | null {
  if (!text) return null
  const match = text.match(/\[IMAGE_PROMPT\]\s*([\s\S]*?)(?:\n#{1,6}\s|\n\[[A-Z_]+\]|$)/)
  const value = match?.[1]?.trim()
  return value ? value.slice(0, 1200) : null
}

export async function imageGenerationCompletion(
  config: LlmClientConfig,
  prompt: string,
  signal: AbortSignal,
) {
  const base = config.endpoint.replace(/\/$/, "")
  const url = base.endsWith("/images/generations")
    ? base
    : base.endsWith("/v1")
      ? `${base}/images/generations`
      : `${base}/v1/images/generations`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 300_000)
  const mergedSignal = AbortSignal.any([signal, controller.signal])
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        n: 1,
        response_format: "b64_json",
      }),
      signal: mergedSignal,
    })
    const raw = await response.json().catch(async () => ({ error: await response.text().catch(() => "") }))
    if (!response.ok) {
      throw new Error(`LLM API image error ${response.status}: ${JSON.stringify(raw)}`)
    }
    const first = (raw as { data?: Array<{ revised_prompt?: string; url?: string; b64_json?: string }> }).data?.[0]
    return {
      id: ulid(),
      model: config.model,
      text: first?.revised_prompt ?? prompt,
      finishReason: "stop",
      raw,
      usage: undefined,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function persistLlmApiArtifacts(
  ctx: WorkflowOutputContext,
  nodeId: string,
  modality: "text" | "image" | "audio",
  raw: unknown,
  preferredName?: string,
): AgentNodeOutput["artifacts"] {
  if (modality === "text") return []
  const found = collectMediaValues(raw, modality)
  if (!found.length) return []

  const runDir = ctx.workspaceDir
  return found.map((item, index) => {
    const ext = item.mime.includes("png") ? "png"
      : item.mime.includes("jpeg") || item.mime.includes("jpg") ? "jpg"
        : item.mime.includes("webp") ? "webp"
          : item.mime.includes("mpeg") ? "mp3"
            : item.mime.includes("wav") ? "wav"
              : modality === "image" ? "png" : "bin"
    const fallback = `${nodeId}-${index + 1}.${ext}`
    const name = preferredName && index === 0
      ? preferredName.replace(/\\/g, "/").split("/").pop() ?? fallback
      : fallback
    const relPath = preferredName && index === 0 && preferredName.includes("/")
      ? preferredName.replace(/\\/g, "/")
      : name
    const absPath = join(runDir, relPath)
    mkdirSync(dirname(absPath), { recursive: true })
    if (item.kind === "base64") {
      writeFileSync(absPath, Buffer.from(item.value, "base64"))
      return {
        name: relPath,
        mime: item.mime,
        content: workflowArtifactHref(ctx.workspaceKey, relPath),
        isReference: true,
      }
    }
    return {
      name: relPath,
      mime: item.mime,
      content: item.value,
      isReference: true,
    }
  })
}

/** Download remote image/audio URLs into the workspace so downstream nodes can read files. */
export async function materializeUrlArtifacts(
  ctx: WorkflowOutputContext,
  artifacts: AgentNodeOutput["artifacts"],
): Promise<AgentNodeOutput["artifacts"]> {
  if (!artifacts?.length) return artifacts ?? []
  const out: AgentNodeOutput["artifacts"] = []
  for (const artifact of artifacts) {
    if (!artifact.content.startsWith("http://") && !artifact.content.startsWith("https://")) {
      out.push(artifact)
      continue
    }
    const absPath = join(ctx.workspaceDir, artifact.name.replace(/\\/g, "/"))
    mkdirSync(dirname(absPath), { recursive: true })
    const response = await fetch(artifact.content)
    if (!response.ok) throw new Error(`Failed to download artifact ${artifact.name}: HTTP ${response.status}`)
    writeFileSync(absPath, Buffer.from(await response.arrayBuffer()))
    out.push({
      ...artifact,
      content: workflowArtifactHref(ctx.workspaceKey, artifact.name),
      isReference: true,
    })
  }
  return out
}

function collectMediaValues(raw: unknown, modality: "image" | "audio" | "text") {
  const results: Array<{ kind: "base64" | "url"; value: string; mime: string }> = []
  if (modality === "text") return results
  const defaultMime = modality === "image" ? "image/png" : "audio/mpeg"
  const visit = (value: unknown, key = "") => {
    if (!value) return
    if (typeof value === "string") {
      const dataMatch = value.match(/^data:([^;]+);base64,(.+)$/)
      if (dataMatch?.[1] && dataMatch[2]) {
        if (dataMatch[1].startsWith(modality)) results.push({ kind: "base64", value: dataMatch[2], mime: dataMatch[1] })
        return
      }
      if (/^https?:\/\//.test(value) && /\.(png|jpe?g|webp|gif|mp3|wav|m4a)(\?|$)/i.test(value)) {
        results.push({ kind: "url", value, mime: inferMimeFromUrl(value, defaultMime) })
        return
      }
      if (/^(b64_json|base64|image|audio|data)$/i.test(key) && /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 80) {
        results.push({ kind: "base64", value: value.replace(/\s+/g, ""), mime: defaultMime })
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key)
      return
    }
    if (typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) visit(childValue, childKey)
    }
  }
  visit(raw)
  return results
}

function inferMimeFromUrl(url: string, fallback: string) {
  const clean = url.split("?")[0]?.toLowerCase() ?? ""
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg"
  if (clean.endsWith(".webp")) return "image/webp"
  if (clean.endsWith(".gif")) return "image/gif"
  if (clean.endsWith(".mp3")) return "audio/mpeg"
  if (clean.endsWith(".wav")) return "audio/wav"
  if (clean.endsWith(".m4a")) return "audio/mp4"
  if (clean.endsWith(".png")) return "image/png"
  return fallback
}
