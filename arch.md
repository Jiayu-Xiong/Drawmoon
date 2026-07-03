# xy 项目架构与文件索引

> 生成目的：给维护者一张「每个文件干什么」的地图。  
> 上游 OpenCode monorepo 在 `backend/opencode/vendor/opencode/`，**只读**，下文仅说明边界，不逐文件枚举。

## 系统总览

```
浏览器  http://127.0.0.1:4322
    │  SolidJS  workflow-frontend
    │  /api/*  →  Vite proxy
    ▼
Hono  http://127.0.0.1:3456  backend/opencode
    │  workflow-runs、providers、drawmoon API
    ├── CLI 子进程（opencode / codex / copilot / kiro）
    └── ~/.drawmoon/  （模板、registry、runs、library）
```

| 层级 | 路径 | 职责 |
|------|------|------|
| 前端 UI | `custom/workflow-frontend/` | 控制台、模板编辑、run 监控、节点/CLI 状态 |
| 运行时 | `backend/opencode/src/` | HTTP API、工作流调度、provider 适配、drawmoon 路由 |
| 上游 | `backend/opencode/vendor/opencode/` | OpenCode 官方代码（禁止修改） |
| 个人数据 | `~/.drawmoon/` | workflow 模板 JSON、profiles、registry、输出目录 |
| Repo 模板 | `templates/` | 可导入的 starter JSON（非个性化大 workflow） |

---

## 根目录 `xy/`

| 文件 | 说明 |
|------|------|
| `agent.md` | AI 协作者规范：作用域、约束、**Agent 负责重启** |
| `arch.md` | 本文件：架构与文件索引 |
| `README.md` | 项目英文简介 |
| `WORKFLOW_README.md` / `.zh-CN.md` | 快速开始（前后端命令、端口） |
| `GITHUB_UPLOAD.md` | 上传 GitHub 说明 |
| `STYLES_FRONTEND_REFERENCE.md` | 前端样式参考 |
| `.gitignore` | 忽略 build 日志、本地 data 等 |

---

## `xy/templates/` — Repo 内可导入 JSON

| 文件 | 说明 |
|------|------|
| `README.md` / `README.zh-CN.md` | 导入顺序说明 |
| `agent-mode/opencode-chat-starter.json` | Agent mode starter |
| `llm-api/deepseek-v4-flash-starter.json` | LLM API starter |
| `workflow/opencode-deepseek-chat-starter.json` | 三节点 workflow starter |

---

## `xy/custom/` — 自定义产品代码

### `custom/AGENTS.md`

人类/AI 模块导航（与 `agent.md` 互补，偏「读哪些小文件」）。

### `custom/docs/`

| 文件 | 说明 |
|------|------|
| `architecture.md` | 英文架构图（分层概念） |
| `session-model.md` | Session / summary / files 三通道上下文 |
| `cache-model.md` | 节点缓存模式 |
| `node-schema.md` | 节点 schema |
| `provider-adapters.md` | Provider 适配说明 |
| `runbook.md` | 运维手册 |
| `security.md` | 安全注意 |
| `TODO.md` | 文档侧待办 |

### `custom/examples/`

示例 workflow / 节点 JSON（fork、cache、custom command 等）。

### `custom/opencode-plugin/`

| 文件 | 说明 |
|------|------|
| `src/index.ts` | OpenCode 插件：启动/连接 workflow 前端 |
| `package.json` / `tsconfig.json` | 插件包配置 |

### `custom/workflow-frontend/` — **产品核心（SolidJS + Vite）**

#### 配置与入口

| 文件 | 说明 |
|------|------|
| `package.json` | 依赖与 scripts（`dev` 默认 4322） |
| `vite.config.ts` | Dev server、`/api` → 3456 proxy |
| `tsconfig.json` | TS 配置 |
| `index.html` | SPA 入口 |
| `src/index.tsx` | 挂载 React/Solid 根 |
| `src/vite-env.d.ts` | Vite 类型 |

#### `src/api/` — HTTP 客户端

| 文件 | 说明 |
|------|------|
| `http-client.ts` | fetch 封装、离线断路器、退避 |
| `runtime-api.ts` | `/bootstrap`、`/cli/info`、drawmoon templates |
| `workflow-runs-api.ts` | CRUD runs、SSE stream |
| `commands-api.ts` | `/commands` |
| `llm-api.ts` | LLM chat、kuaipao、copilot bind |
| `drawmoon.ts` | drawmoon registry/library API |
| `index.ts` | 统一导出 |
| `types/cli.ts` | CLI 信息、LocalCliInfo |
| `types/runtime.ts` | RuntimeSnapshot |
| `types/workflow-runs.ts` | Run 记录、列表项 |
| `types/events.ts` | Run 生命周期事件 |
| `types/llm.ts` | LLM 请求类型 |

#### `src/runtime-bridge/` — 离 UI 线程的轮询

| 文件 | 说明 |
|------|------|
| `display-worker.ts` | Web Worker：`/bootstrap`、runs poll |
| `display-bridge.ts` | 主线程 ↔ worker |
| `workflow-run-stream.ts` | SSE 解析、live output |
| `index.ts` | 导出 |

#### `src/data/` — 前端领域模型与模板注册

| 文件 | 说明 |
|------|------|
| `console-model.ts` | WorkflowTemplate、WorkflowEntity 等核心类型 |
| `console-mock.ts` | agents 列表、paperTemplate proxy、空 entity 引导 |
| `bootstrap-templates.ts` | 启动注册表、drawmoon hydrate 触发 |
| `templates.ts` | 3 个 generic in-repo starter |
| `paper-template.ts` | 空 mock（真实 paper 在 drawmoon） |
| `template-converters.ts` | BaseTemplate → UI template |
| `workflow-template.ts` | Workflow 图辅助 |
| `workflow-runs/index.ts` | 本地 run 记录（非 runtime API） |
| `workflow-entity/index.ts` | **WorkflowEntityInstance**、entity 注册、drawmoon rebind |
| `workflow-entity/token-usage.ts` | Token 汇总 |
| `drawmoon/templates-sync.ts` | 从 backend 拉 workflow JSON 并 import |
| `drawmoon/registry-sync.ts` | CLI/agent/llm registry 从 drawmoon 同步 |
| `template-registry/registry.ts` | 通用模板 Map |
| `template-registry/workflow-ui-template.ts` | UI workflow 注册 |
| `template-registry/agent-mode-template.ts` | Agent mode 类 |
| `template-registry/cli-template.ts` | CLI 模板类 |
| `template-registry/llm-api-template.ts` | LLM API 模板类 |
| `template-registry/index.ts` | 导出 |
| `template-registry/rename.ts` | 模板重命名 |
| `agent-mode-templates/*.ts` | Builtin agent mode 定义 |
| `agent-mode-templates/index.ts` | 注册 builtin modes |
| `cli-templates/*.ts` | opencode/codex/copilot/kiro CLI 模板 |
| `cli-templates/index.ts` | 注册 |
| `cli-cascade.ts` | CLI → mode → model 级联 |
| `cli-agent-mode-seeder.ts` | CLI 与 agent mode 种子 |
| `llm-api-templates/*.ts` | Builtin LLM API 模板 |
| `node-llm-binding.ts` | 节点 LLM 绑定规范化 |
| `llm-api-bind/bootstrap.ts` | Copilot/kuaipao bind 启动 |
| `tool-constraints.ts` | 节点 tools 约束 |
| `tool-constraints.test.ts` | 单测 |
| `budget/estimate.ts` | Workflow 预算估算 |
| `session-utils.ts` / `session-groups.ts` / `session-board.ts` | Session 列、共享 session |
| `execution-flow.ts` | 执行祖先节点 |
| `opencode-derived-mode.ts` | 派生 opencode mode |
| `templates/*.ts` | **仅** generic/smoke 小模板（非个性化大 workflow） |
| `templates/workflows/index.ts` | workflow 模板 barrel |
| `templates/entities/index.ts` | entity barrel |

#### `src/pages/` — 路由级页面

| 文件 | 说明 |
|------|------|
| `ConsoleApp.tsx` | 旧入口别名 → console |
| `TemplatesView.tsx` | 模板 app 外壳 |
| `AgentModesView.tsx` | Agent mode 管理页 |
| `LlmApiView.tsx` | LLM API 管理页 |
| `CliView.tsx` | CLI 视图（legacy） |

#### `src/pages/console/` — 主控制台

| 文件 | 说明 |
|------|------|
| `ConsoleShell.tsx` | **根壳**：slide/app 导航、runtime 状态、CLI 轮询 |
| `navigation.ts` | View 枚举、hash 路由、motion 时长 |
| `runtime.ts` | RuntimeSnapshot → UI providers |
| `shared/core.tsx` | 导出模板/entity、workflowToRuntimeGraph |
| `layout/AppLauncher.tsx` | 底部 dock 按钮 |
| `layout/HomeSlideDeck.tsx` | 三栏 slide + 左右导航钮 |
| `apps/AppStage.tsx` | Editor/System/Tools/AgentModes/LlmApi 五页 |
| `apps/templates/EditorView.tsx` | 模板编辑器主逻辑 |
| `apps/templates/EditorTopBar.tsx` | 模板选择条 |
| `apps/templates/EditorOpsBar.tsx` | 导入/运行/布局工具条 |
| `apps/templates/EditorNodeInspector.tsx` | 节点属性面板 |
| `apps/templates/NodeSessionInspector.tsx` | Session 检查器 |
| `apps/templates/NodeToolsInspector.tsx` | Tools 检查器 |
| `apps/system/SystemView.tsx` | 系统/CLI 状态、Refresh |
| `apps/tools/ToolsView.tsx` | Library skills/MCP |
| `entities/EntitiesView.tsx` | 实体列表 |
| `slides/home/HomeView.tsx` | 首页任务卡片 |
| `slides/home/HomeTaskCard.tsx` | 单任务卡片 |
| `slides/workflow-runs/DetailView.tsx` | **Run 列表 + 详情** |
| `slides/workflow-runs/detail-nav.ts` | 详情 pane hash 状态 |
| `slides/workflow-runs/WorkflowInstance*.tsx` | 卡片、浏览器、详情、输出、Live |
| `slides/workflow-runs/workflow-run-detail-utils.ts` | Run 合并、生命周期 |
| `slides/workflow-runs/instance-utils.ts` | 实例列表合并 |
| `slides/workflow-runs/instance-canvas-template.ts` | 实例画布模板 |
| `slides/node-workflow/NodeDetailView.tsx` | 节点/CLI/API 总览 |
| `slides/node-workflow/CliDashboardCard.tsx` | 单 CLI 状态卡 |
| `slides/node-workflow/LlmApiStatusCard.tsx` | LLM API 状态卡 |
| `slides/node-workflow/TemplateDependencyTree.tsx` | 模板依赖树 |
| `slides/node-workflow/usage-stats/*` | Token 使用统计 |

#### `src/components/`

| 文件 | 说明 |
|------|------|
| `WorkflowTemplateCanvas.tsx` | 可编辑 workflow 画布 |
| `workflow-layout/*` | stage/session 布局、viewport fit |
| `SharedSessionsBoard.tsx` | Session 列视图 |
| `StreamingOutput.tsx` | 流式输出 |
| `TokenUsage*.tsx` | Token UI |
| `Icon.tsx` / `LanguageSwitch.tsx` / `MasonryColumns.tsx` | 通用 UI |

#### `src/styles/console/`

控制台样式分模块：`console-shell.css`、`console-nav.css`、`console-home-slide.css`、`console-stage.css`、`console-canvas.css`、`workflow-instances.css`、`workflow-run-detail.css` 等。

#### `src/ui-kit/`

Button、Panel、Item、motion（`switchPaneAttrs`）与 yuzu 设计 token。

#### `scripts/` — 开发/运维脚本

| 文件 | 说明 |
|------|------|
| `start-tmm-run.ts` | 从 drawmoon 启动 TMM run |
| `start-iclr-run.ts` | 启动 ICLR run |
| `resume-tmm-run.ts` | 恢复 TMM run |
| `resume-iclr-figures.ts` | 恢复 ICLR figures |
| `verify-tmm-stream.ts` | 验证 TMM SSE |

---

## `xy/backend/opencode/` — 工作流运行时

### 配置

| 文件 | 说明 |
|------|------|
| `package.json` | `dev`、`test`、`smoke:*` scripts |
| `tsconfig.json` | TS 配置 |
| `src/index.ts` | **进程入口**（`--port 3456 --data-dir`） |
| `README.md` / `TODO.md` | 后端说明 |

### `src/` — 自定义运行时（可改）

| 文件 | 说明 |
|------|------|
| `server.ts` | **Hono 主路由**：bootstrap、cli/info、nodes、drawmoon、workflow-runs mount |
| `runtime.ts` | AgentRuntime：单节点执行、provider 调度 |
| `session.ts` | Session 管理、upstream context |
| `cache.ts` | 节点结果缓存 |
| `trace.ts` | Trace 存储 |
| `cli-info.ts` | LocalCliInfo 快照与按 provider refresh |
| `cli-limits.ts` | CLI 并发限制 |
| `command-registry.ts` | Provider 命令绑定 |
| `opencode-telemetry.ts` | OpenCode usage 汇总 |

#### `src/drawmoon/`

| 文件 | 说明 |
|------|------|
| `paths.ts` | `~/.drawmoon` 各子目录路径 |
| `workflow-templates.ts` | 扫描/读取 workflow JSON |
| `profiles.ts` | Path alias profiles |
| `registry.ts` | cli/agent/llm registry 读写 |
| `library.ts` | Skills / MCP manifest |
| `routes.ts` | `/drawmoon/*` HTTP 路由 |
| `isolation-smoke-library.ts` | Tool isolation 种子库 |

#### `src/workflow-runs/`

| 文件 | 说明 |
|------|------|
| `index.ts` | createWorkflowRunSystem |
| `runner.ts` | **主编排**：executeRun、runNode、生命周期 |
| `runner/graph-scheduler.ts` | 波次调度、上游解析 |
| `runner/node-config-resolver.ts` | nodeAction、resolveNodeConfig |
| `runner/node-config-enricher.ts` | re-export context-bus |
| `runner/context-bus.ts` | 路径别名、enrichNodeConfig |
| `runner/run-llm-api-node.ts` | LLM API 节点流式执行 |
| `runner/llm-api-media.ts` | 图像/媒体 artifact |
| `runner/coercion.ts` | provider/mode/session  coercion |
| `runner/runner-utils.ts` | 并行批处理、sleep、strip history |
| `runner/usage-artifacts.ts` | Token、artifact refs |
| `routes.ts` | `/workflow-runs` REST + SSE |
| `store.ts` | Run 记录 JSON 存储 |
| `events.ts` | 事件 append / subscribe |
| `execution-queue.ts` | 单队列串行 run |
| `threads/execution-bridge.ts` | Worker 线程桥 |
| `threads/execution-worker.ts` | 执行 worker |
| `node-output-files.ts` | Markdown/PDF artifact 落盘 |
| `workspace-*.ts` | 工作区路径、seed、preflight |
| `workflow-output-route.ts` | `/workflow-output/*` 静态文件 |
| `types.ts` | Run 类型、生命周期事件 |

#### `src/providers/`

| 文件 | 说明 |
|------|------|
| `opencode.ts` | OpenCode CLI 适配 |
| `codex.ts` / `copilot.ts` / `kiro.ts` | 各 CLI |
| `custom.ts` / `openai.ts` | 通用/HTTP |
| `opencode-constraints.ts` | OpenCode tools 约束 |

#### `src/llm-api/`

统一 LLM HTTP 客户端、多协议 adapter、kuaipao、copilot bind。

#### `src/workflow-templates/`

Backend 内置 **小** workflow graph（smoke、kiro-chat、xuanhuan 等），非 drawmoon 大模板。

#### `src/agent-modes/`、`src/workflow-actions/`、`src/schema/`

Agent mode 解析、legacy node 归一化、共享 TS 类型。

#### `scripts/`

`tool-isolation-smoke.ts`、`install-vendor-opencode.ts` 等。

### `vendor/opencode/` — 上游（只读）

OpenCode 官方 monorepo（packages/opencode、packages/app、packages/desktop…）。  
xy 运行时通过 CLI 与子进程调用与之交互，**不在此目录做产品修改**。

---

## `~/.drawmoon/` — 个人数据（不在 Git）

| 路径 | 内容 |
|------|------|
| `templates/workflows/*.json` | 个性化 workflow（TMM、ICLR、journal-paper…） |
| `templates/nodes/` | 节点片段模板 |
| `templates/profiles/` | 路径别名（如 `tmm/`、`iclr2026/`） |
| `registry/` | cli/agent/llm 模板 registry 覆盖 |
| `library/` | Skills、MCP 配置 |
| `runtime/` | Backend data-dir、workflow-runs、cache |

---

## 关键数据流

### 模板加载

1. 前端 `ensureTemplateBootstrap()` → builtin 注册  
2. `hydrateDrawmoonWorkflowTemplates()` → `GET /drawmoon/templates/workflows`  
3. `importWorkflowUiTemplateFromJson` → `rebindWorkflowEntityTemplates()`  
4. `WorkflowEntityInstance.template` → `getWorkflowUiTemplate(templateId)`

### Run 执行

1. 前端 `startWorkflowRun` → `POST /workflow-runs`  
2. `runner.executeRun` → 波次 `runNode` → provider 或 `runLlmApiNode`  
3. SSE `/workflow-runs/:id/stream` → DetailView live UI  
4. `node_started` → backend 按 provider refresh CLI → 前端轮询 `/cli/info`

---

## 与旧文档关系

| 文档 | 用途 |
|------|------|
| **本文件 `arch.md`** | 全文件索引 + 目录边界 |
| `agent.md` | AI 约束与重启责任 |
| `custom/AGENTS.md` | 按任务找文件 |
| `custom/docs/architecture.md` | 英文概念架构图 |
| `WORKFLOW_README.zh-CN.md` | 人类快速开始 |

若文件增删，优先更新本文件对应小节与 `agent.md` 第 4 节导航表。
