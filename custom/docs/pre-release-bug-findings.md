# 发布前工作流引擎回归 — 候选 Bug 确认结论

本文件是《发布前工作流回归测试》计划第 6 节候选 bug 的逐条确认结论。
每条给出：**结论**（确认 / 代码走查确认 / 设计如此 / 证伪）、**证据**（测试或代码位置）、**复现 / 影响**。

确定性回归套件（离线全绿，`bun test`）：

- `xy/backend/opencode/src/workflow-runs/engine-harness.ts` — 确定性 stub provider + 隔离引擎工厂（重定向 `~/.drawmoon` 到临时 HOME，停用全局执行队列以避免 worker 线程）。
- `engine-exit.test.ts` (a)、`engine-execute.test.ts` (b)、`engine-retry.test.ts` (c)、`engine-noexec.test.ts` (d)、`engine-lifecycle.test.ts`（生命周期）。
- `xy/backend/opencode/src/llm-api/llm-key.test.ts` — API key 上手 + 协议矩阵 + mock server 正/负例。
- `xy/backend/opencode/src/cli-detect.test.ts` — CLI 快照契约 + 平台分支。

运行方式：`cd xy/backend/opencode && bun test src/workflow-runs/engine-*.test.ts src/llm-api/llm-key.test.ts src/cli-detect.test.ts`

---

## A. 引擎控制流

| # | 结论 | 证据 | 复现 / 影响 |
|---|------|------|-------------|
| 1 | **确认（必修）** | `engine-exit.test.ts` → `BUG#1 ...stuck 'running'`；`runner.ts` 465-714 `try/finally` 无 `catch` | finalize 阶段 `store.save`/seed/append 抛错 → run 永久落盘 `running`、无终态事件；仅靠新进程启动时 `store.markOrphanedRunsFailed`（`store.ts` 142-167）兜底。测试以「新建 store 实例」模拟重启验证兜底生效。**建议**：`executeRun` 外层加 `catch` 将 run 置 `failed` 并发事件。 |
| 2 | **确认（部分设计如此）** | `engine-execute.test.ts` → missing-input 用例；`runner.ts` 607 空批次 `continue`、697-706 finalize | 「有 waiting 但全部不合格」→ 静默跳过 → finalize `hasFailures=false && !allCompleted` → 记 `failed`。这是「未完成即失败」的既定语义，但对合法未完成节点会呈现为**假失败**。已有针对 gate/inquiry 的兜底守卫（`runner.ts` 690-695，见 lifecycle 测试与既有 `human-gate-deferred-resume.test.ts`），未失败的暂停不会被误置 failed。 |
| 3 | **确认（必修/需求确认）** | `engine-noexec.test.ts` → `BUG#3 condition ...` | `condition` 动作在 runner 未实现分支：条件节点被当普通 agent 节点执行，且**所有**下游都会执行（不分支）。若模板依赖条件分支，行为不符预期。 |
| 4 | **确认** | `engine-noexec.test.ts` → `BUG#4 disabled ...` | 无 `enabled:false`/`disabled` 检查，被「禁用」的节点仍会执行。 |
| 5 | **确认** | `engine-retry.test.ts` → `BUG#5 startAtNodeId ...` | 从中段节点重试（`startAtNodeId`）会跳过其之前未完成的节点（`runner.ts` 587-598）；目标节点随后被上游门控（`allUpstreamCompleted`）排除，导致**目标也无法执行**，留下永久 waiting 的空洞。 |
| 6 | **确认** | `engine-noexec.test.ts` → `BUG#6 soft failure ...` | 软失败上游导致下游永久 `waiting`；状态机**没有 `skipped`**，UI 无法区分「因上游失败而未执行」与「排队中」。 |
| 7 | **代码走查确认（低影响）** | `threads/execution-bridge.ts` 81-86（`resolve` 而非 `reject`） | worker 的 `execute-done` 错误被 bridge 吞掉，主线程无法感知。**但** run 的 finalize 由 worker 内 `executeRun` 自身完成，记录仍会落终态（除 #1 场景）；影响主要是错误可观测性，非「不 finalize」。 |
| 8 | **代码走查确认（设计如此）** | `runner/runner-utils.ts` `runBatchWithAdaptiveRetry` | 并发批次重试为一次性且仅认并发限流错误；其他瞬时错误由 `runNode` 内 4 次退避重试兜底（见 `engine-retry` 429 用例）。 |
| 9 | **代码走查确认（次要）** | `store.ts` 264-278 `calculateProgress` | `percent = completed/total`；`paused`/`cancelled` 计入 total 但不计入 completed，暂停期间 percent<100 属预期，展示可能轻微误导。 |

## B. CLI 跨机器检测

| # | 结论 | 证据 | 复现 / 影响 |
|---|------|------|-------------|
| 10 | **代码走查确认** | `providers/codex.ts` detect 91-115 | npm 全局回退仅在 `spawnSync` **抛异常**时触发；Windows 用 `shell:"cmd.exe"` 时命令找不到是**非零退出而非抛错** → 回退不触发 → 装在 npm 全局但不在 PATH 时误报 `available:false`。 |
| 11 | **代码走查确认** | `providers/copilot.ts` 16-19、46-73 | provider `detect()` 仅认 `homedir()/AppData/Roaming/Code/User/.../copilot.ps1`（Windows + VS Code 专属），无 macOS/Linux、无 Cursor、无 npm 全局 → 跨机器漏检。 |
| 12 | **确认** | `cli-detect.test.ts` → `BUG#12 ...`；`cli-info.ts` 243-246 | fast 快照的 copilot 检测在**非 Windows 恒为 false**（即使 `copilot` 在 PATH）；Windows 仅查 npm 全局 `copilot.cmd`。 |
| 13 | **代码走查确认（需人工验证 DB 路径）** | `opencode-telemetry.ts`（Win 数据目录 `USERPROFILE/.local/share/opencode`） | 非标准路径可能漏读用量 DB；建议在真实 Windows OpenCode 环境人工核对。 |
| 14 | **确认（一致性缺陷）** | 对比 #11（provider 用 VSCode `.ps1`）与 #12（probe/fast 用 npm `copilot.cmd`） | 两条检测路径判定依据不同 → `/bootstrap.providers.copilot` 与 `cliInfo.copilot.available` 可能矛盾。 |
| 15 | **代码走查确认** | `cli-probes/kiro-probe.ts` | kiro 纯 PATH 检测：装了但不在 PATH 即漏检；离线仍展示占位模型，易误导。live probe 依赖真实 CLI，属机器相关，列为手动冒烟项。 |

## C. LLM API key

| # | 结论 | 证据 | 复现 / 影响 |
|---|------|------|-------------|
| 16 | **确认（体验类）** | `llm-key.test.ts` → onboarding 用例；`kuaipao-config.ts` 234-245；`LlmApiView.tsx` 311 | UI「Key/CDK」框实际存 `apiKeyEnv` **名**而非密钥；真实密钥由后端从 `api` 文件/环境变量按名解析。用户若直接粘贴密钥当作 env 名 → 运行时空 Bearer → 401。 |
| 17 | **代码走查确认** | `run-llm-api-node.ts`；唯一校验是 `copilot-bind` 打 `/models` | 手动创建的 LLM 模板不做 key ping 校验，错误配置只在运行时暴露。 |
| 18 | **代码走查确认** | `run-llm-api-node.ts` 80-88（只读 `api.*`，无 retryPolicy） | 模板级 `retryPolicy` 未接入；实际重试走 `runNode` 内瞬时重试（4 次）。前端 retryPolicy 配置无效。 |
| 19 | **确认** | `llm-key.test.ts` → `429 ...`；`runner.ts` 1035 `isTransient` 命中 429 | 429/限流被当瞬时错误重试，最终可能以「max retries exceeded」掩盖真实配额问题。client 层已正确将 429 冒泡为 error 事件（测试验证）。 |
| 20 | **代码走查确认（安全）** | `kuaipao-config.ts` 90、228、241、254（`process.env[env]=apiKey`） | key 明文落盘于 `api` 文件并注入 `process.env`。功能正常，发布前需安全评审确认落盘/日志暴露面。 |

---

## 结论摘要

- **引擎控制流**：未发现「随机意外退出/无法执行/无法重试」的非确定性缺陷——给定确定的节点结果序列，run 终态、节点状态、事件序列均**可预测且幂等**（37 条断言全绿）。
- **必修项**：#1（未捕获异常→卡 `running`，仅重启兜底）。
- **需求/语义确认项**：#3（condition 不分支）、#5（中段重试空洞）、#6（软失败下游无 skipped 语义）、#4（无禁用节点）。
- **LLM/CLI**：key 上手与多协议链路正常；跨机器检测的平台分支缺陷（#10-#12、#14）主要造成**漏检/状态不一致**，不影响引擎控制流。
- 其余为设计如此或低影响/可观测性问题。
