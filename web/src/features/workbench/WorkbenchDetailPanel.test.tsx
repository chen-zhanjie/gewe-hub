import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messageFixture, mockFetch, renderWorkbenchPage } from "./WorkbenchPage.test-utils";

describe("WorkbenchPage detail surfaces", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("会话绑定和备注迁移到会话管理抽屉，私聊不再显示右侧会话详情栏", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/apps": [
        {
          id: "app_hermes",
          name: "真实 Hermes 应用",
          status: "active",
          token: "ghub_token",
          defaultDebounceMs: 2000,
          defaultMaxWaitMs: 6000,
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/conversations/conv_1/bind": { id: "conv_1", appId: "app_hermes" },
      "/api/conversations/conv_1": { id: "conv_1", platformRemark: "重点客户" },
    });

    renderWorkbenchPage();

    const row = await within(screen.getByLabelText("会话列表")).findByRole("button", { name: "打开会话 陈可乐" });
    expect(screen.queryByLabelText("会话详情")).not.toBeInTheDocument();

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: "会话管理" }));

    const sheet = await screen.findByRole("dialog", { name: "会话管理" });
    fireEvent.change(within(sheet).getByLabelText("绑定应用"), { target: { value: "app_hermes" } });
    fireEvent.change(within(sheet).getByLabelText("投递过滤"), { target: { value: "at_only" } });
    fireEvent.change(within(sheet).getByLabelText("防抖毫秒"), { target: { value: "2500" } });
    fireEvent.change(within(sheet).getByLabelText("最大等待毫秒"), { target: { value: "8000" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "保存绑定" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/bind",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            appId: "app_hermes",
            deliveryFilter: "at_only",
            debounceMs: 2500,
            maxWaitMs: 8000,
          }),
          credentials: "include",
        }),
      ),
    );

    fireEvent.change(within(sheet).getByLabelText("平台会话备注"), { target: { value: "重点客户" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "保存备注" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ platformRemark: "重点客户" }),
          credentials: "include",
        }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/conversations")).toHaveLength(3);
  });

  it("会话管理抽屉解绑已绑定应用前需要二次确认", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/apps": [
        {
          id: "app_hermes",
          name: "真实 Hermes 应用",
          status: "active",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
          app: { id: "app_hermes", name: "真实 Hermes 应用" },
          deliveryFilter: "at_only",
          debounceMs: 2500,
          maxWaitMs: 8000,
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/conversations/conv_1/unbind": { id: "conv_1", appId: null },
    });

    renderWorkbenchPage();

    const row = await within(screen.getByLabelText("会话列表")).findByRole("button", { name: "打开会话 陈可乐" });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: "会话管理" }));

    const sheet = await screen.findByRole("dialog", { name: "会话管理" });
    expect(within(sheet).getAllByText("真实 Hermes 应用").length).toBeGreaterThan(0);
    fireEvent.click(within(sheet).getByRole("button", { name: "解绑应用" }));

    expect(fetchMock.mock.calls.some(([input]) => String(input).replace("http://localhost", "") === "/api/conversations/conv_1/unbind")).toBe(false);
    const confirmDialog = await screen.findByRole("alertdialog", { name: "解绑应用" });
    expect(within(confirmDialog).getByText("解绑后该会话消息将停止投递")).toBeInTheDocument();
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "确认解绑" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/unbind",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        }),
      ),
    );
    expect(await screen.findByText("已解绑应用")).toBeInTheDocument();
  });

  it("群聊仅显示群成员面板，成员列表从真实 API 加载并通过右键 Dialog 保存成员备注", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/apps": [],
      "/api/conversations": [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "room_alpha@chatroom",
          type: "group",
          platformRemark: "Alpha 产品群",
          lastMessageText: "群消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
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
        items: [
          {
            id: "member_1",
            wxid: "wxid_owner",
            nickname: "陈可乐",
            displayName: "可乐",
            platformRemark: "负责人",
            status: "active",
          },
          {
            id: "member_2",
            wxid: "wxid_removed",
            nickname: "离群成员",
            displayName: null,
            platformRemark: null,
            status: "removed",
          },
        ],
        total: 2,
        take: 50,
        skip: 0,
        nextSkip: 2,
        hasMore: false,
      },
      "/api/groups/group_1/members/member_1": { id: "member_1", platformRemark: "客户负责人" },
    });

    renderWorkbenchPage();

    const panel = await screen.findByLabelText("群成员面板");
    expect(await within(panel).findByText("负责人(可乐)")).toBeInTheDocument();
    expect(within(panel).queryByText("正在加载成员")).not.toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "成员 2" })).toBeInTheDocument();
    expect(within(panel).getAllByText("负责人").length).toBeGreaterThan(0);
    expect(within(panel).getByText("离群成员")).toBeInTheDocument();
    expect(within(panel).getByText("已移除")).toBeInTheDocument();

    fireEvent.change(within(panel).getByPlaceholderText("搜索群成员"), { target: { value: "负责人" } });
    expect(within(panel).getByText("负责人(可乐)")).toBeInTheDocument();
    expect(within(panel).queryByText("离群成员")).not.toBeInTheDocument();
    fireEvent.change(within(panel).getByPlaceholderText("搜索群成员"), { target: { value: "" } });

    fireEvent.contextMenu(within(panel).getByRole("button", { name: "查看群成员 负责人(可乐)" }));
    const menu = await screen.findByRole("menu", { name: "群成员操作" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑成员备注" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑成员备注" });
    fireEvent.change(within(dialog).getByLabelText("成员备注"), { target: { value: "客户负责人" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/groups/group_1/members/member_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ platformRemark: "客户负责人" }),
          credentials: "include",
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/groups/group_1/members?take=50&skip=0"),
    ).toHaveLength(2);
  });

  it("群成员列表首屏 50 条、加载更多并回车触发服务端搜索", async () => {
    const firstPageMembers = Array.from({ length: 50 }, (_, index) => ({
      id: `member_${index + 1}`,
      wxid: `wxid_${index + 1}`,
      nickname: `成员${index + 1}`,
      displayName: `群名${index + 1}`,
      platformRemark: index === 0 ? "负责人" : null,
      status: "active" as const,
    }));
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/apps": [],
      "/api/conversations": [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "room_alpha@chatroom",
          type: "group",
          platformRemark: "Alpha 产品群",
          lastMessageText: "群消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
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
        items: firstPageMembers,
        total: 51,
        take: 50,
        skip: 0,
        nextSkip: 50,
        hasMore: true,
      },
      "/api/groups/group_1/members?take=50&skip=50": {
        items: [
          {
            id: "member_51",
            wxid: "wxid_51",
            nickname: "成员51",
            displayName: "群名51",
            platformRemark: null,
            status: "active",
          },
        ],
        total: 51,
        take: 50,
        skip: 50,
        nextSkip: 51,
        hasMore: false,
      },
      "/api/groups/group_1/members?take=50&skip=0&q=%E8%B4%9F%E8%B4%A3%E4%BA%BA": {
        items: [firstPageMembers[0]],
        total: 1,
        take: 50,
        skip: 0,
        nextSkip: 1,
        hasMore: false,
      },
    });

    renderWorkbenchPage();

    const panel = await screen.findByLabelText("群成员面板");
    expect(await within(panel).findByText("负责人(群名1)")).toBeInTheDocument();
    expect(within(panel).queryByText("群名51")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/group_1/members?take=50&skip=0",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.click(within(panel).getByRole("button", { name: "加载更多群成员" }));
    expect(await within(panel).findByText("群名51")).toBeInTheDocument();
    expect(within(panel).getByText("没有更多群成员了")).toBeInTheDocument();

    const searchInput = within(panel).getByPlaceholderText("搜索群成员");
    fireEvent.change(searchInput, { target: { value: "负责人" } });
    fireEvent.keyDown(searchInput, { key: "Enter" });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/groups/group_1/members?take=50&skip=0&q=%E8%B4%9F%E8%B4%A3%E4%BA%BA",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(within(panel).queryByText("群名51")).not.toBeInTheDocument();
  });

  it("群聊消息发送者头像点击打开联系人详情，hover 不展示旧成员信息卡", async () => {
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
          name: "Alpha 原群名",
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
        privateConversation: null,
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
    expect(screen.queryByRole("dialog", { name: "负责人 完整信息" })).not.toBeInTheDocument();

    fireEvent.click(avatarButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contacts/wxid_owner/profile?accountId=acc_1",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    const dialog = await screen.findByRole("dialog", { name: "联系人详情" });
    expect(within(dialog).queryByText("正在加载联系人详情")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("负责人").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("可乐")).toBeInTheDocument();
    expect(within(dialog).getAllByText("wxid_owner").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Alpha 产品群")).toBeInTheDocument();
  });

  it("消息详情抽屉支持复制标准 JSON、原始 payload、投递记录并切换上一条下一条", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
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
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "详情抽屉消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        {
          id: "row_before",
          messageId: "msg_before",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:15:37.000Z",
          renderedText: "上一条调试消息",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "上一条调试消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg", Data: { MsgId: "122" } } },
          deliveries: [{ eventId: "del_before", status: "queued" }],
        },
        {
          id: "row_context",
          messageId: "msg_context",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          renderedText: "详情抽屉消息",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "详情抽屉消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg", Data: { MsgId: "123" } } },
          deliveries: [{ eventId: "del_context", status: "delivered" }],
        },
      ],
    });

    renderWorkbenchPage();

    const message = await within(screen.getByLabelText("消息区")).findByText("详情抽屉消息");
    fireEvent.contextMenu(message);
    expect(screen.queryByRole("menu", { name: "消息操作" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看消息详情 msg_context" }));
    const sheet = await screen.findByRole("dialog", { name: "消息详情" });
    expect(within(sheet).getByRole("tab", { name: "概览" })).toBeInTheDocument();
    expect(within(sheet).getByRole("tab", { name: "标准 JSON" })).toBeInTheDocument();
    expect(within(sheet).getByRole("tab", { name: "原始 payload" })).toBeInTheDocument();
    expect(within(sheet).getByRole("tab", { name: "投递记录" })).toBeInTheDocument();
    expect(within(sheet).getAllByText("del_context").length).toBeGreaterThan(0);

    fireEvent.click(within(sheet).getByRole("button", { name: "上一条消息" }));
    await waitFor(() => expect(within(sheet).getAllByText("msg_before").length).toBeGreaterThan(0));
    expect(within(sheet).getAllByText("del_before").length).toBeGreaterThan(0);

    fireEvent.click(within(sheet).getByRole("button", { name: "下一条消息" }));
    await waitFor(() => expect(within(sheet).getAllByText("msg_context").length).toBeGreaterThan(0));
    expect(within(sheet).getAllByText("del_context").length).toBeGreaterThan(0);

    fireEvent.click(within(sheet).getByRole("button", { name: "复制标准 JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"type": "text"')));

    fireEvent.click(within(sheet).getByRole("button", { name: "复制原始 payload" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"MsgId": "123"')));

    fireEvent.click(within(sheet).getByRole("button", { name: "复制投递记录" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"eventId": "del_context"')));
  });
});
