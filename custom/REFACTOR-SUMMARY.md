# xy/custom 重构摘要（token 节约版）

> 入口不变：`start-xy.bat` → runtime `:3456` + frontend `:4322`  
> 行为不变：API 路径、工作流执行逻辑、UI 外观与交互保持一致，仅拆分模块与线程。

## 1. 前端 UI 模板化 (`workflow-frontend/src/ui-kit/`)

| 模块 | 类/组件 | CSS 库 | 职责 |
|------|---------|--------|------|
| `tokens/yuzu.css` | — | 设计令牌 | `--yuzu-*` 颜色/圆角/阴影 |
| `button/` | `Button` (`AppButton` 别名) | `button.css` | `.wf-button` 及 primary/danger/soft |
| `panel/` | `Panel` (`Glass` 别名) | `panel.css` | `.wf-glass` 玻璃面板 |
| `item/` | `ItemCard`, `ItemSummary` | `item.css` | `.entity-card` / `.wf-item` 列表项 |
| `motion/` | `switchPaneAttrs`, `MotionClass` | `motion.css` | `.wf-animate-in`、workflow 切换动效 |

**接入点**
- `styles/shared/index.css` 按序 `@import` ui-kit 样式
- `pages/console/shared/core.tsx` 从 `ui-kit` 再导出 `Glass`/`AppButton`，旧 import 无需改
- `createWorkflowEntitySwitch().switchAttrs()` 改用 `switchPaneAttrs()`

## 2. 后端执行线程 (`backend/opencode/src/workflow-runs/threads/`)

| 文件 | 线程 | 作用 |
|------|------|------|
| `execution-worker.ts` | Bun Worker | 持有独立 `WorkflowRunRunner`，执行 `runExecution()` |
| `execution-bridge.ts` | 主线程 | HTTP 快速返回；`enqueue` 后向 Worker 发 `execute/cancel/shutdown` |
| `runner.ts` | 主+Worker | `startWorkflowRun`/`retryNode` → bridge；`runExecution()` 供 Worker 调用 |

**不变**：store/events 仍文件落盘；`GET /workflow-runs` 可在执行中实时读取进度。

## 3. 前端展示线程 (`workflow-frontend/src/runtime-bridge/`)

| 文件 | 线程 | 作用 |
|------|------|------|
| `display-worker.ts` | Web Worker | 轮询 `/api/workflow-runs`、拉取 lite runtime 快照 |
| `display-bridge.ts` | 主线程 | `fetchWorkflowRunsInDisplayThread` / `startWorkflowRunsPoll` / `fetchRuntimeSnapshotInDisplayThread` |

**接入点**
- `DetailView.tsx`：列表加载与 3s 轮询改走 display worker
- `ConsoleShell.tsx`：`refreshRuntime()` 改走 display worker

## 4. 目录速查

```
xy/custom/
├── workflow-frontend/src/
│   ├── ui-kit/           # 前端 UI 库（css + 组件类）
│   └── runtime-bridge/   # 展示线程（Web Worker）
└── backend/opencode/src/workflow-runs/
    └── threads/          # 执行线程（Bun Worker）
```

## 5. 后续改 UI 时怎么省 token

- 改按钮/面板/卡片样式 → 只读 `ui-kit/*/ *.css`
- 改工作流轮询/刷新 → 只读 `runtime-bridge/`
- 改执行调度/取消 → 只读 `workflow-runs/threads/` + `runner.ts` 顶部 bridge 调用
- 业务页面（`pages/console/**`）逻辑未动，除非要换用 `ItemCard` 等新组件
