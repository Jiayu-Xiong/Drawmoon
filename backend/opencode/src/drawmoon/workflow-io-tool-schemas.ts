export interface WorkflowIoToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export const WORKFLOW_IO_TOOL_SCHEMAS: WorkflowIoToolSchema[] = [
  {
    name: "read_file",
    description: "Read a UTF-8 file under the workflow workspace or allowed read roots.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "Write UTF-8 text to a path under the workspace write root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "list_dir",
    description: "List files in a workspace or allowed read directory.",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    name: "copy_file",
    description: "Copy a file within the workspace write root.",
    inputSchema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
      required: ["from", "to"],
    },
  },
]

const byName = new Map(WORKFLOW_IO_TOOL_SCHEMAS.map((tool) => [tool.name, tool]))

export function lookupWorkflowIoToolSchema(name: string): WorkflowIoToolSchema | undefined {
  return byName.get(name)
}
