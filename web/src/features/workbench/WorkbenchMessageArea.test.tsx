import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messageFixture, mockFetch, renderWorkbenchPage } from "./WorkbenchPage.test-utils";

describe("WorkbenchPage message area", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("卡片型消息不额外套外层边框气泡", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "room@chatroom",
          type: "group",
          platformRemark: "真实产品群",
          lastMessageText: "[聊天记录] 群聊的聊天记录",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        {
          id: "row_text",
          messageId: "msg_text",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:38.000Z",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "文本消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
          deliveries: [],
        },
        {
          id: "row_card",
          messageId: "msg_card",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: {
              type: "chat_record",
              text: "群聊的聊天记录",
              items: [{ type: "text", text: "内层消息" }],
            },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
          deliveries: [],
        },
      ],
    });

    const { container } = renderWorkbenchPage();

    await screen.findByText("文本消息");
    const textFrame = container.querySelector('[data-message-frame-kind="bubble"]');
    const cardFrame = container.querySelector('[data-message-frame-kind="bare"]');

    expect(textFrame).toHaveClass("border");
    expect(cardFrame).not.toHaveClass("border");
    expect(cardFrame).not.toHaveClass("px-3");
    expect(cardFrame).not.toHaveClass("py-2");
    expect(screen.getByRole("button", { name: "打开群聊的聊天记录" })).toBeInTheDocument();
  });

  it("私聊消息区无右栏、无消息右键和选中 ring，详情按钮打开消息详情抽屉", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "私聊消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        {
          id: "row_private",
          messageId: "msg_private",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          renderedText: "私聊消息",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "私聊消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg", Data: { MsgId: "123" } } },
          deliveries: [{ eventId: "del_private", status: "delivered" }],
        },
      ],
    });

    const { container } = renderWorkbenchPage();

    const messageRegion = screen.getByLabelText("消息区");
    const messageText = await within(messageRegion).findByText("私聊消息");
    expect(screen.queryByLabelText("会话详情")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("群成员面板")).not.toBeInTheDocument();

    fireEvent.click(messageText);
    expect(container.querySelector(".ring-2.ring-ring")).not.toBeInTheDocument();

    fireEvent.contextMenu(messageText);
    expect(screen.queryByRole("menu", { name: "消息操作" })).not.toBeInTheDocument();

    fireEvent.click(within(messageRegion).getByRole("button", { name: "查看消息详情 msg_private" }));

    const sheet = await screen.findByRole("dialog", { name: "消息详情" });
    expect(within(sheet).getAllByText("msg_private").length).toBeGreaterThan(0);
    expect(within(sheet).getByRole("tab", { name: "概览" })).toBeInTheDocument();
    expect(within(sheet).getByRole("tab", { name: "标准 JSON" })).toBeInTheDocument();
    expect(within(sheet).getByRole("tab", { name: "原始 payload" })).toBeInTheDocument();
    expect(within(sheet).getByRole("tab", { name: "投递记录" })).toBeInTheDocument();
    expect(within(sheet).getByText("del_private")).toBeInTheDocument();
  });

  it("点击头像打开联系人详情 Dialog，hover 不展示联系人浮层", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "room_alpha@chatroom",
          type: "group",
          platformRemark: "Alpha 产品群",
          lastMessageText: "群成员消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        {
          id: "row_member",
          messageId: "msg_member",
          senderWxid: "wxid_owner",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          renderedText: "群成员消息",
          senderProfile: {
            wxid: "wxid_owner",
            nickname: "陈可乐",
            displayName: "可乐",
            platformRemark: "负责人",
            avatarUrl: "https://example.test/avatar.jpg",
            status: "active",
          },
          payload: {
            sender: { wxid: "wxid_owner", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "群成员消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
          deliveries: [],
        },
      ],
      "/api/groups?accountId=acc_1&q=room_alpha%40chatroom": [
        {
          id: "group_1",
          accountId: "acc_1",
          wxid: "room_alpha@chatroom",
          name: "Alpha 产品群",
          status: "active",
        },
      ],
      "/api/groups/group_1/members?take=50&skip=0": {
        items: [],
        total: 0,
        take: 50,
        skip: 0,
        nextSkip: 0,
        hasMore: false,
      },
      "/api/contacts/wxid_owner/profile?accountId=acc_1": {
        accountId: "acc_1",
        wxid: "wxid_owner",
        contact: {
          id: "contact_1",
          wxid: "wxid_owner",
          nickname: "陈可乐",
          avatarUrl: "https://example.test/avatar.jpg",
          platformRemark: "负责人",
          status: "active",
        },
        groupMemberships: [
          {
            id: "member_1",
            wxid: "wxid_owner",
            nickname: "陈可乐",
            displayName: "可乐",
            avatarUrl: "https://example.test/avatar.jpg",
            platformRemark: "负责人",
            status: "active",
            group: {
              id: "group_1",
              wxid: "room_alpha@chatroom",
              name: "Alpha 产品群",
              avatarUrl: null,
              platformRemark: null,
            },
          },
        ],
        privateConversation: {
          id: "conv_private",
          accountId: "acc_1",
          peerWxid: "wxid_owner",
          type: "private",
          name: "陈可乐",
          platformRemark: "负责人",
          deliveryFilter: "all",
          lastMessageAt: null,
          lastMessageText: null,
          messageCount: 0,
          status: "active",
          pinnedAt: null,
          isHidden: false,
          lastOpenedAt: null,
          unreadCount: 0,
        },
        commonGroups: [
          {
            id: "group_1",
            wxid: "room_alpha@chatroom",
            name: "Alpha 产品群",
            avatarUrl: null,
            platformRemark: null,
          },
        ],
      },
    });

    renderWorkbenchPage();

    expect(await within(screen.getByLabelText("消息区")).findByText("群成员消息")).toBeInTheDocument();
    const avatarButton = screen.getByRole("button", { name: "查看联系人 负责人" });
    fireEvent.mouseEnter(avatarButton);
    expect(screen.queryByRole("dialog", { name: "联系人详情" })).not.toBeInTheDocument();

    fireEvent.click(avatarButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contacts/wxid_owner/profile?accountId=acc_1",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    const dialog = await screen.findByRole("dialog", { name: "联系人详情" });
    expect(within(dialog).getAllByText("负责人").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("wxid_owner").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Alpha 产品群")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "打开私聊会话 负责人" })).toBeInTheDocument();
  });

  it("撤回消息保留原始气泡渲染并在 meta 行常显已撤回标签", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "已撤回的原始内容",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        {
          id: "row_revoked",
          messageId: "msg_revoked",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "revoked",
          sentAt: "2026-07-06T07:16:37.000Z",
          renderedText: "已撤回的原始内容",
          payload: {
            eventType: "message.revoked",
            revokedAt: "2026-07-06T07:17:37.000Z",
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "已撤回的原始内容" },
          },
          webhookEvent: { rawPayload: { TypeName: "RevokeMsg", Data: { MsgId: "123" } } },
          deliveries: [],
        },
      ],
    });

    const { container } = renderWorkbenchPage();

    const messageRegion = screen.getByLabelText("消息区");
    expect(await within(messageRegion).findByText("已撤回的原始内容")).toBeInTheDocument();
    expect(within(messageRegion).getByText("已撤回")).toBeInTheDocument();
    expect(within(messageRegion).queryByText("[已撤回]")).not.toBeInTheDocument();
    expect(container.querySelector('[data-message-status="revoked"]')).toHaveClass("bg-destructive/5");
  });

  it("聊天流按日期分隔，并将同一发送者 3 分钟内连续消息合并为一组", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "room@chatroom",
          type: "group",
          platformRemark: "真实产品群",
          lastMessageText: "今天第二条",
          lastMessageAt: "2026-07-06T07:18:00.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_today_2", "msg_today_2", "今天第二条", "2026-07-06T07:18:00.000Z"),
        messageFixture("row_today_1", "msg_today_1", "今天第一条", "2026-07-06T07:16:37.000Z"),
        messageFixture("row_yesterday", "msg_yesterday", "昨天消息", "2026-07-05T23:59:00.000Z"),
      ],
    });

    const { container } = renderWorkbenchPage();

    const messageRegion = screen.getByLabelText("消息区");
    expect(await within(messageRegion).findByText("昨天消息")).toBeInTheDocument();
    expect(await within(messageRegion).findByText("今天第一条")).toBeInTheDocument();
    expect(await within(messageRegion).findByText("今天第二条")).toBeInTheDocument();
    const sentAt = within(messageRegion).getAllByText("07-06 15:16")[0];
    expect(sentAt?.tagName.toLowerCase()).toBe("time");
    expect(sentAt).toHaveAttribute("datetime", "2026-07-06T07:16:37.000Z");
    expect(sentAt).toHaveAttribute("title", "2026-07-06 15:16:37");
    expect(screen.getByText("2026年7月5日")).toBeInTheDocument();
    expect(screen.getByText("2026年7月6日")).toBeInTheDocument();

    const groupStarts = container.querySelectorAll('[data-message-group-start="true"]');
    const groupedContinuations = container.querySelectorAll('[data-message-group-start="false"]');
    expect(groupStarts).toHaveLength(2);
    expect(groupedContinuations).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "查看联系人 陈可乐" })).toHaveLength(2);
  });

  it("消息气泡展示投递状态点，点击后打开消息详情抽屉", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "room@chatroom",
          type: "group",
          platformRemark: "真实产品群",
          lastMessageText: "投递状态消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
          app: { id: "app_1", name: "Hermes 助手" },
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        {
          id: "row_delivery",
          messageId: "msg_delivery",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          renderedText: "投递状态消息",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "投递状态消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
          deliveries: [{ eventId: "del_delivery", status: "failed" }],
        },
      ],
    });

    renderWorkbenchPage();

    expect(await within(screen.getByLabelText("消息区")).findByText("投递状态消息")).toBeInTheDocument();
    const deliveryDot = screen.getByRole("button", { name: "查看投递状态 failed" });
    expect(deliveryDot).toHaveAttribute("data-delivery-status", "failed");

    fireEvent.click(deliveryDot);

    const dialog = await screen.findByRole("dialog", { name: "消息详情" });
    expect(within(dialog).getByText("del_delivery")).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "投递记录" })).toBeInTheDocument();
  });
});
