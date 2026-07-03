import { listBuiltinAgentModeSummaries } from "../agent-modes/catalog-summaries.js"
import { lookupOpencodeToolParameters, type ToolParameterSpec } from "../cli-probes/opencode-tool-parameters.js"
import { OPENCODE_BUILTIN_TOOLS } from "../cli-probes/opencode-strategy-schema.js"
import { loadBuiltinToolDescriptions } from "../cli-probes/opencode-vendor-snapshot.js"
import type { SystemToolMapping } from "../cli-probes/tool-mapping.js"
import { toolMappingCatalog } from "../cli-probes/tool-mapping.js"
import { readLibraryManifest } from "./library.js"
import { SYSTEM_LIBRARY_MCP_IDS, SYSTEM_PROBE_MCP_IDS, SYSTEM_PROBE_SKILL_IDS } from "./library-sources.js"
import { lookupWorkflowIoToolSchema, WORKFLOW_IO_TOOL_SCHEMAS } from "./workflow-io-tool-schemas.js"
import { lookupToolImplementation, type ToolImplementationSpec } from "./tool-implementations.js"
import { CUSTOM_TOOL_HANDLER_EXAMPLE, CUSTOM_TOOL_PARAMETER_EXAMPLE } from "./custom-tool-file.js"

export { SYSTEM_LIBRARY_MCP_IDS, SYSTEM_PROBE_MCP_IDS, SYSTEM_PROBE_SKILL_IDS }
export type { ToolImplementationSpec }

export const WORKFLOW_IO_MCP_TOOLS = WORKFLOW_IO_TOOL_SCHEMAS.map((tool) => ({
  id: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  parameters: parametersFromInputSchema(tool.inputSchema),
}))

export interface CatalogToolRow {
  id: string
  name: string
  description?: string
  descriptionPreview?: string
  systemToolId: string
  opencodeToolId: string | null
  source: SystemToolMapping["source"]
  vendorSource?: string
  parameters?: ToolParameterSpec[]
  inputSchema?: Record<string, unknown>
  mappedOpencodeParameters?: ToolParameterSpec[]
  implementation?: ToolImplementationSpec
}

function preview(text: string | undefined, max = 160): string | undefined {
  if (!text) return undefined
  const line = text.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? text.trim()
  return line.length > max ? `${line.slice(0, max)}…` : line
}

function parametersFromInputSchema(schema: Record<string, unknown>): ToolParameterSpec[] {
  const props = schema.properties as Record<string, { type?: string; description?: string }> | undefined
  if (!props) return []
  const required = new Set((schema.required as string[] | undefined) ?? [])
  return Object.entries(props).map(([name, spec]) => ({
    name,
    type: spec.type,
    required: required.has(name),
    description: spec.description,
  }))
}

function attachOpencodeParameters(
  row: Omit<CatalogToolRow, "parameters" | "inputSchema" | "mappedOpencodeParameters">,
  opencodeToolId: string | null,
): CatalogToolRow {
  const parameters = opencodeToolId ? lookupOpencodeToolParameters(opencodeToolId) : undefined
  return {
    ...row,
    ...(parameters?.length ? { parameters } : {}),
  }
}

function withImplementation(row: CatalogToolRow): CatalogToolRow {
  if (row.implementation) return row
  const implementation = lookupToolImplementation(row.systemToolId, row.opencodeToolId)
  return implementation ? { ...row, implementation } : row
}

function enrichSystemToolRow(tool: SystemToolMapping, descriptions: Record<string, { text: string }>): CatalogToolRow {
  const base: CatalogToolRow = {
    id: tool.systemToolId,
    name: tool.systemToolId,
    systemToolId: tool.systemToolId,
    opencodeToolId: tool.opencodeToolId,
    source: tool.source,
    description: tool.description,
    descriptionPreview: tool.description,
  }

  const workflowIo = lookupWorkflowIoToolSchema(tool.systemToolId)
  if (workflowIo) {
    base.inputSchema = workflowIo.inputSchema
    base.parameters = parametersFromInputSchema(workflowIo.inputSchema)
    base.description = base.description ?? workflowIo.description
    base.descriptionPreview = base.descriptionPreview ?? preview(workflowIo.description)
  } else if (tool.opencodeToolId) {
    const mapped = lookupOpencodeToolParameters(tool.opencodeToolId)
    if (mapped?.length) base.parameters = mapped
    const vendor = descriptions[tool.opencodeToolId]
    if (vendor?.text) {
      base.description = vendor.text
      base.descriptionPreview = preview(vendor.text)
    }
  }

  if (workflowIo && tool.opencodeToolId) {
    const mapped = lookupOpencodeToolParameters(tool.opencodeToolId)
    if (mapped?.length) base.mappedOpencodeParameters = mapped
  }

  return withImplementation(base)
}

/** Workflow system tools + OpenCode builtins in one list (no duplicate mapping targets). */
export function buildUnifiedSystemToolsCatalog(): CatalogToolRow[] {
  const descriptions = loadBuiltinToolDescriptions()
  const systemRows = toolMappingCatalog().systemTools.map((tool) => enrichSystemToolRow(tool, descriptions))
  const opencodeRows = buildOpencodeToolsCatalog()
  const systemIds = new Set(systemRows.map((row) => row.systemToolId))
  const mappedOpencodeIds = new Set(
    systemRows.map((row) => row.opencodeToolId).filter((id): id is string => Boolean(id)),
  )
  const extras = opencodeRows.filter((row) => !systemIds.has(row.id) && !mappedOpencodeIds.has(row.id))
  return [...systemRows, ...extras].map(withImplementation).sort((a, b) => a.systemToolId.localeCompare(b.systemToolId))
}

export function buildOpencodeToolsCatalog(): CatalogToolRow[] {
  const descriptions = loadBuiltinToolDescriptions()
  return OPENCODE_BUILTIN_TOOLS.map((id) => {
    const desc = descriptions[id]
    return attachOpencodeParameters(
      {
        id,
        name: id,
        systemToolId: id,
        opencodeToolId: id,
        source: "opencode-native",
        description: desc?.text,
        descriptionPreview: preview(desc?.text),
        vendorSource: desc?.source,
      },
      id,
    )
  })
}

export function listCustomToolCatalogRows(): CatalogToolRow[] {
  return (readLibraryManifest().tools ?? []).map((tool) => {
    const parameters = tool.parameters?.length
      ? tool.parameters
      : tool.inputSchema
        ? parametersFromInputSchema(tool.inputSchema)
        : undefined
    const kind = tool.kind ?? (tool.handlerCode ? "opencode-plugin" : tool.opencodeToolId ? "delegate" : "spec-only")
    const tsRel = tool.sourceFile?.replace(/^.*\.drawmoon[/\\]/, "~/.drawmoon/")

    const implementation: ToolImplementationSpec = kind === "opencode-plugin"
      ? {
          runtime: "opencode-vendor",
          summary: "OpenCode plugin tool — synced to workspace .opencode/tools/ at run time. Add this tool id to agent allowedTools.",
          steps: [
            `Library JSON: ${tool.path.replace(/^.*\.drawmoon[/\\]/, "~/.drawmoon/")}`,
            tsRel ? `Generated source: ${tsRel}` : "No .ts source file yet — add handler code and save again.",
            "On opencode run, drawmoon copies the .ts file into the workspace .opencode/tools/ directory.",
            "LLM calls the tool using the parameters schema below.",
          ],
          sourceFiles: [
            { path: tool.path.replace(/^.*\.drawmoon[/\\]/, "~/.drawmoon/"), role: "Metadata JSON" },
            ...(tsRel ? [{ path: tsRel, role: "OpenCode plugin tool" }] : []),
            { path: "<workspace>/.opencode/tools/" + `${tool.id}.ts`, role: "Runtime copy" },
          ],
          handlerCode: tool.handlerCode,
          opencodeBuiltin: tool.id,
        }
      : {
          runtime: kind === "delegate" ? "hybrid" : "static",
          summary: kind === "delegate"
            ? `Delegates to OpenCode builtin "${tool.opencodeToolId}" via custom tool registry.`
            : "Specification-only custom tool id for agent allowedTools (no generated handler).",
          steps: [
            `Library entry: ${tool.path.replace(/^.*\.drawmoon[/\\]/, "~/.drawmoon/")}`,
            tool.opencodeToolId
              ? `Add "${tool.id}" or mapped OpenCode id to allowedTools; runtime uses "${tool.opencodeToolId}".`
              : `Add "${tool.id}" to agent allowedTools.`,
          ],
          sourceFiles: [{ path: tool.path.replace(/^.*\.drawmoon[/\\]/, "~/.drawmoon/"), role: "Custom tool JSON" }],
          opencodeBuiltin: tool.opencodeToolId ?? undefined,
        }

    const row: CatalogToolRow = {
      id: tool.id,
      name: tool.name,
      systemToolId: tool.id,
      opencodeToolId: kind === "delegate" ? (tool.opencodeToolId ?? null) : null,
      source: "custom" as const,
      description: tool.description,
      descriptionPreview: tool.description,
      parameters,
      inputSchema: tool.inputSchema,
      implementation,
      kind,
    }

    if (kind === "delegate" && tool.opencodeToolId) {
      const mapped = lookupOpencodeToolParameters(tool.opencodeToolId)
      if (mapped?.length) row.mappedOpencodeParameters = mapped
    }

    return withImplementation(row)
  })
}

export { CUSTOM_TOOL_HANDLER_EXAMPLE, CUSTOM_TOOL_PARAMETER_EXAMPLE }

export function buildToolCatalog() {
  const mapping = toolMappingCatalog()
  const opencodeTools = buildOpencodeToolsCatalog()
  const customTools = listCustomToolCatalogRows()
  const descriptions = loadBuiltinToolDescriptions()
  const unifiedSystemTools = buildUnifiedSystemToolsCatalog()
  return {
    unifiedSystemTools,
    opencodeTools,
    systemTools: mapping.systemTools.map((tool) => enrichSystemToolRow(tool, descriptions)),
    customTools,
    opencodeNativeTools: mapping.opencodeNativeTools.map((tool) =>
      attachOpencodeParameters(
        {
          ...tool,
          id: tool.systemToolId,
          name: tool.systemToolId,
          descriptionPreview: tool.description,
        },
        tool.opencodeToolId,
      ),
    ),
    workflowIoTools: WORKFLOW_IO_MCP_TOOLS,
    agentModeBindings: listBuiltinAgentModeSummaries(),
    systemLibraryIds: {
      mcp: [...SYSTEM_LIBRARY_MCP_IDS, ...SYSTEM_PROBE_MCP_IDS],
      skills: [...SYSTEM_PROBE_SKILL_IDS],
    },
  }
}
