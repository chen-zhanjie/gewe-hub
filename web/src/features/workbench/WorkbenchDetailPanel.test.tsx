import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messageFixture, mockFetch, renderWorkbenchPage } from "./WorkbenchPage.test-utils";

describe("WorkbenchPage detail panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("右栏可以选择应用并保存会话绑定", async () => {
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
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.change(screen.getByLabelText("绑定应用"), { target: { value: "app_hermes" } });
    fireEvent.change(screen.getByLabelText("投递过滤"), { target: { value: "at_only" } });
    fireEvent.change(screen.getByLabelText("防抖毫秒"), { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText("最大等待毫秒"), { target: { value: "8000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存绑定" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/bind",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            appId: "app_hermes",
            deliveryFilter: "at_only",
            debounceMs: 2500,
            maxWaitMs: 8000
          }),
          credentials: "include",
        }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/conversations")).toHaveLength(2);
  });

  it("右栏详情按分段折叠展示，并把折叠状态写入 localStorage", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
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
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_1", "msg_1", "调试消息", "2026-07-06T07:16:37.000Z"),
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
        items: [
          {
            id: "member_1",
            wxid: "wxid_owner",
            nickname: "陈可乐",
            displayName: "可乐",
            platformRemark: "负责人",
            status: "active",
          },
        ],
        total: 1,
        take: 50,
        skip: 0,
        nextSkip: 1,
        hasMore: false,
      },
    });

    const { unmount } = renderWorkbenchPage();

    await screen.findByText("客服主号");
    expect(screen.getByRole("button", { name: "折叠会话信息" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "折叠绑定与投递" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "折叠成员群" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "折叠快捷调试入口" })).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("负责人(可乐)")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "标准 JSON" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "折叠成员群" }));

    expect(screen.queryByText("负责人(可乐)")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("gewehub.workbench.detailSections") ?? "{}")).toMatchObject({
      members: false,
    });

    unmount();
    renderWorkbenchPage();

    await screen.findByText("客服主号");
    expect(screen.getByRole("button", { name: "展开成员群" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("负责人(可乐)")).not.toBeInTheDocument();
    expect(await within(screen.getByLabelText("消息区")).findByText("调试消息")).toBeInTheDocument();
  });

  it("右栏会话备注使用内联编辑，Enter 保存并刷新工作区，Esc 取消", async () => {
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
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/conversations/conv_1": { id: "conv_1", platformRemark: "重点客户" },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    const detailPanel = within(screen.getByLabelText("会话详情"));
    expect(detailPanel.getByText("陈可乐")).toBeInTheDocument();
    expect(detailPanel.queryByLabelText("会话备注")).not.toBeInTheDocument();
    expect(detailPanel.queryByRole("button", { name: "保存备注" })).not.toBeInTheDocument();

    fireEvent.click(detailPanel.getByRole("button", { name: "编辑会话备注" }));
    const remarkInput = detailPanel.getByLabelText("会话备注");
    fireEvent.change(remarkInput, { target: { value: "临时修改" } });
    fireEvent.keyDown(remarkInput, { key: "Escape" });

    expect(detailPanel.queryByLabelText("会话备注")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).replace("http://localhost", "") === "/api/conversations/conv_1")).toBe(false);

    fireEvent.click(detailPanel.getByRole("button", { name: "编辑会话备注" }));
    const nextRemarkInput = detailPanel.getByLabelText("会话备注");
    fireEvent.change(nextRemarkInput, { target: { value: "重点客户" } });
    fireEvent.keyDown(nextRemarkInput, { key: "Enter" });

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
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/conversations")).toHaveLength(2);
  });

  it("右栏解绑已绑定会话应用前需要二次确认", async () => {
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

    await screen.findByText("客服主号");
    expect(screen.getByText("已绑定 真实 Hermes 应用")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "解绑应用" }));

    expect(fetchMock.mock.calls.some(([input]) => String(input).replace("http://localhost", "") === "/api/conversations/conv_1/unbind")).toBe(false);
    const confirmDialog = await screen.findByRole("alertdialog", { name: "解绑应用" });
    expect(within(confirmDialog).getByText("解绑后该会话消息将停止投递")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认解绑" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/unbind",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/conversations")).toHaveLength(2);
    expect(await screen.findByText("已解绑应用")).toBeInTheDocument();
  });

  it("群聊右栏成员列表从真实 API 加载并可保存成员备注", async () => {
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

    await screen.findByText("客服主号");
    expect(screen.getByRole("button", { name: "折叠成员群" })).toHaveAttribute("aria-expanded", "true");

    expect(await screen.findByText("负责人(可乐)")).toBeInTheDocument();
    expect(screen.getByText("wxid_owner")).toBeInTheDocument();
    expect(screen.getByText("离群成员")).toBeInTheDocument();
    expect(screen.getByText("已移除")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索群成员"), { target: { value: "负责人" } });
    expect(screen.getByText("负责人(可乐)")).toBeInTheDocument();
    expect(screen.queryByText("离群成员")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索群成员"), { target: { value: "" } });

    fireEvent.change(screen.getByLabelText("成员 wxid_owner 备注"), { target: { value: "客户负责人" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 wxid_owner 备注" }));

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
      status: "active",
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

    await screen.findByText("客服主号");
    expect(screen.getByRole("button", { name: "折叠成员群" })).toHaveAttribute("aria-expanded", "true");

    expect(await screen.findByText("负责人(群名1)")).toBeInTheDocument();
    expect(screen.queryByText("群名51")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/group_1/members?take=50&skip=0",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "加载更多群成员" }));
    expect(await screen.findByText("群名51")).toBeInTheDocument();
    expect(screen.getByText("没有更多群成员了")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("搜索群成员");
    fireEvent.change(searchInput, { target: { value: "负责人" } });
    fireEvent.keyDown(searchInput, { key: "Enter" });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/groups/group_1/members?take=50&skip=0&q=%E8%B4%9F%E8%B4%A3%E4%BA%BA",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(screen.queryByText("群名51")).not.toBeInTheDocument();
  });

  it("群聊消息发送者头像弹出完整成员信息卡", async () => {
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
    });

    renderWorkbenchPage();

    expect(await within(screen.getByLabelText("消息区")).findByText("群成员消息")).toBeInTheDocument();
    expect(screen.getByText("负责人")).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "查看 负责人 完整信息" }));

    const senderCard = await screen.findByRole("dialog", { name: "负责人 完整信息" });
    expect(within(senderCard).getAllByText("陈可乐").length).toBeGreaterThan(0);
    expect(within(senderCard).getByText("可乐")).toBeInTheDocument();
    expect(within(senderCard).getByText("wxid_owner")).toBeInTheDocument();
    expect(within(senderCard).getByText("active")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/groups/"))).toHaveLength(0);
  });

  it("消息右键菜单和调试区支持复制文本、标准 JSON、原始 payload 与投递记录", async () => {
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
          lastMessageText: "右键菜单消息",
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
          renderedText: "右键菜单消息",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "右键菜单消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg", Data: { MsgId: "123" } } },
          deliveries: [{ eventId: "del_context", status: "delivered" }],
        },
      ],
    });

    renderWorkbenchPage();

    const message = await within(screen.getByLabelText("消息区")).findByText("右键菜单消息");
    fireEvent.contextMenu(message);

    expect(await screen.findByRole("menu", { name: "消息操作" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "复制文本" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("右键菜单消息"));

    fireEvent.contextMenu(message);
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制标准 JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"messageId": "msg_context"')));

    fireEvent.contextMenu(message);
    fireEvent.click(await screen.findByRole("menuitem", { name: "查看详情" }));
    expect(await screen.findByRole("dialog", { name: "消息调试详情" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "概览" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "标准 JSON" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "原始 payload" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "投递记录" })).toBeInTheDocument();
    expect(screen.getAllByText("del_context").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "上一条消息" }));
    expect(await screen.findByText("msg_before")).toBeInTheDocument();
    expect(screen.getAllByText("del_before").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "下一条消息" }));
    expect(await screen.findByText("msg_context")).toBeInTheDocument();
    expect(screen.getAllByText("del_context").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "复制标准 JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"type": "text"')));

    fireEvent.click(screen.getByRole("button", { name: "复制原始 payload" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"MsgId": "123"')));

    fireEvent.click(screen.getByRole("button", { name: "复制投递记录" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"eventId": "del_context"')));
  });
});
