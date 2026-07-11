import { describe, expect, it } from "vitest";
import type { ConversationSummary, MessageItem } from "@/lib/workspace-data";
import {
  getConversationActionCapabilities,
  getMessageActionCapabilities,
} from "./mobile-action-capabilities";

describe("移动端动作能力判定", () => {
  it("会话存在未读消息时提供标为已读，并保留现有会话动作", () => {
    expect(getConversationActionCapabilities(buildConversation({ unread: 3 }))).toEqual({
      canTogglePinned: true,
      pinned: false,
      canHide: true,
      canMarkRead: true,
      canEditRemark: true,
      canManage: true,
    });

    expect(getConversationActionCapabilities(buildConversation({ unread: 0 })).canMarkRead).toBe(false);
  });

  it("本地失败消息只提供重试和删除", () => {
    expect(
      getMessageActionCapabilities({
        ...buildMessage(),
        localSend: {
          conversationId: "conv_1",
          type: "text",
          text: "失败消息",
          label: "失败消息",
          status: "failed",
        },
      }),
    ).toEqual({
      canQuote: false,
      canShowDetail: false,
      canDispatchHeld: false,
      canRevoke: false,
      canRetryLocalSend: true,
      canDeleteLocalSend: true,
    });
  });

  it("本地 pending 消息不提供任何可执行动作", () => {
    expect(
      getMessageActionCapabilities({
        ...buildMessage(),
        localSend: {
          conversationId: "conv_1",
          type: "text",
          text: "发送中消息",
          label: "发送中消息",
          status: "pending",
        },
      }),
    ).toEqual({
      canQuote: false,
      canShowDetail: false,
      canDispatchHeld: false,
      canRevoke: false,
      canRetryLocalSend: false,
      canDeleteLocalSend: false,
    });
  });

  it("held 消息提供人工发送，但 pending 消息不提供", () => {
    expect(
      getMessageActionCapabilities({
        ...buildMessage(),
        isSent: false,
        sendRequest: { id: "send_1", status: "held", deliveryMode: "confirm" },
      }).canDispatchHeld,
    ).toBe(true);

    expect(
      getMessageActionCapabilities({
        ...buildMessage(),
        isSent: false,
        sendRequest: { id: "send_1", status: "pending" },
      }).canDispatchHeld,
    ).toBe(false);
  });

  it("仅自己在现有两分钟窗口内的正常已发送消息可撤回", () => {
    const nowMs = new Date("2026-07-11T10:00:00.000Z").getTime();
    const recent = buildMessage({ sentAtIso: "2026-07-11T09:59:00.000Z" });

    expect(getMessageActionCapabilities(recent, nowMs).canRevoke).toBe(true);
    expect(
      getMessageActionCapabilities({ ...recent, sentAtIso: "2026-07-11T09:57:59.999Z" }, nowMs).canRevoke,
    ).toBe(false);
    expect(getMessageActionCapabilities({ ...recent, isSelf: false }, nowMs).canRevoke).toBe(false);
    expect(getMessageActionCapabilities({ ...recent, status: "revoked" }, nowMs).canRevoke).toBe(false);
  });
});

function buildMessage(overrides: Partial<MessageItem> = {}): MessageItem {
  return {
    id: "row_1",
    messageId: "msg_1",
    sendRequestId: "send_1",
    isSent: true,
    senderName: "客服主号",
    senderProfile: { wxid: "wxid_bot", nickname: "客服主号", status: "active" },
    isSelf: true,
    sentAt: "18:00",
    sentAtIso: "2026-07-11T09:59:00.000Z",
    status: "normal",
    revokedAtIso: null,
    content: { type: "text", text: "消息" },
    standardJson: {},
    rawPayload: null,
    deliveries: [],
    ...overrides,
  };
}

function buildConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "conv_1",
    name: "测试会话",
    originalName: "测试会话",
    type: "private",
    lastMessage: "消息",
    lastAt: "10:00",
    unread: 0,
    avatarText: "测",
    status: "active",
    raw: {
      id: "conv_1",
      peerWxid: "wxid_peer",
      type: "private",
    },
    ...overrides,
  };
}
