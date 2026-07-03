# Agent Mode template

## File

- [`opencode-chat-starter.json`](opencode-chat-starter.json)

## What it does

Registers an **OpenCode chat** agent mode that:

- Uses CLI template `opencode-cli` (OpenCode in `backend/opencode/vendor/opencode/packages/opencode`)
- Leaves model selection to the workflow node (`workflow-selected`)
- Allows read-only tools by default (`read_file`, `artifact_link`)

## Load in UI

1. Open **Agent Modes** in the workflow console.
2. Click **Import** (or paste JSON).
3. Select `opencode-chat-starter.json`.
4. Confirm the new entry **OpenCode Chat (starter)** appears.

## Pair with

Import [`../llm-api/deepseek-v4-flash-starter.json`](../llm-api/deepseek-v4-flash-starter.json) and bind it on workflow nodes that use this agent mode.

## Customize

Edit fields before import or duplicate after import:

- `maxIterations`, `timeoutMs` — runtime limits
- `defaultSystemPrompt` — base system instruction
- `allowedTools` — add `write_file` / `skill` if your workflow needs them

中文：在 **Agent Modes** 面板导入本目录下的 JSON 即可。
