# Agent 维护指南

面向人类与 AI 协作者：先读本文件定位模块，**只打开相关小文件**，避免通读大文件。

## 仓库布局

```
xy/
├── custom/workflow-frontend/   # SolidJS 控制台 UI（核心）
├── backend/opencode/           # 工作流运行时 + 内嵌上游 OpenCode
│   └── vendor/opencode/        # 上游 monorepo（packages/、README 等）
└── templates/                  # 可导入 JSON 模板
```

个人数据只在 `~/.drawmoon/`（实例 JSON、workflow 输出、registry、library）。**不要在 repo 内放 data/，不要启动时自动迁移。**

所有自定义 OpenCode 运行时代码只在 `backend/opencode/`；前端通过 `@opencode-ai/backend-opencode` 引用。

## 前端 `workflow-frontend/src/`

| 任务 | 读这些 |
|------|--------|
| HTTP 调用 / 类型 | `api/http-client.ts`，`api/types/*`，`api/*-api.ts` |
| 路径解析 | `lib/repo-paths.ts` |
| 工作流实例列表/详情 | `pages/console/slides/workflow-runs/` |
| 图编辑器 / AutoLayout | `components/workflow-layout/`，`viewport-fit.ts` |
| 节点 Tools 隔离 | `tool-constraints.ts`，`NodeToolsInspector` |
| 模板引导 | `data/bootstrap-templates.ts`，`../templates/` |
| 控制台样式 | `styles/console/base.css` → 各 `console-*.css` |

## 运行时 `backend/opencode/src/`

| 任务 | 读这些 |
|------|--------|
| HTTP 入口 | `server.ts` |
| 工作流执行 | `workflow-runs/runner.ts`，`workflow-runs/runner/*` |
| 实例存储 | `workflow-runs/store.ts`，`~/.drawmoon/runtime/workflow-runs/` |
| 路径解析 | `lib/monorepo-paths.ts` |
| drawmoon 路径 | `drawmoon/paths.ts` |

### `workflow-runs/runner/` 子模块

- `graph-scheduler.ts` — 拓扑波次、上游合并
- `node-config-enricher.ts` — final review 读文件注入 prompt
- `coercion.ts` — provider/mode/session 类型转换
- `runner-utils.ts` — 并行批处理、标签、history 清洗
- `usage-artifacts.ts` — token 汇总、artifact 引用
- `llm-api-media.ts` — 图像生成、媒体 artifact 落盘

## 环境变量

- `WORKFLOW_CWD` — 节点默认工作目录（`xy/` 根）
- `WORKFLOW_OUTPUT_ROOT` — 旧 run artifact 根目录
- `WF_PARALLEL_LIMIT` — 工作流节点并行上限（默认 2）

## 验证

```bash
cd xy/backend/opencode && bun run typecheck && bun test
cd xy/custom/workflow-frontend && bun run typecheck
```

烟雾测试：`cd xy/backend/opencode && bun run smoke:tool-isolation`
