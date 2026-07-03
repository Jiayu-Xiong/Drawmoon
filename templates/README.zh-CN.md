# 模板（Templates）

可导入的 JSON 入门模板，配合工作流控制台使用。**前端**（`custom/workflow-frontend`）是产品核心；这些文件演示如何注册 Agent Mode、LLM API 与工作流。

英文说明见 [`README.md`](README.md)。

## 前置条件

1. 启动后端：`cd backend/opencode && bun install && bun run dev -- --port 3456 --data-dir ./data`
2. 启动前端：`cd custom/workflow-frontend && bun install && bun run dev`
3. 打开 http://127.0.0.1:4322

运行会调用 LLM 的工作流前，请在环境中设置 `DEEPSEEK_API_KEY`（或对应服务商密钥）。

## 目录

| 目录 | 文件 | 说明 |
|------|------|------|
| `agent-mode/` | `opencode-chat-starter.json` | OpenCode 对话型 Agent 策略 |
| `llm-api/` | `deepseek-v4-flash-starter.json` | DeepSeek v4 flash HTTP 绑定 |
| `workflow/` | `opencode-deepseek-chat-starter.json` | 两节点共享会话对话示例 |

各子目录另有 README，说明对应面板的导入步骤。

## 推荐导入顺序

1. **LLM API** → `llm-api/deepseek-v4-flash-starter.json`
2. **Agent Mode** → `agent-mode/opencode-chat-starter.json`
3. **Workflow** → `workflow/opencode-deepseek-chat-starter.json`

工作流模板依赖 id `opencode-chat-starter` 与 `deepseek-v4-flash-starter`，请先导入前两项。

## 在界面中导入

| 类型 | 面板 | 操作 |
|------|------|------|
| Agent Mode | **Agent Modes** | 导入 JSON |
| LLM API | **LLM API** | 导入 JSON |
| Workflow | **Workflows** | 导入 JSON |

导入后在画布打开工作流，检查各节点的 **Agent Mode**、**LLM API** 与**工作目录**（可用环境变量 `WORKFLOW_CWD`），再执行运行。

## 内置模板（无需导入）

前端还内置模板（如 skill/MCP 隔离烟雾测试 `opencode-tool-isolation-smoke`）。在 **Workflows → Templates** 中选择；隔离测试需先在 **Tools** 安装探针实体。

## 进阶

- **工作目录**：开发时默认为 `xy/` 根目录；可用 `WORKFLOW_CWD` 覆盖。
- **持久化**：导入的模板通过后端注册表 API 存于 `~/.drawmoon/`。
- **示例**：`custom/examples/` 含更底层的运行时 JSON。
