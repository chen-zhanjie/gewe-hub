# GeWeHub 移动端适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Web 应用中交付 `/mobile/*` 移动端展示层，严格复用现有业务能力，并保持桌面端无回归。

**Architecture:** 在 `web/src/features/mobile` 下建立独立 MobileShell、页面和触控组件，继续使用现有 TanStack Router、React Query、API Client、工作台控制器和管理查询。移动端复用数据与行为，不复用桌面三栏和表格 DOM；长详情使用路由页面，短操作使用底部抽屉，危险操作复用确认语义。

**Tech Stack:** React 19、TypeScript、TanStack Router、TanStack Query、Tailwind CSS、Radix primitives、Vitest、Testing Library、Vite。

**Requirements:** `docs/superpowers/specs/2026-07-11-移动端适配-PRD.md`

---

## 文件结构

### 新增核心文件

```text
web/src/features/mobile/
├── MobileAppShell.tsx                 # 移动端登录后壳和底部导航
├── MobileTopBar.tsx                   # 安全区顶部栏
├── MobileBottomTabs.tsx               # 四个一级 Tab
├── MobileActionSheet.tsx              # 长按/短操作底部抽屉
├── MobilePage.tsx                     # 二级页面通用容器
├── mobile-routes.ts                   # 移动端路径常量
├── mobile-navigation.ts               # 一级导航元数据
├── mobile-selection-storage.ts        # 独立账号选择持久化
├── mobile-action-capabilities.ts      # 会话/消息动作显隐纯函数
├── auth/MobileLoginPage.tsx
├── conversations/MobileConversationsPage.tsx
├── conversations/MobileConversationRow.tsx
├── conversations/MobileConversationActions.tsx
├── conversations/MobileAccountPicker.tsx
├── chat/MobileChatPage.tsx
├── chat/MobileMessageList.tsx
├── chat/MobileMessageActions.tsx
├── chat/MobileComposer.tsx
├── chat/MobileAttachmentSheet.tsx
├── chat/MobileLinkSendPage.tsx
├── chat/MobileVideoSendPage.tsx
├── chat/MobileHtmlSendPage.tsx
├── chat/MobileMessageDetailPage.tsx
├── conversations/MobileConversationManagePage.tsx
├── contacts/MobileContactsPage.tsx
├── contacts/MobileContactProfilePage.tsx
├── contacts/MobileGroupMembersPage.tsx
├── admin/MobileAdminHomePage.tsx
├── admin/MobileEntityCard.tsx
├── admin/MobileAppsPage.tsx
├── admin/MobileAccountsPage.tsx
├── admin/MobileDeliveriesPage.tsx
├── admin/MobileSendRequestsPage.tsx
├── admin/MobileHtmlPagesPage.tsx
├── admin/MobileObservabilityPage.tsx
├── admin/MobileSettingsPage.tsx
└── me/MobileMePage.tsx
```

### 修改文件

```text
web/src/routes/app-router.tsx              # 注册 /mobile 路由树
web/src/styles.css                         # 安全区、移动端 viewport、长按和滚动基础样式
web/src/features/workbench/MessageFlow.tsx # 抽取并共享动作判定，桌面行为不变
web/src/features/workbench/queries.ts      # 仅在缺少可组合 query hook 时补公共 hook
web/src/features/admin/queries.ts          # 复用管理查询，不复制 API 请求
web/src/style-architecture.test.ts         # 移动端样式架构断言
web/src/routes/app-router-architecture.test.ts # 路由与懒加载断言
```

每个页面测试与源文件同目录，采用 `*.test.tsx`；纯函数采用 `*.test.ts`。

---

### Task 1: 移动端路径、导航与账号选择基础逻辑

**Files:**
- Create: `web/src/features/mobile/mobile-routes.ts`
- Create: `web/src/features/mobile/mobile-navigation.ts`
- Create: `web/src/features/mobile/mobile-selection-storage.ts`
- Create: `web/src/features/mobile/mobile-selection-storage.test.ts`
- Modify: `web/src/routes/app-router-architecture.test.ts`

- [ ] **Step 1: 写失败测试，约束 `/mobile` 路径和独立 storage key**

```ts
import { describe, expect, it } from "vitest";
import { loadMobileAccountId, storeMobileAccountId } from "./mobile-selection-storage";

it("uses a mobile-only account selection key", () => {
  storeMobileAccountId("account-1");
  expect(loadMobileAccountId()).toBe("account-1");
  expect(localStorage.getItem("gewehub.workbench.accountId")).toBeNull();
});
```

在路由架构测试中断言源码包含 `/mobile`、`/mobile/conversations`、`/mobile/contacts`、`/mobile/admin`、`/mobile/me`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- mobile-selection-storage.test.ts app-router-architecture.test.ts`

Expected: FAIL，模块或移动端路由常量尚不存在。

- [ ] **Step 3: 实现路径、导航元数据和独立选择持久化**

定义 `mobileRoutes`，所有路径以 `/mobile` 开头；定义四个 Tab 元数据；storage key 使用 `gewehub.mobile.accountId`，并在不可用 localStorage 时安全降级。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @gewehub/web test -- mobile-selection-storage.test.ts app-router-architecture.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile web/src/routes/app-router-architecture.test.ts
git commit -m "feat(web): add mobile navigation foundations"
```

### Task 2: 移动端路由树、认证和应用壳

**Files:**
- Create: `web/src/features/mobile/MobileAppShell.tsx`
- Create: `web/src/features/mobile/MobileTopBar.tsx`
- Create: `web/src/features/mobile/MobileBottomTabs.tsx`
- Create: `web/src/features/mobile/MobilePage.tsx`
- Create: `web/src/features/mobile/auth/MobileLoginPage.tsx`
- Create: `web/src/features/mobile/MobileAppShell.test.tsx`
- Modify: `web/src/routes/app-router.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/style-architecture.test.ts`

- [ ] **Step 1: 写失败测试**

测试：

- 未登录访问 `/mobile/conversations` 显示移动登录页；
- 登录后 `/mobile` 重定向到 `/mobile/conversations`；
- 一级页面显示四个 Tab；
- 二级页面可关闭 Tab；
- 当前 Tab 有 `aria-current="page"`；
- 样式源码包含 safe-area top/bottom 和 `100dvh`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileAppShell.test.tsx style-architecture.test.ts app-router-architecture.test.ts`

Expected: FAIL，移动端壳和路由尚不存在。

- [ ] **Step 3: 实现最小路由与移动端壳**

移动端认证继续使用 `useAuthMeQuery`、`useLoginMutation`、`useLogoutMutation`。桌面 ConsoleRoute 保持不变。MobileShell 使用 `min-height: 100dvh`，底部导航补 `safe-area-inset-bottom`。

- [ ] **Step 4: 运行测试与类型检查**

Run: `pnpm --filter @gewehub/web test -- MobileAppShell.test.tsx style-architecture.test.ts app-router-architecture.test.ts && pnpm --filter @gewehub/web typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile web/src/routes/app-router.tsx web/src/styles.css web/src/style-architecture.test.ts
git commit -m "feat(web): add mobile shell and routes"
```

### Task 3: 通用移动端 Action Sheet 与动作能力判定

**Files:**
- Create: `web/src/features/mobile/MobileActionSheet.tsx`
- Create: `web/src/features/mobile/MobileActionSheet.test.tsx`
- Create: `web/src/features/mobile/mobile-action-capabilities.ts`
- Create: `web/src/features/mobile/mobile-action-capabilities.test.ts`
- Modify: `web/src/features/workbench/MessageFlow.tsx`

- [ ] **Step 1: 写失败测试**

覆盖：

- 会话未读时出现“标为已读”；
- 本地失败消息只出现重试、删除；
- held 消息出现人工发送；
- 符合现有撤回窗口的自己消息出现撤回；
- 已撤回消息不出现撤回；
- Action Sheet 具备 dialog 语义、遮罩关闭、Escape 关闭和安全区。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- mobile-action-capabilities.test.ts MobileActionSheet.test.tsx MessageFlow.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现纯函数和通用抽屉**

只抽取当前 `MessageFlow`、`ConversationList` 已有动作规则，不增加复制和转发。桌面端继续使用原 hover/ContextMenu，但消费同一动作能力判定。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @gewehub/web test -- mobile-action-capabilities.test.ts MobileActionSheet.test.tsx MessageFlow.test.tsx WorkbenchConversationList.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile web/src/features/workbench/MessageFlow.tsx
git commit -m "feat(web): add shared mobile action capabilities"
```

### Task 4: 会话列表与账号切换

**Files:**
- Create: `web/src/features/mobile/conversations/MobileConversationsPage.tsx`
- Create: `web/src/features/mobile/conversations/MobileConversationRow.tsx`
- Create: `web/src/features/mobile/conversations/MobileConversationActions.tsx`
- Create: `web/src/features/mobile/conversations/MobileAccountPicker.tsx`
- Create: `web/src/features/mobile/conversations/MobileConversationsPage.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

使用现有工作台测试数据覆盖：当前账号、搜索、置顶分区、未读数、会话选择、账号切换、长按操作、空态、搜索无结果和断线提示。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileConversationsPage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现页面**

复用 `useWorkbenchWorkspaceQuery`、`filterConversationsForAccount`、`useConversationUnreadState`、`useWorkbenchConversationActions` 和现有映射函数。长按通过 Pointer Events 定时器触发，移动或取消时清理定时器，同时提供可访问的“更多”按钮作为替代入口。

- [ ] **Step 4: 运行相关回归**

Run: `pnpm --filter @gewehub/web test -- MobileConversationsPage.test.tsx WorkbenchConversationList.test.tsx WorkbenchRealtimeEvents.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/conversations web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile conversation list"
```

### Task 5: 移动端聊天消息流

**Files:**
- Create: `web/src/features/mobile/chat/MobileChatPage.tsx`
- Create: `web/src/features/mobile/chat/MobileMessageList.tsx`
- Create: `web/src/features/mobile/chat/MobileMessageActions.tsx`
- Create: `web/src/features/mobile/chat/MobileChatPage.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

覆盖：历史加载、日期分隔、消息左右布局、群发送者、加载更早、新消息按钮、头像详情、长按动作、本地失败重试/删除、held 人工发送、撤回确认和无消息状态。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileChatPage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现消息页**

复用 `useWorkbenchMessagesController`、`buildMessageTimeline`、`MessageNodeView`、撤回和人工发送控制器。移动端消息布局单独实现，不修改标准消息节点内容语义。

- [ ] **Step 4: 运行消息回归**

Run: `pnpm --filter @gewehub/web test -- MobileChatPage.test.tsx MessageFlow.test.tsx WorkbenchMessageArea.test.tsx WorkbenchLocalSendStatus.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/chat web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile chat message flow"
```

### Task 6: 移动端输入、引用、@ 和附件选择

**Files:**
- Create: `web/src/features/mobile/chat/MobileComposer.tsx`
- Create: `web/src/features/mobile/chat/MobileAttachmentSheet.tsx`
- Create: `web/src/features/mobile/chat/MobileComposer.test.tsx`
- Modify: `web/src/features/mobile/chat/MobileChatPage.tsx`

- [ ] **Step 1: 写失败测试**

覆盖文本发送、换行、引用清除、群成员 `@` 候选、图片/文件/语音文件选择、录音状态、待发送附件确认/删除，以及软键盘下输入区仍位于可见区域的样式断言。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileComposer.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现移动输入区**

复用 `useWorkbenchComposerController`、`mention-draft`、`useVoiceRecorder`、`MessageComposerBars` 的数据语义。隐藏文件 input 继续使用 Web 能力；不添加拍照入口。

- [ ] **Step 4: 运行发送回归**

Run: `pnpm --filter @gewehub/web test -- MobileComposer.test.tsx WorkbenchComposer.test.tsx WorkbenchComposerHtml.test.tsx WorkbenchSendResponse.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/chat
git commit -m "feat(web): add mobile message composer"
```

### Task 7: 视频、链接和 HTML 发送页面

**Files:**
- Create: `web/src/features/mobile/chat/MobileVideoSendPage.tsx`
- Create: `web/src/features/mobile/chat/MobileLinkSendPage.tsx`
- Create: `web/src/features/mobile/chat/MobileHtmlSendPage.tsx`
- Create: `web/src/features/mobile/chat/MobileComplexSendPages.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

覆盖现有字段与行为：视频和可选封面；链接 URL、解析、标题、描述、缩略图；HTML 内容/文件/地址三种来源以及标题、描述、缩略图。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileComplexSendPages.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现独立页面并连接现有控制器**

页面返回聊天时保留会话 ID；发送成功返回聊天；发送失败保留表单和错误信息。

- [ ] **Step 4: 运行回归**

Run: `pnpm --filter @gewehub/web test -- MobileComplexSendPages.test.tsx WorkbenchComposerHtml.test.tsx WorkbenchComposer.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/chat web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile complex send pages"
```

### Task 8: 通讯录联系人与群列表

**Files:**
- Create: `web/src/features/mobile/contacts/MobileContactsPage.tsx`
- Create: `web/src/features/mobile/contacts/MobileContactsPage.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

覆盖当前账号范围、联系人/群 Tab、搜索、现有状态筛选、同步通讯录、联系人发起聊天、群发起聊天、同步群成员、非 active 灰显和空态。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileContactsPage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现列表**

复用账号管理查询和现有 open conversation、sync contacts、sync group members 动作。移动端使用列表卡片，不使用 DataTable。

- [ ] **Step 4: 运行回归**

Run: `pnpm --filter @gewehub/web test -- MobileContactsPage.test.tsx AccountsPage.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/contacts web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile contacts and groups"
```

### Task 9: 联系人详情、群成员和会话管理

**Files:**
- Create: `web/src/features/mobile/contacts/MobileContactProfilePage.tsx`
- Create: `web/src/features/mobile/contacts/MobileGroupMembersPage.tsx`
- Create: `web/src/features/mobile/conversations/MobileConversationManagePage.tsx`
- Create: `web/src/features/mobile/contacts/MobileContactSurfaces.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

联系人详情只断言现有只读字段和打开私聊；群成员覆盖搜索、同步、加载更多、备注和详情；会话管理覆盖备注、应用绑定、过滤、防抖、最大等待、保存与解绑确认。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileContactSurfaces.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现页面**

复用联系人 profile query 和 `useWorkbenchConversationSurfaceController`。不得添加联系人编辑、群管理或虚构投递统计。

- [ ] **Step 4: 运行工作台回归**

Run: `pnpm --filter @gewehub/web test -- MobileContactSurfaces.test.tsx WorkbenchDetailPanel.test.tsx WorkbenchPage.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/contacts web/src/features/mobile/conversations web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile contact and conversation details"
```

### Task 10: 消息详情页面

**Files:**
- Create: `web/src/features/mobile/chat/MobileMessageDetailPage.tsx`
- Create: `web/src/features/mobile/chat/MobileMessageDetailPage.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

覆盖概览、标准 JSON、原始 payload、投递记录、复制、上一条/下一条和跳转推送日志。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileMessageDetailPage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现详情页**

复用消息详情 query、JsonViewer、CopyButton、StatusBadge 和 TimeText。

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @gewehub/web test -- MobileMessageDetailPage.test.tsx WorkbenchDetailPanel.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/chat web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile message detail"
```

### Task 11: 管理首页、我的和接入设置

**Files:**
- Create: `web/src/features/mobile/admin/MobileAdminHomePage.tsx`
- Create: `web/src/features/mobile/admin/MobileSettingsPage.tsx`
- Create: `web/src/features/mobile/me/MobileMePage.tsx`
- Create: `web/src/features/mobile/admin/MobileAdminHomePage.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

断言管理页只包含当前七个管理模块；“我的”包含管理员、GeWe 状态、微信账号切换、接入设置和退出；设置页只包含现有三个状态、回调前缀、复制和一键设置回调。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileAdminHomePage.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现页面**

复用现有 settings query 和认证 mutation，不增加在线编辑 Key。

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @gewehub/web test -- MobileAdminHomePage.test.tsx SettingsPage.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/admin web/src/features/mobile/me web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile admin home and settings"
```

### Task 12: 应用与微信账号管理

**Files:**
- Create: `web/src/features/mobile/admin/MobileEntityCard.tsx`
- Create: `web/src/features/mobile/admin/MobileAppsPage.tsx`
- Create: `web/src/features/mobile/admin/MobileAppEditPage.tsx`
- Create: `web/src/features/mobile/admin/MobileAppBindingsPage.tsx`
- Create: `web/src/features/mobile/admin/MobileAccountsPage.tsx`
- Create: `web/src/features/mobile/admin/MobileAccountEditPage.tsx`
- Create: `web/src/features/mobile/admin/MobileResources.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

应用覆盖列表、新增、编辑、绑定、重置 Token 和停用；账号覆盖在线摘要、资料刷新、通讯录、编辑、新增和停用。强确认规则沿用现有名称/wxid 输入。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileResources.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现卡片列表和详情表单**

抽取或复用现有 admin query/mutation；不在移动页面内复制 `apiFetch` 请求协议。

- [ ] **Step 4: 运行回归**

Run: `pnpm --filter @gewehub/web test -- MobileResources.test.tsx AppsPage.test.tsx AccountsPage.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/admin web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile app and account management"
```

### Task 13: 推送日志与发送记录

**Files:**
- Create: `web/src/features/mobile/admin/MobileDeliveriesPage.tsx`
- Create: `web/src/features/mobile/admin/MobileDeliveryDetailPage.tsx`
- Create: `web/src/features/mobile/admin/MobileSendRequestsPage.tsx`
- Create: `web/src/features/mobile/admin/MobileSendRequestDetailPage.tsx`
- Create: `web/src/features/mobile/admin/MobileDeliverySurfaces.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

覆盖现有状态筛选、搜索、刷新、分页、messageId 定位、详情、打开会话、重投、撤回和取消重试。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileDeliverySurfaces.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现卡片列表与独立详情**

保留 URL search 状态。JSON 使用 JsonViewer；确认动作沿用现有文案与 mutation。

- [ ] **Step 4: 运行回归**

Run: `pnpm --filter @gewehub/web test -- MobileDeliverySurfaces.test.tsx AdminPagesOperations.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/admin web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile delivery and send records"
```

### Task 14: HTML 页面与运行观测

**Files:**
- Create: `web/src/features/mobile/admin/MobileHtmlPagesPage.tsx`
- Create: `web/src/features/mobile/admin/MobileObservabilityPage.tsx`
- Create: `web/src/features/mobile/admin/MobileTaskDetailPage.tsx`
- Create: `web/src/features/mobile/admin/MobileOperations.test.tsx`
- Modify: `web/src/routes/app-router.tsx`

- [ ] **Step 1: 写失败测试**

HTML 页面覆盖筛选、搜索、链接、复制、发送详情和归档；观测覆盖健康摘要、四个指标、失败任务搜索、详情和重试。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- MobileOperations.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现页面**

公开 `/h/:token` 不注册到移动端壳；关联发送请求跳转统一发送详情。

- [ ] **Step 4: 运行回归**

Run: `pnpm --filter @gewehub/web test -- MobileOperations.test.tsx HtmlPagesPage.test.tsx AdminPagesStage3.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/features/mobile/admin web/src/routes/app-router.tsx
git commit -m "feat(web): add mobile html pages and observability"
```

### Task 15: 完整验收、视觉检查和文档回填

**Files:**
- Modify: `docs/superpowers/specs/2026-07-11-移动端适配-PRD.md`
- Modify: `docs/superpowers/plans/2026-07-11-移动端适配-implementation.md`
- Modify: tests found incomplete during audit

- [ ] **Step 1: 运行 Web 全量测试**

Run: `pnpm --filter @gewehub/web test`

Expected: 全部 PASS。

- [ ] **Step 2: 运行类型、构建和仓库级关键检查**

Run: `pnpm --filter @gewehub/web typecheck && pnpm --filter @gewehub/web build && pnpm --filter @gewehub/web lint`

Expected: 全部退出码 0。

- [ ] **Step 3: 启动应用并进行移动视口检查**

在 375×812、390×844、430×932 视口检查：

- 登录；
- 四个 Tab；
- 会话和聊天；
- 长按与抽屉；
- 输入区和安全区；
- 通讯录；
- 每个管理列表和详情；
- 无页面横向溢出。

- [ ] **Step 4: 对照 PRD 逐条审计**

逐项确认 PRD 第 11 节 P0、P1 和质量门槛有直接测试、代码或运行截图证据。发现缺口时先补实现和测试，不以“已有类似页面”代替验证。

- [ ] **Step 5: 更新文档状态并提交**

将 PRD 状态更新为“已实现”，计划勾选所有实际完成项，并提交：

```bash
git add web docs/superpowers
git commit -m "feat(web): complete mobile adaptation"
```
