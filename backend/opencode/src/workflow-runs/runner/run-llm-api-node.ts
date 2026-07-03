import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ulid } from "ulid"

import { unifiedChatCompletionStream } from "../../llm-api/client.js"
import { withLlmApiConcurrencySlot, acquireLlmApiConcurrencySlot } from "../../llm-api/api-concurrency.js"
import { loadKuaipaoConfig, resolveApiFileKeyByEnv, resolveKuaipaoApiKey } from "../../llm-api/kuaipao-config.js"
import type { LlmClientConfig, UnifiedChatRequest } from "../../llm-api/unified/types.js"
import type { AgentNodeConfig, AgentNodeOutput, SessionState, WorkflowNode } from "../../schema/types.js"
import type { AgentRuntime } from "../../runtime.js"
import type { WorkflowAction } from "../../workflow-actions/types.js"
import type { RunEvent } from "../../schema/types.js"
import type { WorkflowRunRecord } from "../types.js"
import { imageGenerationCompletion, materializeUrlArtifacts, mediaPrompt, persistLlmApiArtifacts } from "./llm-api-media.js"
import type { WorkflowOutputContext } from "../node-output-files.js"
import type { LlmApiActionMetadata } from "./node-config-resolver.js"

export interface RunnerNodeEvent {
  event: RunEvent
  session?: SessionState
}

export async function* runLlmApiNode(
  runtime: AgentRuntime,
  record: WorkflowRunRecord,
  node: WorkflowNode,
  action: WorkflowAction,
  config: AgentNodeConfig,
  upstreamOutput: AgentNodeOutput | undefined,
  upstreamSession: SessionState | undefined,
  signal: AbortSignal,
  outputCtx: WorkflowOutputContext,
): AsyncIterable<RunnerNodeEvent> {
  const runId = record.id
  const traceId = ulid()
  const metadata = (action.metadata ?? {}) as LlmApiActionMetadata
  const modality = metadata.modality ?? config.modality ?? "text"
  const api = metadata.llmApi
  if (!api?.endpoint || !api.model) {
    throw new Error(`LLM API node "${node.id}" is missing endpoint/model metadata.`)
  }

  const sessions = runtime.getSessionManager()
  const { session, policy } = sessions.buildUpstreamContext(
    upstreamSession,
    upstreamOutput,
    config.contextMode,
    traceId,
    config.sessionPolicy,
    config.sessionKey,
    config.sessionId,
  )
  sessions.addMessage(session.id, { role: "user", content: config.prompt, timestamp: new Date().toISOString() })
  session.messages.push({ role: "user", content: config.prompt, timestamp: new Date().toISOString() })

  yield { event: { type: "start", runId, nodeId: "llm-api", timestamp: new Date().toISOString() }, session }
  yield { event: { type: "session", runId, sessionId: session.id, policy, sessionKey: config.sessionKey, timestamp: new Date().toISOString() }, session }

  const kuaipao = loadKuaipaoConfig()
  const apiKey = resolveApiFileKeyByEnv(api.apiKeyEnv) || (api.apiKeyEnv ? process.env[api.apiKeyEnv] ?? "" : "") || resolveKuaipaoApiKey(kuaipao) || ""
  const messages: UnifiedChatRequest["messages"] = []
  if (upstreamOutput?.summary) messages.push({ role: "system", content: `Upstream summary:\n${upstreamOutput.summary}` })
  if (upstreamOutput?.artifacts?.length) {
    messages.push({ role: "system", content: `Upstream artifacts:\n${upstreamOutput.artifacts.map((artifact) => `- ${artifact.name} (${artifact.mime})`).join("\n")}` })
  }

  const imageParts = (config.inputAttachments ?? [])
    .filter((a) => a.kind === "image" && a.base64)
    .map((a) => ({ type: "image" as const, base64: a.base64, mimeType: a.mimeType ?? "image/png" }))

  if (imageParts.length) {
    messages.push({
      role: "user",
      content: [{ type: "text", text: config.prompt }, ...imageParts],
    })
  } else {
    messages.push({ role: "user", content: config.prompt })
  }

  const startedAt = new Date().toISOString()
  const clientConfig: LlmClientConfig = {
    protocol: api.protocol ?? "openai-chat",
    endpoint: api.endpoint,
    model: api.model,
    apiKey,
    apiKeyEnv: api.apiKeyEnv,
    timeoutMs: api.timeoutMs ?? config.timeoutMs ?? 300_000,
  }

  let responseText = ""
  let responseUsage: AgentNodeOutput["usage"]
  let responseRaw: unknown

  if (modality === "image") {
    const readRunFiles = (node.metadata as { readRunFiles?: string[] } | undefined)?.readRunFiles ?? []
    let imagePrompt = mediaPrompt(config.prompt, upstreamOutput)
    for (const rel of readRunFiles) {
      try {
        const spec = readFileSync(join(outputCtx.workspaceDir, rel.replace(/\\/g, "/")), "utf-8").trim()
        if (spec) imagePrompt = `--- FIGURE SPEC (${rel}) ---\n${spec.slice(0, 12_000)}\n\n${imagePrompt}`
      } catch {
        // Runner-owned file I/O — never ask the image API to read paths.
      }
    }
    const imageResponse = await withLlmApiConcurrencySlot(api.apiKeyEnv, () =>
      imageGenerationCompletion(clientConfig, imagePrompt, signal),
    )
    responseText = imageResponse.text
    responseRaw = imageResponse.raw
    responseUsage = undefined
  } else {
    let fullText = ""
    let streamUsage: AgentNodeOutput["usage"]
    const releaseSlot = await acquireLlmApiConcurrencySlot(api.apiKeyEnv)
    try {
      for await (const event of unifiedChatCompletionStream(
        clientConfig,
        {
          model: api.model,
          system: api.system,
          messages,
          temperature: api.temperature,
          topP: api.topP,
          maxOutputTokens: api.maxOutputTokens,
          responseFormat: api.responseFormat === "json" ? "json" : api.responseFormat === "markdown" ? "markdown" : "text",
          stream: true,
          metadata: { runId: record.id, nodeId: node.id, modality },
        },
        signal,
      )) {
        if (event.type === "delta" && event.delta) {
          fullText += event.delta
          yield { event: { type: "stdout", runId, data: event.delta, timestamp: new Date().toISOString() }, session }
        } else if (event.type === "usage" && event.usage) {
          streamUsage = {
            inputTokens: event.usage.inputTokens ?? 0,
            outputTokens: event.usage.outputTokens ?? 0,
            cacheReadTokens: event.usage.cacheReadTokens ?? 0,
            cacheWriteTokens: event.usage.cacheWriteTokens ?? 0,
            reasoningTokens: event.usage.reasoningTokens,
            totalTokens: event.usage.totalTokens ?? ((event.usage.inputTokens ?? 0) + (event.usage.outputTokens ?? 0)),
            source: "run-results",
          }
        } else if (event.type === "done" && event.response) {
          fullText = event.response.text || fullText
          if (event.response.usage) {
            streamUsage = {
              inputTokens: event.response.usage.inputTokens ?? 0,
              outputTokens: event.response.usage.outputTokens ?? 0,
              cacheReadTokens: event.response.usage.cacheReadTokens ?? 0,
              cacheWriteTokens: event.response.usage.cacheWriteTokens ?? 0,
              reasoningTokens: event.response.usage.reasoningTokens,
              totalTokens: event.response.usage.totalTokens ?? ((event.response.usage.inputTokens ?? 0) + (event.response.usage.outputTokens ?? 0)),
              source: "run-results",
            }
          }
          responseRaw = event.response
        } else if (event.type === "error") {
          throw new Error(event.error ?? "LLM API stream failed")
        }
      }
    } finally {
      releaseSlot()
    }
    responseText = fullText
    responseUsage = streamUsage
  }

  const finishedAt = new Date().toISOString()
  const outputFile = (node.metadata as { outputFile?: string } | undefined)?.outputFile
  const artifacts = await materializeUrlArtifacts(
    outputCtx,
    persistLlmApiArtifacts(outputCtx, node.id, modality, responseRaw, outputFile),
  )
  const usage = responseUsage
    ? { ...responseUsage, source: "run-results" as const }
    : undefined
  const output: AgentNodeOutput = {
    text: responseText,
    summary: responseText.slice(0, 1200),
    artifacts,
    traceId,
    cache: { hit: false, mode: "off", key: "", bypassed: false, createdAt: null },
    metadata: {
      startedAt,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      exitCode: 0,
      cancelled: false,
      timedOut: false,
      iterations: 1,
      provider: "custom",
      providerVersion: api.id ?? null,
    },
    usage,
  }
  sessions.updateFromOutput(session, output)
  yield { event: { type: "complete", runId, result: output, timestamp: finishedAt }, session }
}
