# xy 项目 Agent 工作规范

面向 Cursor / Codex 等 AI 协作者。人类维护者可与 [`custom/AGENTS.md`](custom/AGENTS.md) 对照使用。

## 1. 作用域（硬约束）

| 允许 | 禁止 |
|------|------|
| 阅读、搜索 **`xy/`** 目录下全部内容 | 阅读或修改 `xy/` **以外** 的路径（含仓库根 `Agent/`、`rubbish/` 等） |
| 修改完成任务所**必需**的文件 | 顺手重构、改格式、增删无关文件 |
| 读 `backend/opencode/vendor/opencode/` 以理解上游行为 | **修改** vendor 内任何文件（只读） |

个人数据、工作流模板、registry、library **只在** `~/.drawmoon/`，**不得**写回 `xy/` 源码。

## 2. 软件工程约束（本次重构约定）

### 2.1 数据与模板边界

- **Repo 内**：通用 starter 模板、builtin agent-mode / cli / llm-api 注册表、框架代码。
- **`~/.drawmoon/`**：个性化 workflow JSON、node 模板、path alias profiles、registry 覆盖、run 输出、library skills/MCP。
- 前端通过 `GET /bootstrap`、`/drawmoon/templates/*` 拉取 drawmoon 数据；`hydrateDrawmoonWorkflowTemplates()` 成功后调用 `rebindWorkflowEntityTemplates()`。
- 禁止在 `workflow-frontend/src/data/templates/` 下新增大型硬编码论文/业务 workflow TS 文件。

### 2.2 文件体量

- 单文件超过 ~400 行且职责混杂时，**拆到同目录子模块**（例：`EditorView` → `EditorTopBar` / `EditorOpsBar` / `EditorNodeInspector`；`runner.ts` → `runner/node-config-resolver.ts`、`runner/run-llm-api-node.ts`）。
- 新逻辑优先**扩展已有小模块**，不要复制粘贴大段代码。

### 2.3 前后端契约

- 前端 API 基址：`/api`（Vite proxy → `127.0.0.1:3456`）。
- 启动聚合：`GET /bootstrap`（health、providers、commands、cliInfo、templates、drawmoonWorkflowTemplates）。
- 运行时离线：`http-client.ts` 断路器 + 指数退避；勿在 UI 线程并行打 7+ 个冷启动请求。
- CLI 状态：后端 `node_started` 按 provider 增量 refresh；workflow 结束全量 refresh；前端 running/refresh 期间轮询 `/cli/info`。

### 2.4 UI 导航与画布

- `ConsoleShell.go()` 不得在 motion 未完成时**静默丢弃**导航；应先 `finishMotion()` 再切换。
- Slide 页（home / detail / nodes）底部 App dock **保持可点**。
- **模板编辑器 autolayout**：节点坐标以 canvas **左上角 (32,32)** 为锚点（首卡 top-left）；默认视口 fit 用 `anchor-top-left`（固定缩放 ~82%），**不要** `contain` 缩到全图居中（大工作流会变成 10% _zoom）。
- **后端离线**：`bootstrapTemplateRegistry()` 必须探测 `/health`；模板页显示可见错误条，禁止静默只剩 loading。

### 2.5 改动纪律

- **最小 diff**：只解决当前任务，不匹配周边风格以外的“洁癖式”重写。
- **不主动** `git commit` / `git push`，除非用户明确要求。
- **不主动**写 README / 文档，除非用户要求或任务交付需要（本文件、`arch.md` 除外）。
- 改完 TypeScript 后在前端目录跑 `bun run build`；动 backend 时跑相关 `bun test`（自定义测试即可，不必修 vendor 全量失败）。

## 3. 服务启动与重启（Agent 负责，不由用户手动）

每次修改 **backend** 或 **frontend** 源码后，**由 Agent 在终端重启**，并在回复中给出可访问 URL。

### 3.1 端口

| 服务 | 目录 | 端口 |
|------|------|------|
| Backend runtime | `xy/backend/opencode` | **3456** |
| Frontend (Vite) | `xy/custom/workflow-frontend` | **4322** |

浏览器入口：**http://127.0.0.1:4322/**

### 3.2 Windows 重启流程（PowerShell）

```powershell
# 1. 释放端口（忽略错误）
foreach ($p in 3456, 4322) {
  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 1

# 2. Backend（后台）— 数据目录用 ~/.drawmoon/runtime，不要 ./data
Set-Location "<repo>\xy\backend\opencode"
Start-Process -NoNewWindow bun.cmd -ArgumentList "run","src/index.ts","--port","3456"

# 3. Frontend（后台）
Set-Location "<repo>\xy\custom\workflow-frontend"
Start-Process -NoNewWindow bun.cmd -ArgumentList "run","dev","--host","127.0.0.1","--port","4322"
```

Agent 在 Cursor 内优先用 **background Shell** 等价命令；重启后探测：

```powershell
Invoke-RestMethod http://127.0.0.1:3456/health
Invoke-WebRequest http://127.0.0.1:4322/ -UseBasicParsing | Select-Object StatusCode
Invoke-RestMethod http://127.0.0.1:3456/bootstrap | Select-Object -ExpandProperty drawmoonWorkflowTemplates
```

### 3.3 何时必须重启

| 变更位置 | 重启 |
|----------|------|
| `backend/opencode/src/**` | **Backend**（必须） |
| `custom/workflow-frontend/src/**`、Vite 配置 | **Frontend**（必须；HMR 不可靠时全量重启） |
| 仅 `xy/*.md` 文档 | 不必 |
| `~/.drawmoon/templates/**` | 仅 **Backend** 或前端刷新（F5）；不必改代码 |

## 4. 任务导航（先读小文件）

| 任务 | 入口文件 |
|------|----------|
| 总架构 | [`arch.md`](arch.md) |
| HTTP / 类型 | `custom/workflow-frontend/src/api/` |
| 控制台壳层 / 导航 | `pages/console/ConsoleShell.tsx`、`navigation.ts` |
| 工作流实例 UI | `pages/console/slides/workflow-runs/` |
| 模板编辑器 | `pages/console/apps/templates/` |
| 模板生成（粗描述→JSON） | `pages/console/apps/template-gen/`、[`template-generator-spec.md`](custom/docs/template-generator-spec.md)、`drawmoon/template-validator.ts` |
| drawmoon 同步 | `data/drawmoon/`、`backend/opencode/src/drawmoon/` |
| 工作流执行 | `backend/opencode/src/workflow-runs/runner.ts`、`runner/*` |
| HTTP 服务 | `backend/opencode/src/server.ts` |
| 上下文 / 路径别名 | `runner/context-bus.ts`、`drawmoon/profiles.ts` |

## 5. 验证清单（改完自查）

1. `cd xy/custom/workflow-frontend && bun run build` 通过  
2. Backend `/health` 200，`/bootstrap` 含 `drawmoonWorkflowTemplates`  
3. Frontend http://127.0.0.1:4322/ 200  
4. 用户可见变更已在浏览器路径上可验证  

---

详细文件清单见 [`arch.md`](arch.md)。更细的模块说明见 [`custom/AGENTS.md`](custom/AGENTS.md)、[`custom/docs/`](custom/docs/)（含 [`node-contract.md`](custom/docs/node-contract.md)、[`template-generator-spec.md`](custom/docs/template-generator-spec.md)）。
