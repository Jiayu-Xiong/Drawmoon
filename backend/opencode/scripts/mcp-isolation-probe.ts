#!/usr/bin/env bun
/**
 * Minimal stdio MCP server for tool-isolation smoke tests.
 * Returns a fixed token only via tools/call — never embedded in workflow prompts.
 */
import * as readline from "node:readline"

const TOOL = process.env.MCP_PROBE_TOOL ?? "isolation_probe"
const TOKEN = process.env.MCP_PROBE_TOKEN ?? "MCP_UNKNOWN"

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function handleRequest(raw: string) {
  let req: { id?: number | string; method?: string; params?: Record<string, unknown> }
  try {
    req = JSON.parse(raw) as typeof req
  } catch {
    return
  }

  const { id, method } = req
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "isolation-probe", version: "1.0.0" },
      },
    })
    return
  }

  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [{
          name: TOOL,
          description: "Isolation probe — returns this node's MCP secret token.",
          inputSchema: { type: "object", properties: {} },
        }],
      },
    })
    return
  }

  if (method === "tools/call") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: TOKEN }],
        isError: false,
      },
    })
    return
  }

  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} })
    return
  }

  if (id !== undefined && !String(method ?? "").startsWith("notifications/")) {
    send({ jsonrpc: "2.0", id, result: {} })
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on("line", handleRequest)
