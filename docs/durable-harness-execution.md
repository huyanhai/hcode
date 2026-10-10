# Durable Harness 重设计执行文档

## 1. 目标

在新分支中参考 Pi Durable 的设计，重建 hcode 的 Agent Harness。新 Harness 先支持可靠的单 Agent 执行，再扩展到动态多 Agent、审批、任务树和 Git worktree。

首个可交付目标：用户输入，持久化 GenerationTask，调用模型，持久化 ToolTask，执行本地工具，持久化工具结果，恢复 GenerationTask，输出最终回答。

## 2. 非目标

第一阶段不做以下工作：

- 不改造现有 Vue 页面。
- 不直接迁移 Pi 的 `Session`、`Chord` 或全部源码。
- 不把现有 `apps/server/src/sessions` 直接改造成新 Harness。
- 不在 Durable Kernel 完成前实现多 Agent 调度。
- 不在基础工具任务完成前接入 Git worktree 自动合并。
- 不把 OpenAI SDK 当作 Harness；它只负责模型请求。

## 3. 设计原则

1. **状态先持久化，副作用后执行**：工具、命令和外部调用执行前先记录执行意图。
2. **所有状态变化走事务**：消息、任务、文档、审批和提交状态必须在同一 Session 事务模型中更新。
3. **只观察已提交状态**：API 和 UI 不读取执行器内部变量。
4. **任务可恢复**：每个长任务都有 phase 和 checkpoint。
5. **父子任务有明确所有权**：取消、失败和空闲等待按 ownership 传播。
6. **幂等优先**：提交、派发和汇报使用稳定 request ID，重启不得重复执行逻辑。
7. **执行环境与工具定义分离**：工具描述能力，ExecutionEnv 提供文件和进程能力。

## 4. 目标架构

```text
Harness
  ├── Session              串行事务和提交事件
  ├── Storage              Memory / SQLite 持久化
  ├── TaskScheduler        任务推进、等待、取消、恢复
  ├── Conversation         Agent 对话和上下文
  ├── Submission / Inbox   输入、follow-up、steer、幂等
  ├── GenerationTask       模型生成循环
  ├── ToolTask             参数、审批、执行、结果
  ├── ExecutionEnv         文件、Shell、监控和取消
  ├── Event/View           事件流和任务图
  └── Provider             OpenAI 及兼容模型适配
```

## 5. 推荐模块布局

新分支先建立平行实现，不覆盖当前 `agent-core`：

```text
packages/durable/
  src/
    types.ts
    ids.ts
    entries.ts
    documents.ts
    tasks.ts
    session/
    storage/
    harness/
    provider/
    env/
    tools/
  test/
```

建议职责：

| 模块 | 职责 |
| --- | --- |
| `types.ts` | 所有持久化记录、任务、提交和工具契约 |
| `storage/` | Storage 接口、Memory 实现、SQLite 实现和 migration |
| `session/` | 单条 mutation line、事务、publication |
| `tasks.ts` | 可恢复任务定义和 phase 类型 |
| `harness/scheduler.ts` | 任务调度、等待、所有权和取消传播 |
| `harness/generation.ts` | 模型上下文、生成、tool call 和下一轮生成 |
| `harness/tool.ts` | 工具校验、审批、执行意图、输出和结果 |
| `harness/events.ts` | 从 commit publication 生成事件流 |
| `harness/task-graph.ts` | 输出可观察任务图 |
| `provider/` | OpenAI Responses、Chat 和测试 provider |
| `env/` | 文件系统、Shell、进程终止和输出流 |
| `tools/` | read、write、edit、bash 等工具定义 |

## 6. 执行阶段

### 阶段 0：设计冻结

确认数据模型、状态机、恢复规则和边界。产物包括设计说明、任务状态转移表、Storage 接口草案、ToolTask replay/approval 规则和测试矩阵。

验收：所有后续模块引用同一套状态和术语，不由实现代码临时定义语义。

### 阶段 1：核心类型与 ID

实现 `ConversationId`、`EntryId`、`TaskId`、`SubmissionId`、`DocumentId`、`Seq`，以及会话、消息、任务、提交和文档记录类型。

验收：类型能表达父子任务、任务等待、任务结果和文档作用域；不同 ID 不能互相传递。

### 阶段 2：Storage 契约和 SQLite

先定义 `Storage` 接口，再实现 `MemoryStorage`、SQLite schema 和 migration。支持原子写入、分页扫描、owner 查询、状态查询和 request ID 查询。

最小表集合：`conversations`、`entries`、`tasks`、`submissions`、`documents`、`durable_metadata`。

验收：同一提交中的多条写入原子成功或原子失败；关闭进程后重新打开 SQLite 可以读取未完成任务。

### 阶段 3：Session 事务内核

实现单条串行 mutation line、事务、commit sequence、commit publication、关闭和 poisoned storage 处理。

```ts
session.commit(async (tx) => {
  const entry = await tx.appendEntry(...);
  const task = await tx.createTask(...);
  await tx.updateDocument(...);
  return task;
});
```

验收：并发提交不会产生重复 sequence、丢失写入或半提交观察结果。

### 阶段 4：Entry、Document 和上下文

Entry 类型包括 `user`、`assistant`、`system`、`tool-result`、`reset` 和 `compaction`。Document 保存 Agent 配置、live run、inbox、provider session、usage 和应用状态。

验收：能从 Entry 重建模型上下文；reset、fork 和 tool result 顺序有确定行为。

### 阶段 5：Task 定义和 Scheduler

实现 `defineTask({ name, version, initial, phases, abort })`，支持以下状态：`pending -> running -> waiting -> running -> terminal`，以及取消路径 `pending/running/waiting -> aborting -> terminal`。

Scheduler 负责恢复 running 任务、检查依赖、处理 `allSettled`/`failFast`、按 owner 传播取消，以及等待子工作结束。

验收：父任务可以创建两个子任务并等待它们；`failFast` 下一个子任务失败会取消其他未完成子任务。

### 阶段 6：Conversation、Submission 和 Inbox

输入流程：`submit(input) -> 创建 Submission -> append UserEntry -> 创建 GenerationTask`。

支持 `requestId` 幂等、`steer`、`followUp`、queued input、abort、wait 和 waitForIdle。

验收：重复提交相同 request ID 不会创建第二条用户消息或第二个 GenerationTask。

### 阶段 7：Provider 抽象

定义统一的 `ModelProvider.stream()`，实现 OpenAI Responses、Chat Completions、faux provider 和错误归一化。Provider 不处理任务、审批、Storage 或本地工具。

### 阶段 8：GenerationTask

```text
读取上下文
  -> 调用 Provider
  -> 持久化 assistant response
  -> 无 tool call：完成
  -> 有 tool call：创建 ToolTask 并等待
  -> 读取 ToolResultEntry
  -> 再次调用 Provider
```

验收：faux provider 能完成“用户问题 -> 模型响应 -> 最终回答”，无工具时 Submission 进入 done。

### 阶段 9：ToolTask

状态机：`call -> awaiting-approval -> execute -> terminal`。

工具定义至少包含：

```ts
type ToolRegistration = {
  name: string;
  parameters: Schema;
  replay: "safe" | "unsafe";
  risk: "read" | "write" | "command" | "external";
  execute(args: JsonObject, api: ToolExecutionApi): Promise<ToolResult>;
};
```

执行规则：读取 tool call、校验参数、执行 hook、持久化审批、写入 execute intent、执行工具、记录增量输出、写入 ToolResultEntry、提交终态。

恢复规则：safe 工具可以重放；unsafe 工具生成 interrupted 结果；审批从 Storage 恢复；工具结果和任务终态在同一个 commit 中写入。

### 阶段 10：ExecutionEnv 和本地工具

统一执行环境包括 FileSystem、Shell、Watcher 和 Cancellation。工具按 read、write、edit、bash、git status/diff、输出截断、文件写入串行化的顺序实现。

### 阶段 11：事件流和任务图

事件只从已提交 publication 派生。至少提供 `task_created`、`task_started`、`tool_started`、`tool_output`、`approval_requested`、`task_waiting`、`task_completed`、`task_failed`、`task_aborted`、`message_delta` 和 `message_completed`。

提供 Conversation event stream、Task graph snapshot/watch 和 sequence/cursor 断线恢复。

### 阶段 12：恢复、压缩和治理

补充 `Harness.open()`、`Harness.resume()`、crash recovery、retry policy、context compaction、usage/cost、orphan task、storage migration 和 task inspection。

验收：在模型响应、工具执行和审批等待三个位置模拟退出，重启后都能得到确定结果。

### 阶段 13：多 Agent

```text
主管 GenerationTask
  -> Subagent ToolTask
      -> 创建子 Conversation
      -> 创建子 GenerationTask
      -> wait
      -> 返回 ToolResult
```

前台子 Agent 等待结果；后台子 Agent 使用 AnchorTask 和 ReporterTask。角色通过 Agent 配置动态生成，可以覆盖模型、提示词、工具和工作目录。

### 阶段 14：Git Worktree

```text
子 Agent
  -> 创建独立 worktree
  -> 在 worktree 中执行工具
  -> 运行测试
  -> 生成 diff
  -> ReviewTask 检查
  -> 自动合并或请求用户确认
```

Worktree 生命周期独立于基础 ToolTask，避免把 Git 合并策略耦合进执行内核。

## 7. 一次完整执行时序

```text
1. Harness.open(SQLite)
2. Scheduler.open()，恢复未完成任务
3. 获取 root Conversation
4. 用户 submit(input)
5. Session commit：UserEntry + Submission + GenerationTask
6. Scheduler 启动 GenerationTask
7. GenerationTask 读取上下文并调用 Provider
8. Provider 返回 assistant tool call
9. Session commit：AssistantEntry + ToolTask，GenerationTask 进入 waiting
10. ToolTask 校验参数并执行审批策略
11. 需要审批时进入 awaiting-approval
12. 用户批准后写入 execute intent
13. ExecutionEnv 执行工具并发布进度
14. ToolTask commit：ToolResultEntry + terminal outcome
15. Scheduler 唤醒 GenerationTask
16. GenerationTask 追加 tool result 并再次调用 Provider
17. Provider 返回最终文本
18. GenerationTask 写 AssistantEntry
19. Submission 变为 done
20. Event watcher 将已提交事件发送给 API/UI
```

## 8. 崩溃恢复时序

```text
进程退出
  -> SQLite 保留最后一个 commit
  -> Harness.open()
  -> Scheduler 将 running 恢复为 pending
  -> safe ToolTask 重放
  -> unsafe ToolTask 写入 interrupted 结果
  -> awaiting approval 的任务恢复为等待状态
  -> GenerationTask 根据子任务结果继续或失败
```

## 9. 阶段性 Demo

| Demo | 覆盖范围 |
| --- | --- |
| D1：内存任务 | Task、phase、checkpoint、Scheduler |
| D2：SQLite 恢复 | Storage、Session、重启恢复 |
| D3：无工具 Agent | Provider、GenerationTask、Submission |
| D4：read 工具 | ToolTask、ToolResult、事件流 |
| D5：审批工具 | approval、resume、拒绝 |
| D6：崩溃工具 | safe/unsafe replay |
| D7：前台子 Agent | child Conversation、ownership、等待 |
| D8：后台子 Agent | Anchor、Reporter、follow-up |
| D9：任务树 | Task Graph、取消传播、failFast |
| D10：worktree | 隔离、diff、review、合并 |

## 10. 测试门禁

每阶段先写失败测试，再实现通过：

- Storage conformance；
- Session 原子提交；
- Scheduler 状态转移；
- Task crash recovery；
- request ID 幂等；
- ToolTask approval/replay；
- 输出截断和取消；
- Generation provider contract；
- Task graph event；
- 子 Agent ownership 和取消传播；
- worktree 冲突和未提交修改保护。

## 11. 当前执行边界

- 新 Harness 先放在独立包中。
- 现有 `apps/server/src/database/prisma.service.ts` 的用户未提交修改保持不动。
- 现有单 Agent 链路继续运行，不与新 Harness 混用状态。
- 新 Harness 先用 headless demo 验证，再接 Nest API。
- API 和 Vue UI 在 D5 之后再开始，避免 UI 绑定未稳定的状态模型。

## 12. 完成标准

重设计进入现有产品替换阶段前，必须满足：

1. 单 Agent 文本任务可持久化运行。
2. ToolTask 支持审批、取消、结果和恢复。
3. 进程退出后不会重复安全任务，也不会误重放危险任务。
4. 事件流支持任务和工具进度观察。
5. 前台和后台子 Agent 都能运行并恢复。
6. 任务图能表达 ownership、等待和失败传播。
7. 子 Agent 能在独立 worktree 中执行代码任务。
8. 现有 UI/API 可以通过适配层消费新 Harness，而不读取内部数据库细节。
