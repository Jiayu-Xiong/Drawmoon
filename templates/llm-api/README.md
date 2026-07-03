# LLM API template

## File

- [`deepseek-v4-flash-starter.json`](deepseek-v4-flash-starter.json)

## What it does

Registers a **DeepSeek** OpenAI-compatible endpoint for workflow nodes:

| Field | Value |
|-------|-------|
| Endpoint | `https://api.deepseek.com/v1` |
| Model | `deepseek-v4-flash` |
| Wire protocol | `deepseek-chat` |
| API key env | `DEEPSEEK_API_KEY` |

## Load in UI

1. Export `DEEPSEEK_API_KEY` in your shell (never commit the key).
2. Open **LLM API** in the workflow console.
3. Import `deepseek-v4-flash-starter.json`.
4. Optional: click **Refresh** to merge live model metadata from the runtime.

## Pair with

- Agent mode: [`../agent-mode/opencode-chat-starter.json`](../agent-mode/opencode-chat-starter.json)
- Workflow: [`../workflow/opencode-deepseek-chat-starter.json`](../workflow/opencode-deepseek-chat-starter.json)

## Other providers

Duplicate this JSON and change `endpoint`, `model`, `wireProtocol`, and `apiKeyEnv` for OpenAI, Anthropic, or a private gateway.

中文：在 **LLM API** 面板导入；运行前设置 `DEEPSEEK_API_KEY`。
