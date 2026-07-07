import { describe, expect, it } from "vitest";
import {
  mapAccountSummary,
  mapConversationSummary,
  mapMessageItem,
} from "./workspace-data";

describe("workspace-data", () => {
  it("把后端账号/会话/消息响应映射为工作台视图模型", () => {
    const account = mapAccountSummary({
      id: "acc_1",
      wxid: "wxid_bot",
      nickname: "客服主号",
      onlineStatus: "online",
    });
    const conversation = mapConversationSummary({
      id: "conv_1",
      peerWxid: "room@chatroom",
      type: "group",
      name: "原始群名",
      avatarUrl: "https://example.test/group.jpg",
      platformRemark: "产品体验群",
      lastMessageText: "[聊天记录] 摘要",
      lastMessageAt: "2026-07-06T07:16:37.000Z",
      status: "active",
      app: { id: "app_1", name: "Hermes 助手" },
    });
    const message = mapMessageItem({
      id: "row_1",
      messageId: "msg_1",
      senderWxid: "wxid_sender",
      isSelf: false,
      status: "normal",
      sentAt: "2026-07-06T07:16:37.000Z",
      senderProfile: {
        wxid: "wxid_sender",
        nickname: "陈可乐",
        displayName: "可乐",
        platformRemark: "客户负责人",
        avatarUrl: "https://example.test/member.jpg",
        status: "active",
      },
      payload: {
        sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
        content: { type: "chat_record", text: "聊天记录摘要", items: [] },
      },
      webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
      deliveries: [{ eventId: "del_1", status: "delivered" }],
    });

    expect(account).toEqual({
      id: "acc_1",
      name: "客服主号",
      wxid: "wxid_bot",
      nickname: "客服主号",
      platformRemark: null,
      avatarUrl: null,
      status: "online",
      raw: {
        id: "acc_1",
        wxid: "wxid_bot",
        nickname: "客服主号",
        onlineStatus: "online",
      },
    });
    expect(conversation).toMatchObject({
      id: "conv_1",
      name: "产品体验群(原始群名)",
      lastMessage: "[聊天记录] 摘要",
      appName: "Hermes 助手",
      avatarText: "产",
      avatarUrl: "https://example.test/group.jpg",
    });
    expect(message).toMatchObject({
      id: "row_1",
      sentAt: "15:16",
      sentAtIso: "2026-07-06T07:16:37.000Z",
      senderName: "客户负责人",
      senderProfile: {
        wxid: "wxid_sender",
        nickname: "陈可乐",
        displayName: "可乐",
        platformRemark: "客户负责人",
        avatarUrl: "https://example.test/member.jpg",
        status: "active",
      },
      status: "normal",
      content: { type: "chat_record", text: "聊天记录摘要", items: [] },
      rawPayload: { TypeName: "AddMsg" },
    });
  });

  it("消息没有 senderProfile 时使用标准 payload 的发送者名称作为显示名", () => {
    const message = mapMessageItem({
      id: "row_1",
      messageId: "msg_1",
      senderWxid: "wxid_sender",
      isSelf: false,
      status: "normal",
      sentAt: "2026-07-06T07:16:37.000Z",
      payload: {
        sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
        content: { type: "text", text: "你好" },
      },
      webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
      deliveries: [],
    });

    expect(message.senderName).toBe("陈可乐");
    expect(message.senderProfile.wxid).toBe("wxid_sender");
  });

  it("把标准消息顶层 quote 合并到内容节点供聊天气泡渲染", () => {
    const message = mapMessageItem({
      id: "row_1",
      messageId: "msg_quote_1",
      senderWxid: "wxid_sender",
      isSelf: false,
      status: "normal",
      sentAt: "2026-07-07T10:25:13.000Z",
      payload: {
        sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
        content: { type: "text", text: "为啥不说话" },
        quote: {
          type: "text",
          text: "@陳可乐\u2005说话",
          senderName: "陈可乐",
          sourceMessageId: "msg_2146752681472263200",
        },
      },
      deliveries: [],
    });

    expect(message.content).toMatchObject({
      type: "text",
      text: "为啥不说话",
      quote: {
        type: "text",
        text: "@陳可乐\u2005说话",
        senderName: "陈可乐",
        sourceMessageId: "msg_2146752681472263200",
      },
    });
  });

  it("内容节点已有 quote 时不被顶层 quote 覆盖", () => {
    const message = mapMessageItem({
      id: "row_1",
      messageId: "msg_quote_2",
      senderWxid: "wxid_sender",
      isSelf: false,
      status: "normal",
      sentAt: "2026-07-07T10:25:13.000Z",
      payload: {
        content: {
          type: "chat_record",
          text: "聊天记录",
          items: [],
          quote: { type: "text", text: "内层引用" },
        },
        quote: { type: "text", text: "顶层引用" },
      },
      deliveries: [],
    });

    expect(message.content.quote).toEqual({ type: "text", text: "内层引用" });
  });
});
