# 统一消息发送与待发送消息 Implementation Plan

> **已被后续方案取代：** 本文保留为阶段性设计记录。现行协议以 `2026-07-11-稳定消息ID与同步发送-design.md` 和对应 implementation plan 为准，旧 boolean `send`、占位消息 ID 与旧响应字段均已删除。


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让 `/api/send` 支持 `send:false` 的可见待发送消息，并统一 Hermes 插件所有出站路径，支持管理端人工发送和按实际发送时间重排。

**Architecture:** GeWeHub 继续接收标准 SendRequest，并用 `held` 状态表达“已记录但未提交平台”。插件通过单一 outbound normalizer 将文本或 JSON 转为标准请求，无论 `send` 真或假都调用 `/api/send`。服务端预建 held Message，人工 dispatch 后由现有 outbox 发送并原地更新该 Message。

**Tech Stack:** TypeScript、NestJS、Prisma、Zod、Vitest、React、TanStack Query、Python、pytest。

---

### Task 1: 扩展标准契约和数据库状态

**Files:**
- Modify: `packages/contracts/src/api.ts`
- Modify: `packages/contracts/test/message-schema.test.ts`
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260711010000_add_held_send_messages/migration.sql`

- [x] **Step 1: 先写失败的契约测试**

增加断言：`sendRequestSchema` 接受 `send:false`，缺省解析为 `send:true`；`sendResponseSchema` 接受 `status:"held"`。

- [x] **Step 2: 运行契约测试并确认失败**

Run: `pnpm --filter @gewehub/contracts test -- message-schema.test.ts`
Expected: FAIL，schema 尚无 `send` 和 `held`。

- [x] **Step 3: 实现契约和 Prisma 枚举/字段**

```ts
send: z.boolean().default(true)
```

```prisma
enum SendStatus {
  held
  pending
  sent
  failed
  unknown
}

model Message {
  isSent Boolean @default(true) @map("is_sent")
}
```

Migration 添加 `held` 枚举值和 `messages.is_sent BOOLEAN NOT NULL DEFAULT true`。

- [x] **Step 4: 运行契约测试**

Run: `pnpm --filter @gewehub/contracts test -- message-schema.test.ts`
Expected: PASS。

### Task 2: 在现有标准发送编排中支持 held 创建

**Files:**
- Modify: `server/src/modules/send/send.controller.ts`
- Modify: `server/src/modules/send/send-utils.ts`
- Modify: `server/test/send-controller.test.ts`

- [x] **Step 1: 写 held 创建失败测试**

覆盖：`send:false` 创建 `SendRequest(status=held)`、创建 `Message(isSent=false)`、返回 held/messageId、不创建 outbox；旧请求仍创建 pending/outbox。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/server test -- send-controller.test.ts send-utils.test.ts`
Expected: FAIL，尚无 held 逻辑。

- [x] **Step 3: 实现 held Message builder**

实现 `buildHeldHubSendMessage()`，根据标准 SendRequest 创建标准 MessageNode、占位消息 ID、`isSent=false` 和 `metadata.outbound.sent=false`。

- [x] **Step 4: 创建 held 记录**

同一事务创建 SendRequest、Message，并更新 Conversation 的 `lastMessageAt/lastMessageText/messageCount`；不创建 outbox。

- [x] **Step 5: 运行服务端局部测试**

Run: `pnpm --filter @gewehub/server test -- send-controller.test.ts send-utils.test.ts`
Expected: PASS。

### Task 3: 人工 dispatch 与 outbox 原消息回写

**Files:**
- Modify: `server/src/modules/send/send.controller.ts`
- Modify: `server/src/modules/outbox/outbox.service.ts`
- Modify: `server/test/outbox-service.test.ts`

- [x] **Step 1: 写人工发送与原地更新失败测试**

覆盖：held -> pending + 单 outbox；并发第二次请求不重复排队；发送成功更新原 Message 的真实 ID、`isSent=true`、实际 `sentAt`，不创建第二条 Message、不重复增加 messageCount。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/server test -- send-controller.test.ts outbox-send.test.ts`
Expected: FAIL。

- [x] **Step 3: 增加 dispatch 路由**

```ts
@Post("/api/send/:id/dispatch")
async dispatch(@Param("id") id: string) {
  return this.sendService.dispatchHeld(id);
}
```

事务内使用 `updateMany({where:{id,status:"held"}})` 抢占，并创建 outbox。

- [x] **Step 4: 修改 outbox 成功写回**

如果 `sendRequest.message` 存在，则更新原 Message；否则使用现有创建路径。同步更新 payload、真实 ID、dedupeKey、sentAt、isSent 和会话最近消息。

- [x] **Step 5: 运行局部测试**

Run: `pnpm --filter @gewehub/server test -- send-controller.test.ts outbox-send.test.ts`
Expected: PASS。

### Task 4: 会话消息 API 暴露发送状态

**Files:**
- Modify: `server/src/modules/conversations/conversations.controller.ts`
- Modify: `server/test/conversations-controller.test.ts`

- [x] **Step 1: 写失败测试**

断言消息列表 include `sendRequest`，且 held 消息返回 `isSent:false` 和 `sendRequest.status:"held"`。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/server test -- conversations-controller.test.ts`
Expected: FAIL。

- [x] **Step 3: 增加查询关联并保证游标/排序仍按 sentAt**

在消息查询 include 中加入精简 `sendRequest` select；保持 `orderBy sentAt desc`。

- [x] **Step 4: 运行测试**

Run: `pnpm --filter @gewehub/server test -- conversations-controller.test.ts`
Expected: PASS。

### Task 5: 插件统一 outbound 标准化与发送

**Files:**
- Create: `plugins/hermes-agent/outbound.py`
- Modify: `plugins/hermes-agent/adapter.py`
- Modify: `plugins/hermes-agent/tools.py`
- Modify: `plugins/hermes-agent/client.py`
- Modify: `plugins/hermes-agent/cli.py`
- Modify: `plugins/hermes-agent/test_gewehub_plugin.py`
- Delete: `plugins/hermes-agent/send_state.py`

- [x] **Step 1: 写统一规则失败测试**

覆盖普通 final 文本、非法 JSON、无 boolean send 的 JSON 原文、`send:false+content`、`send:true`、cron、standalone、HTML metadata、工具和本地媒体全部进入 `send_message_payload()`。

- [x] **Step 2: 运行插件测试确认失败**

Run: `uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML python -m pytest plugins/hermes-agent/test_gewehub_plugin.py -q`
Expected: FAIL，尚无 outbound 模块且普通 final 被抑制。

- [x] **Step 3: 实现 outbound normalizer**

提供：

```python
def normalize_final_output(conversation_id: str, content: str) -> dict[str, Any]
def normalize_explicit_payload(conversation_id: str, value: str | dict[str, Any]) -> dict[str, Any]
async def dispatch_standard(client, payload: dict[str, Any]) -> dict[str, Any]
```

`send:false` 只标准化并透传，不本地 suppress。

- [x] **Step 4: 替换重复分支**

删除 `_final_json_envelope_from_content` 和 cron/standalone 的重复 JSON 决策；adapter、tools、HTML、媒体统一构建标准 payload 后调用 client 单一方法。

- [x] **Step 5: 删除无效 send_state**

移除未被消费的 tool-sent TTL 状态及引用。

- [x] **Step 6: 运行插件测试**

Run: `uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML python -m pytest plugins/hermes-agent/test_gewehub_plugin.py -q`
Expected: PASS。

### Task 6: 管理端展示 held 消息并支持人工发送

**Files:**
- Modify: `web/src/lib/workspace-data.ts`
- Modify: `web/src/features/workbench/queries.ts`
- Create: `web/src/features/workbench/useWorkbenchMessageDispatchController.ts`
- Modify: `web/src/features/workbench/MessageFlow.tsx`
- Modify: `web/src/features/workbench/MessagePanel.tsx`
- Modify: `web/src/features/workbench/WorkbenchPage.tsx`
- Modify: `web/src/features/workbench/WorkbenchPage.test.tsx`
- Modify: `web/src/features/workbench/MessageFlow.test.tsx`

- [x] **Step 1: 写 UI 失败测试**

断言 `isSent:false/status=held` 的气泡有低透明度、虚线边框、“未发送”标识和“发送”按钮，且无撤回按钮；点击发送调用 dispatch API 并刷新。

- [x] **Step 2: 运行 UI 测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MessageFlow.test.tsx WorkbenchPage.test.tsx`
Expected: FAIL。

- [x] **Step 3: 扩展前端数据模型**

映射 `BackendMessage.isSent`、`BackendMessage.sendRequest.status` 到 MessageItem。

- [x] **Step 4: 实现 dispatch query/controller**

增加 `dispatchWorkbenchSendRequest()` 和独立 hook，管理 loading、toast、消息刷新和 workspace 刷新。

- [x] **Step 5: 实现 held 样式和按钮**

气泡容器使用 `opacity-60` 和 `border-dashed`；meta 显示“未发送”；操作区发送按钮放在撤回位置附近。

- [x] **Step 6: 验证重排**

更新测试数据：dispatch 后服务端返回新的 `sentAt`，刷新后 `compareMessagesBySentAt` 将消息移动到正确位置。

- [x] **Step 7: 运行 UI 测试**

Run: `pnpm --filter @gewehub/web test -- MessageFlow.test.tsx WorkbenchPage.test.tsx`
Expected: PASS。

### Task 7: 更新插件和平台文档

**Files:**
- Modify: `plugins/hermes-agent/README.md`
- Modify: `plugins/hermes-agent/skill/SKILL.md`
- Modify: `plugins/hermes-agent/skill/gewehub-delivery-patterns/SKILL.md`
- Modify: `plugins/hermes-agent/skill/gewehub-messaging-etiquette/SKILL.md`
- Modify: `plugins/hermes-agent/skill/gewehub-messaging-etiquette-v2/SKILL.md`
- Modify: `plugins/hermes-agent/skill/gewehub-wechat-delivery-patterns/SKILL.md`
- Modify: `docs/产品形态-v1.md`

- [x] **Step 1: 删除“普通 final 必须抑制”的旧规则**

说明 final 支持普通文本和 JSON；JSON 的 boolean `send` 决定服务端立即发送或 held 记录。

- [x] **Step 2: 文档说明 held 管理流程**

记录管理端虚线展示、人工发送、实际发送时间回写和重排。

- [x] **Step 3: 运行文档约束测试**

Run: `uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML python -m pytest plugins/hermes-agent/test_gewehub_plugin.py::test_final_json_send_protocol_is_documented -q`
Expected: PASS。

### Task 8: 全量验证与回归

**Files:**
- Verify only

- [x] **Step 1: 运行 contracts 测试**

Run: `pnpm --filter @gewehub/contracts test`
Expected: PASS。

- [x] **Step 2: 运行 server 测试**

Run: `pnpm --filter @gewehub/server test`
Expected: PASS。

- [x] **Step 3: 运行 web 测试和构建**

Run: `pnpm --filter @gewehub/web test && pnpm --filter @gewehub/web build`
Expected: PASS。

- [x] **Step 4: 运行插件测试**

Run: `uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML python -m pytest plugins/hermes-agent/test_gewehub_plugin.py -q`
Expected: PASS。

- [x] **Step 5: 运行仓库级检查**

Run: `pnpm test && pnpm build`
Expected: PASS。

- [x] **Step 6: 审查工作区差异**

确认没有覆盖用户原有未提交内容、没有未使用的 send_state 引用、没有仍然强制 final JSON 的文案或代码。

### Task 9: 将 boolean send 升级为三态 deliveryMode

**Files:**
- Modify: `packages/contracts/src/api.ts`
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260711020000_add_send_delivery_mode/migration.sql`
- Modify: `server/src/modules/send/send.controller.ts`
- Modify: `server/src/modules/outbox/outbox.service.ts`
- Modify: `server/src/modules/conversations/conversations.controller.ts`
- Modify: `plugins/hermes-agent/outbound.py`
- Modify: `plugins/hermes-agent/tools.py`
- Modify: `plugins/hermes-agent/adapter.py`
- Modify: `plugins/hermes-agent/README.md`
- Modify: `plugins/hermes-agent/skill/**`
- Modify: `web/src/lib/workspace-data.ts`
- Modify: `web/src/features/workbench/MessageFlow.tsx`

- [x] 定义 `deliveryMode=immediate|discard|confirm`，兼容旧 `send`。
- [x] SendRequest 独立持久化 delivery mode，held 历史迁移为 confirm。
- [x] immediate 进入 outbox，discard/confirm 当前均 held。
- [x] 管理端分别显示“未发送”和“待确认”，均可人工发送。
- [x] 插件 outbound、工具 schema、平台提示词和 skills 同步三态协议。
- [x] 补充 contracts/server/web/plugin 测试并全量验证。
