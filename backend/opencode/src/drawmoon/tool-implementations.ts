import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import { vendoredOpencodeCliDir } from "../lib/monorepo-paths.js"

export interface ToolImplementationSpec {
  /** Primary runtime channel */
  runtime: "mcp" | "opencode-vendor" | "static" | "hybrid"
  summary: string
  steps: string[]
  sourceFiles: Array<{ path: string; role: string }>
  handlerCode?: string
  mcpServer?: string
  opencodeBuiltin?: string
  envVars?: string[]
}

const VENDOR_TOOL_SOURCE: Record<string, string> = {
  bash: "src/tool/shell.ts",
  read: "src/tool/read.ts",
  write: "src/tool/write.ts",
  edit: "src/tool/edit.ts",
  grep: "src/tool/grep.ts",
  glob: "src/tool/glob.ts",
  list: "src/tool/read.ts",
  webfetch: "src/tool/webfetch.ts",
  websearch: "src/tool/websearch.ts",
  task: "src/tool/task.ts",
  skill: "src/tool/skill.ts",
  todowrite: "src/tool/todo.ts",
  todoread: "src/tool/todo.ts",
  lsp: "src/tool/lsp.ts",
  patch: "src/tool/apply_patch.ts",
}

const WORKFLOW_IO_HANDLERS: Record<string, string> = {
  read_file: `resolveReadPath(path) → readFileSync(abs, "utf-8") → MCP text content
// path must be under WORKFLOW_WORKSPACE_ROOT or WORKFLOW_ALLOWED_READ_ROOTS`,
  write_file: `resolveWritePath(path) → mkdirSync(parent) → writeFileSync(abs, content, "utf-8")`,
  list_dir: `resolveReadPath(path) → readdirSync + stat filter → newline-separated names`,
  copy_file: `resolveWritePath(from/to) → copyFileSync within workspace write root`,
}

const WORKFLOW_IO_MCP = {
  path: "xy/backend/opencode/scripts/mcp-workflow-io.ts",
  serverId: "workflow-io",
  libraryMcp: "~/.drawmoon/library/mcp/workflow-io.json",
}

function vendorExcerpt(rel: string, maxLines = 14): string | undefined {
  const abs = join(vendoredOpencodeCliDir(), rel)
  if (!existsSync(abs)) return undefined
  const lines = readFileSync(abs, "utf-8").split("\n")
  const execIdx = lines.findIndex((l) => /execute:\s*\(/.test(l))
  if (execIdx < 0) return lines.slice(0, Math.min(maxLines, lines.length)).join("\n")
  return lines.slice(execIdx, execIdx + maxLines).join("\n")
}

function hybridWorkflowIo(toolId: string, opencodeBuiltin: string): ToolImplementationSpec {
  return {
    runtime: "hybrid",
    summary: `${toolId} is listed in agent allowedTools; runtime enables OpenCode ${opencodeBuiltin} and, when workflow-io MCP is forced, exposes ${toolId} as an MCP tool.`,
    steps: [
      `Agent mode allowedTools includes "${toolId}".`,
      `applyToolConstraintsToOpencodeConfig normalizes ${toolId} → ${opencodeBuiltin} (tool-mapping.ts).`,
      `When forcedMcpServers includes workflow-io, OpenCode attaches MCP server; LLM may call MCP tools/call "${toolId}".`,
      `MCP handler: ${WORKFLOW_IO_HANDLERS[toolId] ?? "see mcp-workflow-io.ts"}`,
    ],
    sourceFiles: [
      { path: WORKFLOW_IO_MCP.path, role: "MCP stdio server + handler" },
      { path: WORKFLOW_IO_MCP.libraryMcp, role: "Library MCP config" },
      { path: `vendor/opencode/packages/opencode/${VENDOR_TOOL_SOURCE[opencodeBuiltin] ?? `src/tool/${opencodeBuiltin}.ts`}`, role: `OpenCode ${opencodeBuiltin} builtin` },
      { path: "xy/backend/opencode/src/cli-probes/tool-mapping.ts", role: "Workflow id → OpenCode id" },
      { path: "xy/backend/opencode/src/providers/opencode-constraints.ts", role: "Normalize + inject MCP env" },
    ],
    handlerCode: WORKFLOW_IO_HANDLERS[toolId],
    mcpServer: WORKFLOW_IO_MCP.serverId,
    opencodeBuiltin,
    envVars: ["WORKFLOW_WORKSPACE_ROOT", "WORKFLOW_ALLOWED_READ_ROOTS", "WORKFLOW_FLAT_WRITE_ONLY"],
  }
}

function opencodeVendor(toolId: string): ToolImplementationSpec {
  const rel = VENDOR_TOOL_SOURCE[toolId] ?? `src/tool/${toolId}.ts`
  return {
    runtime: "opencode-vendor",
    summary: `OpenCode vendor builtin "${toolId}" — executed inside opencode run by Effect-based Tool.define handler.`,
    steps: [
      `allowedTools / forcedTools includes "${toolId}" (or alias normalized to it).`,
      "opencode-native-defaults toggles tool permission in generated OPENCODE_CONFIG_CONTENT.",
      `OpenCode agent invokes vendor tool ${toolId} with JSON parameters.`,
    ],
    sourceFiles: [
      { path: `vendor/opencode/packages/opencode/${rel}`, role: "Tool.define + execute" },
      { path: `vendor/opencode/packages/opencode/src/tool/${toolId}.txt`, role: "LLM tool description" },
    ],
    handlerCode: vendorExcerpt(rel),
    opencodeBuiltin: toolId,
  }
}

function staticTool(summary: string, steps: string[], sources: ToolImplementationSpec["sourceFiles"]): ToolImplementationSpec {
  return { runtime: "static", summary, steps, sourceFiles: sources }
}

const IMPLEMENTATIONS: Record<string, ToolImplementationSpec> = {
  read_file: hybridWorkflowIo("read_file", "read"),
  write_file: hybridWorkflowIo("write_file", "write"),
  edit_file: {
    ...hybridWorkflowIo("edit_file", "edit"),
    summary: "Workflow edit_file maps to OpenCode edit (search/replace). No dedicated workflow-io MCP tool — uses OpenCode edit builtin.",
    handlerCode: vendorExcerpt("src/tool/edit.ts"),
    steps: [
      'allowedTools includes "edit_file" → normalized to OpenCode "edit".',
      "LLM passes filePath, oldString, newString, optional replaceAll.",
      "OpenCode edit tool applies in-place file patch via vendor edit.ts.",
    ],
  },
  list_dir: hybridWorkflowIo("list_dir", "list"),
  copy_file: {
    runtime: "mcp",
    summary: "copy_file runs only via workflow-io MCP (no OpenCode builtin alias).",
    steps: [
      'forcedMcpServers must include "workflow-io".',
      'MCP tools/call "copy_file" with from/to under workspace write root.',
      WORKFLOW_IO_HANDLERS.copy_file!,
    ],
    sourceFiles: [
      { path: WORKFLOW_IO_MCP.path, role: "Handler" },
      { path: WORKFLOW_IO_MCP.libraryMcp, role: "MCP config" },
    ],
    handlerCode: WORKFLOW_IO_HANDLERS.copy_file,
    mcpServer: WORKFLOW_IO_MCP.serverId,
    envVars: ["WORKFLOW_WORKSPACE_ROOT", "WORKFLOW_FLAT_WRITE_ONLY"],
  },
  latex_patch: {
    runtime: "hybrid",
    summary: "latex_patch → OpenCode patch (apply_patch) for structured diff application.",
    steps: [
      'allowedTools "latex_patch" → OpenCode "patch".',
      "LLM sends patchText (unified patch format).",
      "Vendor apply_patch.ts parses and applies file changes.",
    ],
    sourceFiles: [
      { path: "vendor/opencode/packages/opencode/src/tool/apply_patch.ts", role: "OpenCode patch" },
      { path: "xy/backend/opencode/src/cli-probes/tool-mapping.ts", role: "Mapping" },
    ],
    handlerCode: vendorExcerpt("src/tool/apply_patch.ts"),
    opencodeBuiltin: "patch",
  },
  artifact_link: {
    runtime: "hybrid",
    summary: "artifact_link is a workflow prompt convention; runtime maps to OpenCode read for linked artifact paths.",
    steps: [
      'allowedTools "artifact_link" → OpenCode "read".',
      "Upstream context injects artifact paths into the prompt.",
      "Agent uses read to fetch linked files.",
    ],
    sourceFiles: [
      { path: "xy/backend/opencode/src/workflow-runs/context/delivery/input-descriptor.ts", role: "Artifact path hints" },
      { path: "vendor/opencode/packages/opencode/src/tool/read.ts", role: "OpenCode read" },
    ],
    opencodeBuiltin: "read",
    handlerCode: vendorExcerpt("src/tool/read.ts", 10),
  },
  shell_metadata: {
    runtime: "hybrid",
    summary: "shell_metadata → OpenCode bash for metadata/shell probes in workflow nodes.",
    steps: [
      'allowedTools "shell_metadata" → OpenCode "bash".',
      "LLM runs shell command with description + optional workdir/timeout.",
      "Vendor shell.ts spawns process and captures stdout/stderr.",
    ],
    sourceFiles: [{ path: "vendor/opencode/packages/opencode/src/tool/shell.ts", role: "OpenCode bash" }],
    handlerCode: vendorExcerpt("src/tool/shell.ts"),
    opencodeBuiltin: "bash",
  },
  latex_build: staticTool(
    "LaTeX compile — workflow invokes shell (bash) with user-defined build command, not a separate MCP tool.",
    ["Node/runtime supplies compile command via prompt or bash tool.", "Maps to OpenCode bash when in allowedTools."],
    [{ path: "xy/backend/opencode/src/cli-probes/tool-mapping.ts", role: "latex_build → bash mapping" }],
  ),
  pdf_audit: staticTool(
    "PDF layout audit — workflow static tool; uses OpenCode read on PDF/binary attachments.",
    ["Agent reads PDF via OpenCode read (supports PDF attachments).", "Audit logic lives in agent prompt / skill."],
    [{ path: "vendor/opencode/packages/opencode/src/tool/read.ts", role: "PDF read path" }],
  ),
  review_json: staticTool(
    "Structured JSON review output — no tool call; agent emits JSON in message per prompt contract.",
    ["Listed in allowedTools as capability flag.", "Output validated by workflow node outputContract."],
    [{ path: "xy/backend/opencode/src/workflow-runs/context/archetypes.ts", role: "Archetype defaults" }],
  ),
  codex_exec: staticTool(
    "Codex CLI exec — routed to codex provider, not OpenCode.",
    ["Uses codex provider adapter instead of opencode run."],
    [{ path: "xy/backend/opencode/src/providers/codex.ts", role: "Codex provider" }],
  ),
  copilot_chat: staticTool(
    "Copilot CLI chat — routed to copilot provider.",
    ["Uses copilot provider adapter."],
    [{ path: "xy/backend/opencode/src/providers/copilot.ts", role: "Copilot provider" }],
  ),
  web_search: {
    ...opencodeVendor("webfetch"),
    summary: "web_search workflow id maps to OpenCode webfetch at runtime.",
    steps: [
      'allowedTools "web_search" → OpenCode "webfetch".',
      "LLM passes url + optional format/timeout.",
    ],
    opencodeBuiltin: "webfetch",
  },
}

for (const id of ["glob", "list", "grep", "webfetch", "websearch", "task", "skill", "todowrite", "todoread", "lsp", "patch", "bash", "read", "write", "edit"]) {
  if (!IMPLEMENTATIONS[id]) IMPLEMENTATIONS[id] = opencodeVendor(id)
}

export function lookupToolImplementation(systemToolId: string, opencodeToolId?: string | null): ToolImplementationSpec | undefined {
  if (IMPLEMENTATIONS[systemToolId]) return IMPLEMENTATIONS[systemToolId]
  const oc = opencodeToolId ?? systemToolId
  return IMPLEMENTATIONS[oc] ?? (VENDOR_TOOL_SOURCE[oc] ? opencodeVendor(oc) : undefined)
}
