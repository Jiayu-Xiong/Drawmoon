export interface ToolParameterSpec {
  name: string
  type?: string
  required?: boolean
  description?: string
}

/** Static OpenCode builtin tool parameters (from vendor tool Effect Schema definitions). */
export const OPENCODE_TOOL_PARAMETERS: Record<string, ToolParameterSpec[]> = {
  bash: [
    { name: "command", type: "string", required: true, description: "The command to execute" },
    { name: "timeout", type: "number", required: false, description: "Optional timeout in milliseconds" },
    {
      name: "workdir",
      type: "string",
      required: false,
      description:
        "The working directory to run the command in. Defaults to the current directory. Use this instead of 'cd' commands.",
    },
    {
      name: "description",
      type: "string",
      required: true,
      description: "Clear, concise description of what this command does in 5-10 words.",
    },
  ],
  read: [
    {
      name: "filePath",
      type: "string",
      required: true,
      description: "The absolute path to the file or directory to read",
    },
    {
      name: "offset",
      type: "number",
      required: false,
      description: "The line number to start reading from (1-indexed)",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "The maximum number of lines to read (defaults to 2000)",
    },
  ],
  write: [
    { name: "content", type: "string", required: true, description: "The content to write to the file" },
    {
      name: "filePath",
      type: "string",
      required: true,
      description: "The absolute path to the file to write (must be absolute, not relative)",
    },
  ],
  edit: [
    { name: "filePath", type: "string", required: true, description: "The absolute path to the file to modify" },
    { name: "oldString", type: "string", required: true, description: "The text to replace" },
    {
      name: "newString",
      type: "string",
      required: true,
      description: "The text to replace it with (must be different from oldString)",
    },
    {
      name: "replaceAll",
      type: "boolean",
      required: false,
      description: "Replace all occurrences of oldString (default false)",
    },
  ],
  grep: [
    { name: "pattern", type: "string", required: true, description: "The regex pattern to search for in file contents" },
    {
      name: "path",
      type: "string",
      required: false,
      description: "The directory to search in. Defaults to the current working directory.",
    },
    {
      name: "include",
      type: "string",
      required: false,
      description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
    },
  ],
  glob: [
    { name: "pattern", type: "string", required: true, description: "The glob pattern to match files against" },
    {
      name: "path",
      type: "string",
      required: false,
      description:
        "The directory to search in. Omit for the current working directory. Must be a valid directory path if provided.",
    },
  ],
  list: [
    {
      name: "path",
      type: "string",
      required: false,
      description: "Directory path to list (defaults to workspace root)",
    },
  ],
  webfetch: [
    { name: "url", type: "string", required: true, description: "The URL to fetch content from" },
    {
      name: "format",
      type: "string",
      required: false,
      description: "The format to return the content in (text, markdown, or html). Defaults to markdown.",
    },
    { name: "timeout", type: "number", required: false, description: "Optional timeout in seconds (max 120)" },
  ],
  websearch: [
    { name: "query", type: "string", required: true, description: "Websearch query" },
    { name: "numResults", type: "number", required: false, description: "Number of search results to return (default: 8)" },
    {
      name: "livecrawl",
      type: "string",
      required: false,
      description:
        "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
    },
    {
      name: "type",
      type: "string",
      required: false,
      description: "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
    },
    {
      name: "contextMaxCharacters",
      type: "number",
      required: false,
      description: "Maximum characters for context string optimized for LLMs (default: 10000)",
    },
  ],
  patch: [
    {
      name: "patchText",
      type: "string",
      required: true,
      description: "The full patch text that describes all changes to be made",
    },
  ],
  task: [
    { name: "description", type: "string", required: true, description: "A short (3-5 words) description of the task" },
    { name: "prompt", type: "string", required: true, description: "The task for the agent to perform" },
    { name: "subagent_type", type: "string", required: true, description: "The type of specialized agent to use for this task" },
    {
      name: "task_id",
      type: "string",
      required: false,
      description: "Resume a previous task by passing its task_id instead of starting fresh",
    },
    { name: "command", type: "string", required: false, description: "The command that triggered this task" },
    {
      name: "background",
      type: "boolean",
      required: false,
      description: "Run the agent in the background. You will be notified when it completes.",
    },
  ],
  skill: [
    { name: "name", type: "string", required: true, description: "The name of the skill from available_skills" },
  ],
  todowrite: [
    { name: "todos", type: "array", required: true, description: "The updated todo list" },
  ],
  todoread: [],
  lsp: [
    { name: "operation", type: "string", required: true, description: "The LSP operation to perform" },
    { name: "filePath", type: "string", required: true, description: "The absolute or relative path to the file" },
    {
      name: "line",
      type: "number",
      required: true,
      description: "The line number (1-based, as shown in editors)",
    },
    {
      name: "character",
      type: "number",
      required: true,
      description: "The character offset (1-based, as shown in editors)",
    },
    {
      name: "query",
      type: "string",
      required: false,
      description: "Search query for workspaceSymbol. Empty string requests all symbols.",
    },
  ],
}

export function lookupOpencodeToolParameters(toolId: string): ToolParameterSpec[] | undefined {
  return OPENCODE_TOOL_PARAMETERS[toolId]
}
