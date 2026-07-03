# 工作流本地 Agent（xy）

基于 [OpenCode](https://github.com/anomalyco/opencode) 的**前端优先**工作流编排。SolidJS 控制台（`custom/workflow-frontend/`）是产品核心；`backend/opencode/` 为旁路 HTTP 运行时。

English: [WORKFLOW_README.md](WORKFLOW_README.md)

## 目录结构

```
xy/
  custom/workflow-frontend/   # SolidJS 前端（核心）
  backend/opencode/           # 工作流运行时（3456）+ 内嵌上游 OpenCode
    vendor/opencode/          # 上游 monorepo（packages/、多语言 README 等）
  templates/                  # 可导入的 Agent / LLM / 工作流 JSON
```

## 快速开始

### 1. 后端

```bash
cd backend/opencode
bun install
bun run dev -- --port 3456 --data-dir ./data
```

### 2. 前端

```bash
cd custom/workflow-frontend
bun install
bun run dev
```

浏览器打开 http://127.0.0.1:4322

### 3. 导入模板

按顺序导入 [`templates/`](templates/README.zh-CN.md)：

1. `templates/llm-api/deepseek-v4-flash-starter.json`
2. `templates/agent-mode/opencode-chat-starter.json`
3. `templates/workflow/opencode-deepseek-chat-starter.json`

运行前设置环境变量 `DEEPSEEK_API_KEY`。

## 环境变量

| 变量 | 用途 |
|------|------|
| `WORKFLOW_CWD` | 节点默认工作目录 |
| `DEEPSEEK_API_KEY` | DeepSeek 模板 |
| `KUAIPAO_API_KEY` | 可选第三方网关 |

本地注册表数据在 `~/.drawmoon/`，勿提交到 Git。

## 测试

```bash
cd backend/opencode
bun test
bun run smoke:tool-isolation
```

## 上传到 GitHub

见 [GITHUB_UPLOAD.md](GITHUB_UPLOAD.md)。
