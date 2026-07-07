import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Workbench 前端架构", () => {
  it("WorkbenchPage 主文件保持在 400 行以内，只保留页面级编排", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");

    expect(source.split("\n").length).toBeLessThanOrEqual(400);
  });

  it("工作台页面不直接导入 apiFetch，API 访问集中在 queries.ts", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");

    expect(source).not.toContain('from "@/lib/api"');
    expect(source).not.toContain("apiFetch(");
  });

  it("工作台页面使用 TanStack Query hooks 管理工作区和消息加载", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const queriesSource = readFileSync(resolve(__dirname, "queries.ts"), "utf8");

    expect(source).toContain("useWorkbenchWorkspaceQuery");
    expect(source).toContain("useWorkbenchMessagesQuery");
    expect(source).not.toContain("fetchWorkbenchWorkspace");
    expect(source).not.toContain("fetchWorkbenchMessages");
    expect(queriesSource).toContain("useQuery");
    expect(queriesSource).toContain("useWorkbenchWorkspaceQuery");
    expect(queriesSource).toContain("useWorkbenchMessagesQuery");
  });

  it("工作台 query 显式声明列表和实体 staleTime 策略", () => {
    const queriesSource = readFileSync(resolve(__dirname, "queries.ts"), "utf8");

    expect(queriesSource).toContain("WORKBENCH_LIST_STALE_TIME_MS");
    expect(queriesSource).toContain("WORKBENCH_ENTITY_STALE_TIME_MS");
    expect(queriesSource).toContain("staleTime: WORKBENCH_LIST_STALE_TIME_MS");
    expect(queriesSource).toContain("staleTime: WORKBENCH_ENTITY_STALE_TIME_MS");
  });

  it("工作台会话列表和消息流使用 TanStack Virtual，而不是直接 map 渲染整页列表", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const conversationListSource = readFileSync(resolve(__dirname, "ConversationList.tsx"), "utf8");
    const messagePanelSource = readFileSync(resolve(__dirname, "MessagePanel.tsx"), "utf8");

    expect(conversationListSource).toContain('from "@tanstack/react-virtual"');
    expect(conversationListSource).toContain("useVirtualizer");
    expect(conversationListSource).toContain("virtualizer");
    expect(messagePanelSource).toContain('from "@tanstack/react-virtual"');
    expect(messagePanelSource).toContain("useVirtualizer");
    expect(messagePanelSource).toContain("messageVirtualizer");
    expect(source).not.toContain("{conversations.map((conversation)");
    expect(source).not.toContain("{messages.map((message)");
  });

  it("消息虚拟列表使用动态测量，避免不同类型消息固定估高后重叠", () => {
    const messagePanelSource = readFileSync(resolve(__dirname, "MessagePanel.tsx"), "utf8");

    expect(messagePanelSource).toContain("measureElement");
    expect(messagePanelSource).toContain("ref={messageVirtualizer.measureElement}");
    expect(messagePanelSource).toContain('data-index={virtualItem.index}');
    expect(messagePanelSource).toContain("estimateMessageTimelineItemSize");
    expect(messagePanelSource).not.toContain("estimateSize: () => 112");
  });

  it("消息流展示组件拆出独立模块，WorkbenchPage 只负责编排虚拟列表", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const messagePanelSource = readFileSync(resolve(__dirname, "MessagePanel.tsx"), "utf8");
    const messageFlowPath = resolve(__dirname, "MessageFlow.tsx");

    expect(existsSync(messageFlowPath)).toBe(true);
    expect(messagePanelSource).toContain('from "@/features/workbench/MessageFlow"');
    expect(source).not.toContain("function MessageBubble(");
    expect(source).not.toContain("function DateSeparator(");
    expect(source).not.toContain("function DeliveryStatusDot(");
  });

  it("消息区面板拆出独立模块，WorkbenchPage 不再承载消息列表和拖拽层渲染", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const messagePanelPath = resolve(__dirname, "MessagePanel.tsx");

    expect(existsSync(messagePanelPath)).toBe(true);
    expect(source).toContain('from "@/features/workbench/MessagePanel"');
    expect(source).not.toContain("<section");
    expect(source).not.toContain("messageVirtualizer");
    expect(source).not.toContain("<DateSeparator");
    expect(source).not.toContain("<MessageBubble");
  });

  it("会话列表拆出独立模块，WorkbenchPage 不再承载左侧列表渲染和虚拟化", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const conversationListPath = resolve(__dirname, "ConversationList.tsx");

    expect(existsSync(conversationListPath)).toBe(true);
    expect(source).toContain('from "@/features/workbench/ConversationList"');
    expect(source).not.toContain("conversationVirtualizer");
    expect(source).not.toContain("function filterConversations(");
    expect(source).not.toContain("<aside aria-label=\"会话列表\"");
  });

  it("消息调试弹窗拆出独立模块，WorkbenchPage 不再承载调试详情渲染", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const debugDialogPath = resolve(__dirname, "MessageDebugDialog.tsx");

    expect(existsSync(debugDialogPath)).toBe(true);
    expect(source).toContain('from "@/features/workbench/MessageDebugDialog"');
    expect(source).not.toContain("function MessageDebugDialog(");
    expect(source).not.toContain("function MessageDebugContent(");
    expect(source).not.toContain("function DebugPanel(");
  });

  it("消息发送编辑器拆出独立模块，WorkbenchPage 不再承载附件条和工具栏渲染", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const composerPath = resolve(__dirname, "MessageComposer.tsx");

    expect(existsSync(composerPath)).toBe(true);
    expect(source).toContain('from "@/features/workbench/MessageComposer"');
    expect(source).not.toContain("function PendingAttachmentBar(");
    expect(source).not.toContain("function PendingAttachmentIcon(");
  });

  it("语音录制状态拆出 hook，WorkbenchPage 不直接持有 MediaRecorder 细节", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const composerControllerSource = readFileSync(resolve(__dirname, "useWorkbenchComposerController.ts"), "utf8");
    const voiceRecorderPath = resolve(__dirname, "useVoiceRecorder.ts");

    expect(existsSync(voiceRecorderPath)).toBe(true);
    expect(composerControllerSource).toContain('from "@/features/workbench/useVoiceRecorder"');
    expect(source).not.toContain("voiceRecorderRef");
    expect(source).not.toContain("voiceRecordingStreamRef");
    expect(source).not.toContain("new MediaRecorder");
    expect(source).not.toContain("navigator.mediaDevices?.getUserMedia");
    expect(source).not.toContain('from "@/features/workbench/useVoiceRecorder"');
  });

  it("旧右侧会话详情面板已删除，群成员面板和会话管理抽屉承接新详情入口", () => {
    const source = readFileSync(resolve(__dirname, "WorkbenchPage.tsx"), "utf8");
    const detailPanelPath = resolve(__dirname, "DetailPanel.tsx");
    const groupMembersPanelPath = resolve(__dirname, "GroupMembersPanel.tsx");
    const conversationManagementSheetPath = resolve(__dirname, "ConversationManagementSheet.tsx");

    expect(existsSync(detailPanelPath)).toBe(false);
    expect(existsSync(groupMembersPanelPath)).toBe(true);
    expect(existsSync(conversationManagementSheetPath)).toBe(true);
    expect(source).not.toContain('from "@/features/workbench/DetailPanel"');
    expect(source).toContain('from "@/features/workbench/GroupMembersPanel"');
    expect(source).toContain('from "@/features/workbench/WorkbenchConversationOverlays"');
    expect(source).not.toContain("function DetailSection(");
    expect(source).not.toContain("function ConversationBindingPanel(");
    expect(source).not.toContain("function MemberList(");
  });
});
