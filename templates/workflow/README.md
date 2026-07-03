# Workflow template

Bundled JSON files here are **validated and copied by backend code** into `~/.drawmoon/templates/workflows/` on startup (`seedRepoWorkflowTemplates`). LLM template generation only outputs JSON text; it never writes disk.

## Files

| File | Description |
|------|-------------|
| [`opencode-deepseek-chat-starter.json`](opencode-deepseek-chat-starter.json) | Two-node shared-session chat smoke test |
| [`paper-journal-default.json`](paper-journal-default.json) | Full paper pipeline (intake → review loops → final PDF) |

## Regenerate bundled template (code only)

Source of truth for `paper-journal-default` is TypeScript (no LLM):

```bash
cd xy/backend/opencode
bun run scripts/emit-workflow-template.ts paper-journal-default
```

This validates with `template-validator` and writes `xy/templates/workflow/paper-journal-default.json`.

## Force re-copy to ~/.drawmoon

```bash
curl -X POST "http://127.0.0.1:3456/drawmoon/templates/workflows/seed?force=true"
```

## opencode-deepseek-chat-starter

A minimal **two-node** workflow:

1. **Greet** — fresh OpenCode chat session, short greeting
2. **Follow-up** — same session, asks the model to recall the first user message

Uses shared session `opencode-deepseek-chat-starter-session` to verify continuity.

## Before import

Import these first (same ids referenced in the workflow JSON):

1. [`../llm-api/deepseek-v4-flash-starter.json`](../llm-api/deepseek-v4-flash-starter.json)
2. [`../agent-mode/opencode-chat-starter.json`](../agent-mode/opencode-chat-starter.json)

Ensure `backend/opencode` and OpenCode CLI (`backend/opencode/vendor/opencode/packages/opencode`) are available.

## Load in UI

1. Open **Workflows**.
2. Import `opencode-deepseek-chat-starter.json`.
3. Open the canvas; check node bindings:
   - Agent Mode: `opencode-chat-starter`
   - LLM API: `deepseek-v4-flash-starter`
4. Set working directory if `.` is not your project root (`WORKFLOW_CWD` or per-node override).
5. Run the workflow.

## Built-in alternative

For skill/MCP isolation testing, use the built-in template **OpenCode Tool Isolation Smoke** (no JSON import). Install probes from **Tools** first.

中文：先导入 LLM API 与 Agent Mode，再在 **Workflows** 导入本 JSON。
