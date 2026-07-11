# 群聊 @ 输入交互与发送修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让后台群聊中键入 `@` 可选择成员并产生与 GeWe 协议一致的真实 @，同时支持删除自动空格仅取消结构化 @ 元数据。

**Architecture:** 前端保留受控 `textarea`，新增纯函数 mention 草稿状态机，以 token 区间把可见文本和 wxid 绑定。选择成员时替换当前 `@查询` 为 `@名称 `；发送时从仍有效的 token 派生 `mentions`。服务端继续映射文本到 GeWe `content`、wxid 数组到 `ats`，并把出站 mention 写入本地标准消息；引用消息时明确拒绝真实 @，不允许静默失效。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、NestJS、Prisma、Zod。

---

### Task 1: 建立 mention 草稿状态机和单元测试

**Files:**
- Create: `web/src/features/workbench/mention-draft.ts`
- Create: `web/src/features/workbench/mention-draft.test.ts`

- [ ] **Step 1: 写入失败的草稿状态机测试**

```ts
import { describe, expect, it } from "vitest";
import { applyMentionTextChange, createMentionDraft, getActiveMentionQuery, getEffectiveMentionWxids, insertMention } from "./mention-draft";

it("选择成员会替换当前 @ 查询并在末尾插入自动空格", () => {
  const draft = createMentionDraft("请 @负", 4);
  const next = insertMention(draft, { wxid: "wxid_kele", label: "负责人" }, 4);
  expect(next.text).toBe("请 @负责人 ");
  expect(next.selectionStart).toBe("请 @负责人 ".length);
  expect(getEffectiveMentionWxids(next)).toEqual(["wxid_kele"]);
});

it("删除自动空格仅移除真实 mention，不删除 @名称 文本", () => {
  const selected = insertMention(createMentionDraft("@", 1), { wxid: "wxid_kele", label: "负责人" }, 1);
  const changed = applyMentionTextChange(selected, "@负责人", "@负责人".length);
  expect(changed.text).toBe("@负责人");
  expect(getEffectiveMentionWxids(changed)).toEqual([]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @gewehub/web test -- mention-draft.test.ts`

Expected: FAIL，提示找不到 `./mention-draft` 或导出的状态机函数。

- [ ] **Step 3: 实现最小状态机**

在 `mention-draft.ts` 定义并导出：

```ts
export interface MentionCandidate { wxid: string; label: string }
export interface MentionToken { id: string; wxid: string; label: string; start: number; end: number; markerIndex: number }
export interface MentionDraft { text: string; selectionStart: number; tokens: MentionToken[] }
export function createMentionDraft(text?: string, selectionStart?: number): MentionDraft
export function getActiveMentionQuery(draft: MentionDraft): { start: number; query: string } | null
export function insertMention(draft: MentionDraft, member: MentionCandidate, selectionStart?: number): MentionDraft
export function applyMentionTextChange(previous: MentionDraft, text: string, selectionStart: number): MentionDraft
export function getEffectiveMentionWxids(draft: MentionDraft): string[]
```

实现规则：`insertMention()` 只替换当前光标前的裸 `@查询`；插入 `@${label} ` 并建立 token。`applyMentionTextChange()` 使用公共前缀/后缀取得最小编辑区间，编辑触及 token 的文本本体或 marker 时移除 token，编辑 token 外内容则重定位 token 偏移。`getEffectiveMentionWxids()` 只返回 `text[token.markerIndex] === " "` 的去重 wxid。

- [ ] **Step 4: 运行状态机测试确认通过**

Run: `pnpm --filter @gewehub/web test -- mention-draft.test.ts`

Expected: PASS，覆盖查询、选择、删 marker、编辑 token 本体和 token 外 offset 重定位。

- [ ] **Step 5: 提交该任务**

```bash
git add web/src/features/workbench/mention-draft.ts web/src/features/workbench/mention-draft.test.ts
git commit -m "feat: add mention draft state machine"
```

### Task 2: 将 composer 替换为输入触发的成员选择

**Files:**
- Modify: `web/src/features/workbench/MessageComposer.tsx:57-347`
- Modify: `web/src/features/workbench/MessageComposerBars.tsx:1-59`
- Modify: `web/src/features/workbench/useWorkbenchComposerController.ts:67-145,472-521`
- Modify: `web/src/features/workbench/WorkbenchComposerOutlet.tsx:14-74`
- Test: `web/src/features/workbench/WorkbenchPage.test.tsx:378-474`

- [ ] **Step 1: 写入失败的页面交互测试**

把旧的“点击 `@负责人` 按钮、再手工输入文本”测试替换为：

```tsx
fireEvent.change(screen.getByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行"), {
  target: { value: "请 @负", selectionStart: 4 },
});
expect(await screen.findByRole("button", { name: "提及 负责人" })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "提及 负责人" }));
expect(textarea).toHaveValue("请 @负责人 ");
fireEvent.change(textarea, { target: { value: "请 @负责人", selectionStart: 6 } });
fireEvent.click(screen.getByRole("button", { name: "发送" }));
expect(lastSendBody()).toMatchObject({ text: "请 @负责人", mentions: undefined });
```

另加成功路径，断言选择后未删除 marker 时请求含：

```ts
{ text: "请 @负责人 请确认", mentions: ["wxid_kele"] }
```

- [ ] **Step 2: 运行页面测试确认失败**

Run: `pnpm --filter @gewehub/web test -- WorkbenchPage.test.tsx`

Expected: FAIL，因为当前没有“提及 负责人”候选，也不会自动写入 `@负责人 `。

- [ ] **Step 3: 改造控制器和组件**

- 删除 `selectedMentionWxids` 和 `toggleMention`，使用 `MentionDraft` 作为文本和 token 的唯一状态。
- controller 暴露 `messageText`、`mentionCandidates`、`activeMentionQuery`、`onMessageTextChange(text, selectionStart)`、`onInsertMention(member, selectionStart)`。
- 仅在群聊显示候选；过滤 `member.status === "active"`，再按 `platformRemark`、`displayName`、`nickname`、`wxid` 匹配 query。
- `MessageComposer` 移除 `MentionBar`，在 textarea 下方渲染角色为 `listbox` 的候选面板；候选按钮使用 `aria-label="提及 ${label}"`。
- textarea `onChange` 把 `event.target.value` 与 `event.target.selectionStart` 传给 controller；选择候选后用 ref 在下一个微任务恢复 selection。
- 发送时传 `draft.text.trim()` 与 `getEffectiveMentionWxids(draft)`；成功才清空 draft。失败保留完整 draft。
- 有 `quotedMessage` 且有效 mentions 非空时，在发送前设置错误：`引用消息暂不支持真实 @；请取消引用后再发送。`，不调用请求。

- [ ] **Step 4: 运行页面与 composer 相关测试确认通过**

Run: `pnpm --filter @gewehub/web test -- WorkbenchPage.test.tsx WorkbenchComposer.test.tsx`

Expected: PASS，旧 @ 快捷栏不再存在，输入触发候选、插入文本、marker 删除取消元数据、引用拦截均被覆盖。

- [ ] **Step 5: 提交该任务**

```bash
git add web/src/features/workbench/MessageComposer.tsx web/src/features/workbench/MessageComposerBars.tsx web/src/features/workbench/useWorkbenchComposerController.ts web/src/features/workbench/WorkbenchComposerOutlet.tsx web/src/features/workbench/WorkbenchPage.test.tsx
git commit -m "feat: add inline group mention composer"
```

### Task 3: 保存出站 mention 并锁定 GeWe 文本协议

**Files:**
- Modify: `server/src/modules/send/send-utils.ts:7-49,193-264`
- Modify: `server/src/modules/send/send.controller.ts:102-192`
- Test: `server/test/send-utils.test.ts:1-112`
- Test: `server/test/send-controller.test.ts`

- [ ] **Step 1: 写入失败的后端回归测试**

在 `send-utils.test.ts` 增加：

```ts
it("保留可见 @ 文本并把 wxid 映射到 GeWe ats", () => {
  expect(mapSendRequestToGewe({
    appId: "wx_app", peerWxid: "room@chatroom", type: "text",
    text: "@负责人 请确认", mentions: ["wxid_kele"],
  }).body).toEqual({
    appId: "wx_app", toWxid: "room@chatroom",
    content: "@负责人 请确认", ats: "wxid_kele",
  });
});

it("本地出站消息保存结构化 mention", () => {
  const local = buildLocalHubSendMessage({ /* 基础字段 */ mentions: [{ wxid: "wxid_kele", name: "负责人", resolved: true }] });
  expect(local.payload.mentions).toEqual([{ wxid: "wxid_kele", name: "负责人", resolved: true }]);
});
```

在 controller 测试增加：请求含 `mentions: ["wxid_kele"]` 时，创建的本地 message payload 具有同一个 wxid 的 resolved mention。

- [ ] **Step 2: 运行后端测试确认失败**

Run: `pnpm --filter @gewehub/server test -- send-utils.test.ts send-controller.test.ts`

Expected: FAIL，因为 `LocalHubSendInput` 还没有 `mentions`，且本地 payload 固定为空数组。

- [ ] **Step 3: 以最小实现修复服务端审计**

- 为 `LocalHubSendInput` 加：`mentions?: Array<{ wxid: string; name?: string; resolved: boolean }>`。
- `buildLocalHubSendMessage()` 使用 `input.mentions ?? []` 设置 `payload.mentions`。
- controller 创建本地消息时从 `body.mentions` 生成 `{ wxid, resolved: true }`；仅保留非空、去重的 wxid，不伪造成员名字。
- 保持 `mapSendRequestToGewe()` 的 `content` 原样透传和 `ats` 逗号分隔，实现不能再剥离可见 `@名称`。

- [ ] **Step 4: 运行后端测试确认通过**

Run: `pnpm --filter @gewehub/server test -- send-utils.test.ts send-controller.test.ts`

Expected: PASS，验证 `content + ats` 组合和本地出站 mention payload。

- [ ] **Step 5: 提交该任务**

```bash
git add server/src/modules/send/send-utils.ts server/src/modules/send/send.controller.ts server/test/send-utils.test.ts server/test/send-controller.test.ts
git commit -m "fix: preserve outbound mentions in sent messages"
```

### Task 4: 全量验证与文档检查

**Files:**
- Modify: `docs/superpowers/specs/2026-07-11-group-mention-design.md`
- Modify: `docs/superpowers/plans/2026-07-11-group-mention-implementation.md`

- [ ] **Step 1: 更新设计文档的实际验证记录**

在设计文档末尾增加“验证记录”小节，列出执行过的精确命令和结果，不写未执行的命令。

- [ ] **Step 2: 运行针对性测试**

Run:

```bash
pnpm --filter @gewehub/web test -- mention-draft.test.ts WorkbenchPage.test.tsx WorkbenchComposer.test.tsx
pnpm --filter @gewehub/server test -- send-utils.test.ts send-controller.test.ts
```

Expected: 每条命令 exit code 0。

- [ ] **Step 3: 运行类型检查、全量测试和构建**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 每条命令 exit code 0；若既有不相关失败，记录命令、失败文件和与本功能的关系，不能声称全绿。

- [ ] **Step 4: 检查需求覆盖与工作区状态**

Run:

```bash
git diff --check
git status --short
git log --oneline -3
```

Expected: `git diff --check` 无输出；状态只包含本任务预期文档或无未提交修改；日志包含三个任务提交。

- [ ] **Step 5: 提交验证记录**

```bash
git add docs/superpowers/specs/2026-07-11-group-mention-design.md docs/superpowers/plans/2026-07-11-group-mention-implementation.md
git commit -m "docs: record group mention design and verification"
```
