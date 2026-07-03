#!/usr/bin/env bun
/** Stdio MCP: HTTP fetch for workflow nodes (replaces opencode webfetch). */
import * as readline from "node:readline"

const MAX_BYTES = 512_000

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const buf = await res.arrayBuffer()
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_BYTES))
  return `HTTP ${res.status}\n${text}`
}

function handleRequest(raw: string) {
  void (async () => {
    let req: { id?: number | string; method?: string; params?: { name?: string; arguments?: { url?: string } } }
    try { req = JSON.parse(raw) as typeof req } catch { return }
    const { id, method, params } = req
    if (method === "initialize") {
      send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "workflow-web", version: "1.0.0" } } })
      return
    }
    if (method === "tools/list") {
      send({
        jsonrpc: "2.0", id, result: {
          tools: [{
            name: "webfetch",
            description: "Fetch a URL and return response body (truncated).",
            inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
          }],
        },
      })
      return
    }
    if (method === "tools/call") {
      try {
        const url = params?.arguments?.url?.trim()
        if (!url) throw new Error("url required")
        const text = await fetchUrl(url)
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: false } })
      } catch (err) {
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true } })
      }
      return
    }
    if (method === "ping") { send({ jsonrpc: "2.0", id, result: {} }); return }
    if (id !== undefined) send({ jsonrpc: "2.0", id, result: {} })
  })()
}

const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on("line", handleRequest)
