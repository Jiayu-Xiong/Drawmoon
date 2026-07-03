#!/usr/bin/env bun
/** Stdio MCP: workspace-scoped filesystem IO (replaces opencode built-in read/write for workflow nodes). */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import * as readline from "node:readline"

import { WORKFLOW_IO_TOOL_SCHEMAS } from "../src/drawmoon/workflow-io-tool-schemas.js"

const ROOT = resolve(process.env.WORKFLOW_WORKSPACE_ROOT ?? process.cwd())
const FLAT_WRITE_ONLY = process.env.WORKFLOW_FLAT_WRITE_ONLY === "1"
const READ_ROOTS = (process.env.WORKFLOW_ALLOWED_READ_ROOTS ?? "")
  .split(";")
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => resolve(p))

function isUnderRoot(abs: string, root: string): boolean {
  const normalized = resolve(abs)
  const base = resolve(root)
  return normalized === base || normalized.startsWith(`${base}${process.platform === "win32" ? "\\" : "/"}`)
}

function resolveReadPath(p: string): string {
  const trimmed = (p ?? "").trim()
  if (!trimmed) throw new Error("path required")
  const workspaceCandidate = resolve(ROOT, trimmed)
  // Prefer a real workspace file; only fall through to read roots when it's absent
  // so mount-name-prefixed relative paths (e.g. "audiorwkv/PRL/x.tex") resolve.
  if (isUnderRoot(workspaceCandidate, ROOT) && existsSync(workspaceCandidate)) return workspaceCandidate
  for (const readRoot of READ_ROOTS) {
    const candidates = isAbsolute(trimmed)
      ? [resolve(trimmed)]
      : [resolve(readRoot, trimmed), resolve(dirname(readRoot), trimmed)]
    for (const candidate of candidates) {
      if (isUnderRoot(candidate, readRoot) && existsSync(candidate)) return candidate
    }
  }
  // Nothing matched — return the workspace candidate so the caller surfaces a
  // clear ENOENT rooted at the workspace rather than a misleading path.
  if (isUnderRoot(workspaceCandidate, ROOT)) return workspaceCandidate
  throw new Error(
    `path outside allowed read roots (workspace=${ROOT}; read roots=${READ_ROOTS.join("; ") || "none"})`,
  )
}

function resolveWritePath(p: string): string {
  const trimmed = (p ?? "").trim()
  if (!trimmed) throw new Error("path required")
  const abs = resolve(ROOT, trimmed)
  if (!isUnderRoot(abs, ROOT)) throw new Error("path outside workspace write root")
  const rel = relative(ROOT, abs).replace(/\\/g, "/")
  if (FLAT_WRITE_ONLY && rel.includes("/")) {
    throw new Error("flat write only: path must be a root-level filename")
  }
  return abs
}

function isAbsolute(p: string): boolean {
  return /^([a-zA-Z]:[\\/]|\/)/.test(p)
}

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const TOOLS = WORKFLOW_IO_TOOL_SCHEMAS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}))

function handleCall(name: string, args: Record<string, string>) {
  if (name === "read_file") {
    const text = readFileSync(resolveReadPath(args.path ?? ""), "utf-8")
    return { content: [{ type: "text", text }], isError: false }
  }
  if (name === "write_file") {
    const dest = resolveWritePath(args.path ?? "")
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, args.content ?? "", "utf-8")
    return { content: [{ type: "text", text: `wrote ${relative(ROOT, dest)}` }], isError: false }
  }
  if (name === "list_dir") {
    const dir = resolveReadPath(args.path ?? ".")
    const names = readdirSync(dir).filter((n) => {
      try { return statSync(join(dir, n)).isFile() || statSync(join(dir, n)).isDirectory() } catch { return false }
    })
    return { content: [{ type: "text", text: names.join("\n") }], isError: false }
  }
  if (name === "copy_file") {
    const from = resolveWritePath(args.from ?? "")
    const to = resolveWritePath(args.to ?? "")
    if (!existsSync(from)) throw new Error(`source missing: ${args.from}`)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    return { content: [{ type: "text", text: `copied to ${relative(ROOT, to)}` }], isError: false }
  }
  throw new Error(`unknown tool: ${name}`)
}

function handleRequest(raw: string) {
  let req: { id?: number | string; method?: string; params?: { name?: string; arguments?: Record<string, string> } }
  try { req = JSON.parse(raw) as typeof req } catch { return }
  const { id, method, params } = req
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "workflow-io", version: "1.0.0" } } })
    return
  }
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } })
    return
  }
  if (method === "tools/call") {
    try {
      const result = handleCall(params?.name ?? "", params?.arguments ?? {})
      send({ jsonrpc: "2.0", id, result })
    } catch (err) {
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true } })
    }
    return
  }
  if (method === "ping") { send({ jsonrpc: "2.0", id, result: {} }); return }
  if (id !== undefined) send({ jsonrpc: "2.0", id, result: {} })
}

const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on("line", handleRequest)
