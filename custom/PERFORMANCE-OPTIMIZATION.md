# xy/custom 性能优化方案

> 实测环境：9950X / Windows / Bun 1.3.14  
> 模板：`opencode-xuanhuan-novel-4ch-image`（gpt-5.5 计划 → deepseek 四章并行 → gpt-5.5 终审 → 封面图）  
> 最近实测：2026-06-23 Run `01KVTQYJAP524R3XKZVYRFW9TZ`（stream 修复后）

## 实测结论（CPU / 子进程 / API / 流式）

| 指标 | 观测值 | 说明 |
|------|--------|------|
| master-plan (gpt-5.5) | ~170s，progress 一直 0% | **瓶颈在 LLM 等待**，本地 bun CPU 累计 ~12s/6 进程/3min |
| 执行 Worker RSS | 85MB → 160MB（单测）/ ~230MB（长跑） | 节点启动时跳变，HTTP 仍 <10ms |
| bun 子进程数 | 5–7 | 主服务 + 执行 Worker + 监控/模拟脚本 |
| **Stream 修复前** | 仅 replay 前 3 条 lifecycle | Worker 写文件、主线程 `subscribe` 内存监听 → **实时事件丢失** |
| **Stream 修复后** | `node_completed` + `progress` + `stdout` <300ms | `events.ts` 改为 NDJSON 文件 tail poll |
| 轮询（3s） | 长节点期间 0 次 UI 更新 | 仅 `%` 跳变时刷新（master-plan 阶段 171s 仅 1 次） |
| Token 统计 | `run-results` + byNode + cache | master-plan ~16k；两章后 total ~650k（cache read 占大头） |

### CPU 异常来源（已定位）

1. **非 LLM 的本地 CPU 并不高**（9950X 上 bun 合计 CPU 秒数个位数/分钟）。用户感知的「卡」主要来自 **progress% 阶梯更新** + **无中间反馈**。
2. **轮询风暴（i3 上最严重）**：多客户端 list+detail 双请求；`LIST_CACHE_TTL=2s` 曾掩盖 index 更新（已用 mtime 失效修复）。
3. **Store 缓存跨 Worker 过期（已修）**：主线程 `get()` 5s 内返回 Worker 写入前的旧 record → 轮询/stream 刷新 detail 延迟。现按 **文件 mtime** 失效。
4. **Stream 跨 Worker 断裂（已修）**：执行在 Bun Worker，`FileWorkflowRunEventLog.subscribe` 仅内存回调，主线程 HTTP stream 收不到 stdout/progress。
5. **章节并发上限 2**：`WF_PARALLEL_LIMIT` 默认 2；9950X 可设 4，i3 建议 1。

LLM API 耗时占 **>95%** 墙钟时间；优化本地 CPU 无法显著缩短总时长，但能大幅改善 **实时可见性** 与 i3 可接受性。

---

## 上下文与多 LLM 路由（模板验证）

| 节点 | sessionPolicy | contextMode | LLM |
|------|---------------|-------------|-----|
| master-plan | **shared** (`opencode-xuanhuan-book-plan`) | fresh | gpt-5.5 (kuaipao) |
| chapter-1..4 | **fork** | fork（边来自 master-plan） | deepseek-v4-flash |
| final-review | fresh | fresh + readRunFiles | gpt-5.5 |
| generate-cover | fresh | summary（上游 final-review） | gpt-image-2 |

events 中可见 `policy:"shared"` + `sessionKey:"opencode-xuanhuan-book-plan"`；四章 `node_started` 并行 2+2；终审读 `chapter-*.md` 文件。**配置正确**。

---

## P0 — 已完成

- [x] display-worker 空闲自动停轮询
- [x] 列表 API `currentNodeIds` + `activeAgents`
- [x] `wfMonitor` 调试埋点（`WF_DEBUG_MONITOR=1`）
- [x] 前端 `streamWorkflowRun` + DetailView 订阅
- [x] Token：OpenCode session SQLite → `history.usage.byNode`（含 cache read/write）
- [x] LLM API 节点 `unifiedChatCompletionStream`
- [x] **events.ts 文件 tail subscribe**（Worker → 主线程 stream）
- [x] **store.ts mtime 缓存失效**（Worker 写入后主线程立即可读）

## P1 — 低端机（i3）优先

1. **以 stream 为主、轮询为 fallback**（DetailView 已订阅 stream；列表 poll 8s）。
2. **合并轮询**：仅选中 run 才 `GET .../id`；列表单请求。
3. **动态并发**：`WF_PARALLEL_LIMIT=1`（i3）/ `4`（9950X）。
4. **running 时降低 LIST_CACHE_TTL** 或 index mtime 失效（已部分实现）。

## P2 — 9950X 可选

1. `WF_PARALLEL_LIMIT=4` 四章一次跑满。
2. 执行 Worker 池（多 run 队列）。
3. `cli/info` 与 workflow 轮询解耦（30s vs 3–8s）。

## P3 — 架构

1. 细粒度 progress：`node_started` 推 sub-progress（tool 计数），不必等节点完成。
2. 注册纯文本版 `opencode-xuanhuan-novel-4ch`。
3. 重启后 queued/running 自动续跑。

---

## 推荐环境变量

```bat
REM i3 / 低压机器
set WF_PARALLEL_LIMIT=1
set WF_POLL_MS=5000
set WF_STREAM_POLL_MS=500

REM 9950X
set WF_PARALLEL_LIMIT=4
set WF_POLL_MS=2000
set WF_STREAM_POLL_MS=250
set WF_DEBUG_MONITOR=0
```

## 监控命令

```bat
set WF_DEBUG_MONITOR=1
set WF_STREAM_POLL_MS=250
cd xy/backend/opencode && bun run src/index.ts --port 3456 --data-dir ./data

cd xy\custom
bun run scripts/monitor-workflow-run.ts opencode-xuanhuan-novel-4ch-image
bun run scripts/simulate-frontend-stream.ts <runId>
bun run scripts/simulate-frontend-poll.ts <runId>
```

日志：`backend/opencode/data/debug-monitor.ndjson`
