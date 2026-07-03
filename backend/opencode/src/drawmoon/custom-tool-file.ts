import type { ToolParameterSpec } from "../cli-probes/opencode-tool-parameters.js"

export type CustomToolKind = "delegate" | "opencode-plugin" | "spec-only"

function schemaType(param: ToolParameterSpec): string {
  switch (param.type) {
    case "number": return "number"
    case "boolean": return "boolean"
    case "array": return "array"
    case "object": return "object"
    default: return "string"
  }
}

function escapeString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/** Build OpenCode plugin tool source from metadata + execute body. */
export function generateOpencodeToolSource(input: {
  description: string
  parameters: ToolParameterSpec[]
  handlerCode: string
}): string {
  const trimmed = input.handlerCode.trim()
  if (/^import\s/m.test(trimmed) && /export\s+default\s+tool\s*\(/m.test(trimmed)) {
    return trimmed
  }

  const argsLines = input.parameters.map((param) => {
    const schemaCall = `tool.schema.${schemaType(param)}()`
    const desc = param.description ? `.describe("${escapeString(param.description)}")` : ""
    return `    ${param.name}: ${schemaCall}${desc},`
  })

  const body = trimmed.includes("\n")
    ? trimmed.split("\n").map((line) => `    ${line}`).join("\n")
    : `    ${trimmed}`

  return [
    'import { tool } from "@opencode-ai/plugin"',
    "",
    "export default tool({",
    `  description: ${JSON.stringify(input.description)},`,
    "  args: {",
    ...(argsLines.length ? argsLines : ["    // add parameters in library JSON"]),
    "  },",
    "  async execute(args) {",
    body,
    "  },",
    "})",
    "",
  ].join("\n")
}

export const CUSTOM_TOOL_PARAMETER_EXAMPLE: ToolParameterSpec[] = [
  { name: "path", type: "string", required: true, description: "File path under workspace" },
]

export const CUSTOM_TOOL_HANDLER_EXAMPLE = `const text = await Bun.file(args.path).text()
return text`
