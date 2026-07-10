# 稳定消息 ID 与同步发送 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将所有新收发消息统一为稳定 GeWeHub ID，并实现默认同步、可选异步、全局串行的发送协议，打通引用、撤回、插件和管理端。

**Architecture:** Message 成为消息身份与平台映射的唯一事实来源；SendRequest 只记录请求策略和执行状态。发送入口先事务性预建 Message 和 outbox，再通过进程内单飞协调器主动 drain；同步请求使用内存 waiter 等待同一发送实现完成，异步请求可靠入队即返回。

**Tech Stack:** TypeScript、NestJS、Prisma、PostgreSQL、Zod、Vitest、React、Python unittest/pytest 风格测试。

---

## 文件职责

- `packages/contracts/src/api.ts`：标准发送请求、成功响应和失败响应 schema。
- `server/src/modules/messages/message-id.ts`：稳定 Message ID 生成器。
- `server/prisma/schema.prisma` 与新迁移：Message 平台 ID、executionMode、删除旧字段。
- `server/src/modules/send/send.controller.ts`：请求校验、事务预建 Message/SendRequest/outbox、标准响应。
- `server/src/modules/outbox/outbox.service.ts`：全局单飞 drain、主动唤醒、同步 waiter、发送结果原地回写。
- `server/src/modules/messages/messages.controller.ts`：按稳定 messageId 撤回。
- `server/src/modules/messages/message-rendering.ts`：显式 Markdown 上下文字段。
- `server/src/modules/messages/message-reference.ts`：引用仅按稳定 ID 精确解析。
- `plugins/hermes-agent/outbound.py`：文本/JSON 统一标准化入口。
- `plugins/hermes-agent/client.py`、`tools.py`、`adapter.py`：标准发送响应、executionMode、撤回工具。
- `plugins/hermes-agent/skill/**`、`README.md`：平台提示词和使用文档。
- `web/src/features/workbench/**`：未发送/失败消息操作与实际时间重排。

### Task 1: Contracts 破坏性升级

**Files:**
- Modify: `packages/contracts/src/api.ts`
- Modify: `packages/contracts/test/message-schema.test.ts`

- [x] **Step 1: 写失败测试**：断言 `send` 被 strict schema 拒绝；`executionMode` 默认 `sync`；成功响应只接受 `success/messageId/url/accepted`；失败响应要求 `success:false/messageId/error`。
- [x] **Step 2: 运行测试确认 RED**

Run: `pnpm --filter @gewehub/contracts test -- message-schema.test.ts`
Expected: 旧 schema 接受 `send` 且返回旧 `id/status/htmlPublicUrl`，测试失败。

- [x] **Step 3: 最小实现**：新增 `sendExecutionModeSchema`；删除 `send` transform；默认 `deliveryMode=immediate`、`executionMode=sync`；替换发送响应 schema。
- [x] **Step 4: 运行 contracts 测试确认 GREEN**

Run: `pnpm --filter @gewehub/contracts test`

### Task 2: Prisma 与稳定 ID 基础

**Files:**
- Create: `server/src/modules/messages/message-id.ts`
- Create: `server/prisma/migrations/20260711030000_stable_message_ids_and_execution_mode/migration.sql`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/test/prisma-schema.test.ts`
- Create or Modify: `server/test/message-id.test.ts`

- [x] **Step 1: 写失败测试**：验证 ID 匹配 `^msg_[A-Za-z0-9_-]{22}$` 且重复生成不同；schema 包含三个平台字段和 executionMode，不含四个旧结果字段。
- [x] **Step 2: 运行目标测试确认 RED**
- [x] **Step 3: 实现 ID 生成器和 Prisma 字段**。
- [x] **Step 4: 写迁移**：复制历史 `raw_message_id` 和 SendRequest 结果到 Message，随后删除旧列。
- [x] **Step 5: Prisma generate/validate 和目标测试确认 GREEN**

Run: `pnpm --filter @gewehub/server exec prisma generate && pnpm --filter @gewehub/server exec prisma validate && pnpm --filter @gewehub/server test -- prisma-schema.test.ts message-id.test.ts`

### Task 3: 入站稳定 ID

**Files:**
- Modify: `server/src/modules/normalizer/normalizer.ts`
- Modify: `server/src/modules/outbox/outbox.service.ts`
- Modify: normalizer/outbox fixture tests under `server/test/**`

- [x] **Step 1: 写失败测试**：新入站 Message 使用随机稳定 ID；同一 dedupeKey 重放复用原消息；平台 newMsgId 只写 `platformNewMsgId`；撤回 webhook 通过平台字段定位。
- [x] **Step 2: 运行目标测试确认 RED**。
- [x] **Step 3: 调整 normalizer 接收持久化层提供的 messageId，删除 `msg_${newMsgId}` 生成方式**。
- [x] **Step 4: 调整 webhook 持久化和撤回定位**。
- [x] **Step 5: 运行目标测试确认 GREEN**。

### Task 4: 发送入口预建 Message 和标准响应

**Files:**
- Modify: `server/src/modules/send/send.controller.ts`
- Modify: `server/src/modules/send/send-utils.ts`
- Modify: `server/test/send-controller.test.ts`

- [x] **Step 1: 写失败测试**：所有 deliveryMode 在入口创建稳定 Message；immediate 同时创建 outbox；discard/confirm 不创建 outbox；响应不含状态和请求 ID；资源统一为 `url`。
- [x] **Step 2: 运行目标测试确认 RED**。
- [x] **Step 3: 抽取事务内 `createOutboundMessageAndRequest`，生成完整 Message 并关联 SendRequest**。
- [x] **Step 4: 删除 held 占位 ID 和发送成功后替换 ID 的路径**。
- [x] **Step 5: 实现标准成功/失败响应映射并确认 GREEN**。

### Task 5: 全局串行协调器和同步等待

**Files:**
- Modify: `server/src/modules/outbox/outbox.service.ts`
- Modify: `server/test/outbox-send.test.ts`
- Modify: `server/test/send-controller.test.ts`

- [x] **Step 1: 写失败测试**：并发 wake 仅有一个 send 执行；FIFO 串行；新任务主动发送无需 timer；sync 等待成功/失败/unknown；async 立即 accepted；HTTP waiter 超时不取消任务。
- [x] **Step 2: 运行目标测试确认 RED**。
- [x] **Step 3: 实现单飞 `wakeSendQueue()` 和连续 drain**，timer 仅调用同一入口作为恢复兜底。
- [x] **Step 4: 实现按 sendRequestId 注册/完成 waiter**，发送成功、失败、unknown 后直接通知。
- [x] **Step 5: Controller 默认 sync 等待，async 入队即返回**。
- [x] **Step 6: 运行 outbox/send 测试确认 GREEN**。

### Task 6: 引用和撤回稳定 ID

**Files:**
- Modify: `server/src/modules/send/send.controller.ts`
- Modify: `server/src/modules/send/send-utils.ts`
- Modify: `server/src/modules/messages/messages.controller.ts`
- Modify: `server/src/modules/messages/messages.module.ts`
- Modify: `server/test/message-reference.test.ts`
- Modify/Create: `server/test/messages-controller.test.ts`

- [x] **Step 1: 写失败测试**：引用仅精确匹配当前会话稳定 messageId；不接受 row ID/raw ID；撤回只接受稳定 messageId 且验证 self/sent/平台三字段。
- [x] **Step 2: 运行目标测试确认 RED**。
- [x] **Step 3: 删除 `stripMessagePrefix`、rawMessageId fallback 和旧 sendRequest revoke 路由**。
- [x] **Step 4: 在 MessagesController 实现 `POST :messageId/revoke` 并原地更新状态**。
- [x] **Step 5: 运行目标测试确认 GREEN**。

### Task 7: Markdown 标准上下文

**Files:**
- Modify: `server/src/modules/messages/message-rendering.ts`
- Modify: Markdown/normalizer fixture tests under `server/test/**`

- [x] **Step 1: 写失败测试**：断言消息、会话、发送者 ID/名称/备注分行，缺失备注省略，不出现合并格式或平台 ID。
- [x] **Step 2: 运行目标测试确认 RED**。
- [x] **Step 3: 最小重构 `renderMessageMarkdown` 和嵌套引用/转发头部**。
- [x] **Step 4: 运行目标测试确认 GREEN**。

### Task 8: 插件统一发送协议

**Files:**
- Modify: `plugins/hermes-agent/outbound.py`
- Modify: `plugins/hermes-agent/client.py`
- Modify: `plugins/hermes-agent/tools.py`
- Modify: `plugins/hermes-agent/adapter.py`
- Modify: `plugins/hermes-agent/normalizer.py`
- Modify: `plugins/hermes-agent/test_gewehub_plugin.py`
- Modify: `plugins/hermes-agent/README.md`
- Modify: `plugins/hermes-agent/skill/**`

- [x] **Step 1: 写失败测试**：文本和 JSON final；删除 boolean send；默认 sync；标准响应解析；统一 url；稳定 ID 引用；新撤回工具。
- [x] **Step 2: 运行插件测试确认 RED**。
- [x] **Step 3: 统一所有发送调用到 outbound/client 单一入口**。
- [x] **Step 4: 更新工具 schema 与平台提示词，删除旧字段和旧撤回方式**。
- [x] **Step 5: 运行插件测试和 py_compile 确认 GREEN**。

### Task 9: 管理端适配

**Files:**
- Modify: `web/src/features/workbench/queries.ts`
- Modify: `web/src/features/workbench/MessageFlow.tsx`
- Modify: `web/src/features/workbench/MessagePanel.tsx`
- Modify: `web/src/features/workbench/useWorkbenchMessageDispatchController.ts`
- Modify: related tests under `web/src/features/workbench/**`

- [x] **Step 1: 写失败测试**：稳定 messageId 作为操作 ID；discard/confirm/failed/unknown 展示；人工发送 pending 禁用；成功后按实际 sentAt 重排。
- [x] **Step 2: 运行目标测试确认 RED**。
- [x] **Step 3: 适配新发送响应，复用 dispatch 刷新逻辑，不依赖 Agent 响应中的 status/id**。
- [x] **Step 4: 运行 web 目标测试确认 GREEN**。

### Task 10: 文档和全量验证

**Files:**
- Modify: `docs/产品形态-v1.md`
- Modify: `docs/superpowers/specs/2026-07-11-统一消息发送与待发送消息-design.md`
- Modify: `docs/superpowers/plans/2026-07-11-统一消息发送与待发送消息-implementation.md`

- [x] **Step 1: 更新文档为稳定 ID、executionMode、统一响应和新撤回工具，清理 boolean send 与旧 ID 描述**。
- [x] **Step 2: 全量测试**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @gewehub/server exec prisma validate
python -m unittest plugins/hermes-agent/test_gewehub_plugin.py
python -m py_compile plugins/hermes-agent/*.py
git diff --check
```

Expected: 全部通过且无格式错误。

- [x] **Step 3: 审查**：检查无旧 `send` 兼容、无 `rawMessageId/resultMsgId/resultNewMsgId/resultCreateTime` 生产代码引用、无旧撤回路由、无 Agent 可见 pending/held。
