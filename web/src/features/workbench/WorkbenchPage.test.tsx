import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jsonResponse,
  messageFixture,
  mockFetch,
  mockResponseForRoute,
  renderWorkbenchPage,
} from "./WorkbenchPage.test-utils";

describe("WorkbenchPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("从真实 API 加载账号、会话和消息，而不是静态 mock", async () => {
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
          peerWxid: "room@chatroom",
          type: "group",
          platformRemark: "真实产品群",
          lastMessageText: "真实回调摘要",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
          app: { id: "app_1", name: "Hermes 助手" },
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        {
          id: "row_1",
          messageId: "msg_1",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "来自真实 API 的消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
          deliveries: [{ eventId: "del_1", status: "delivered" }],
        },
      ],
    });

    renderWorkbenchPage();

    expect(await screen.findByText("客服主号")).toBeInTheDocument();
    expect(screen.getAllByText("真实产品群").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/messages?take=50",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(await screen.findByText("来自真实 API 的消息")).toBeInTheDocument();
  });

  it("会话搜索框按名称、最近消息和 wxid 过滤会话列表", async () => {
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
          peerWxid: "room_alpha@chatroom",
          type: "group",
          platformRemark: "Alpha 产品群",
          lastMessageText: "讨论报价",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
        {
          id: "conv_2",
          peerWxid: "wxid_beta",
          type: "private",
          platformRemark: "Beta 客户",
          lastMessageText: "售后跟进",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
    });

    renderWorkbenchPage();

    const conversationList = screen.getByLabelText("会话列表");
    await within(conversationList).findByText("Alpha 产品群");
    expect(within(conversationList).getByText("Beta 客户")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索会话"), { target: { value: "售后" } });

    expect(within(conversationList).queryByText("Alpha 产品群")).not.toBeInTheDocument();
    expect(within(conversationList).getByText("Beta 客户")).toBeInTheDocument();
  });

  it("会话列表展示服务端未读数，打开会话时调用已读接口并本地清零", async () => {
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
          peerWxid: "wxid_alpha",
          type: "private",
          platformRemark: "Alpha 客户",
          lastMessageText: "Alpha 最近消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
          unreadCount: 0,
        },
        {
          id: "conv_2",
          peerWxid: "wxid_beta",
          type: "private",
          platformRemark: "Beta 客户",
          lastMessageText: "Beta 最近消息",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
          unreadCount: 4,
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/conversations/conv_2/messages?take=50": [],
      "/api/conversations/conv_2/read": { id: "conv_2", unreadCount: 0 },
    });

    renderWorkbenchPage();

    expect(await screen.findByLabelText("Beta 客户 4 条未读消息")).toBeInTheDocument();
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "打开会话 Beta 客户" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_2/read",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(screen.queryByLabelText("Beta 客户 4 条未读消息")).not.toBeInTheDocument();
  });

  it("工作台支持用上下方向键切换当前筛选会话，输入框聚焦时不抢键盘", async () => {
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
          peerWxid: "room_alpha@chatroom",
          type: "group",
          platformRemark: "Alpha 产品群",
          lastMessageText: "Alpha 最近消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
        {
          id: "conv_2",
          peerWxid: "wxid_beta",
          type: "private",
          platformRemark: "Beta 客户",
          lastMessageText: "Beta 最近消息",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
        },
        {
          id: "conv_3",
          peerWxid: "wxid_gamma",
          type: "private",
          platformRemark: "Gamma 客户",
          lastMessageText: "Gamma 最近消息",
          lastMessageAt: "2026-07-06T07:20:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_alpha", "msg_alpha", "Alpha 消息", "2026-07-06T07:16:37.000Z"),
      ],
      "/api/conversations/conv_2/messages?take=50": [
        messageFixture("row_beta", "msg_beta", "Beta 消息", "2026-07-06T07:18:37.000Z"),
      ],
      "/api/conversations/conv_3/messages?take=50": [
        messageFixture("row_gamma", "msg_gamma", "Gamma 消息", "2026-07-06T07:20:37.000Z"),
      ],
    });

    renderWorkbenchPage();

    expect(await screen.findByRole("heading", { name: "Alpha 产品群" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(await screen.findByRole("heading", { name: "Beta 客户" })).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_2/messages?take=50",
        expect.objectContaining({ credentials: "include" }),
      ),
    );

    const messageInput = screen.getByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行");
    messageInput.focus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByRole("heading", { name: "Beta 客户" })).toBeInTheDocument();

    messageInput.blur();
    fireEvent.change(screen.getByPlaceholderText("搜索会话"), { target: { value: "Gamma" } });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(await screen.findByRole("heading", { name: "Gamma 客户" })).toBeInTheDocument();
  });

  it("发送框提交文本到 /api/send，成功后清空输入并刷新当前会话消息", async () => {
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
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        {
          id: "row_old",
          messageId: "msg_old",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "旧消息" },
          },
          webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
          deliveries: [],
        },
      ],
      "/api/send": { id: "send_1", status: "pending" },
    });

    renderWorkbenchPage();

    const input = await screen.findByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行");
    fireEvent.change(input, { target: { value: "前端发送测试" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ conversationId: "conv_1", type: "text", text: "前端发送测试" }),
          credentials: "include",
        }),
      ),
    );
    expect(input).toHaveValue("");
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/conversations/conv_1/messages?take=50")
    ).toHaveLength(2);
  });

  it("发送文本后立即插入本地发送中气泡并清空输入", async () => {
    let resolveSend: (value: Response) => void = () => undefined;
    const sendPromise = new Promise<Response>((resolve) => {
      resolveSend = resolve;
    });
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
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_old", "msg_old", "旧消息", "2026-07-06T07:16:37.000Z"),
      ],
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/send" && init?.method === "POST") return sendPromise;
      return mockResponseForRoute(path, {
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
            lastMessageText: "旧消息",
            lastMessageAt: "2026-07-06T07:16:37.000Z",
            status: "active",
          },
        ],
        "/api/conversations/conv_1/messages?take=50": [
          messageFixture("row_old", "msg_old", "旧消息", "2026-07-06T07:16:37.000Z"),
        ],
      });
    });

    renderWorkbenchPage();

    const input = await screen.findByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行");
    fireEvent.change(input, { target: { value: "乐观发送测试" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(input).toHaveValue("");
    expect(await screen.findByText("乐观发送测试")).toBeInTheDocument();
    expect(screen.getByText("发送中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();

    resolveSend(jsonResponse({ id: "send_pending_1", status: "pending" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ conversationId: "conv_1", type: "text", text: "乐观发送测试" }),
          credentials: "include",
        }),
      ),
    );
  });

  it("文本发送失败后保留失败气泡，支持重试和删除", async () => {
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
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_old", "msg_old", "旧消息", "2026-07-06T07:16:37.000Z"),
      ],
      "/api/send": { id: "send_retry_1", status: "pending" },
    });
    let sendAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/send" && init?.method === "POST") {
        sendAttempts += 1;
        if (sendAttempts === 1) {
          return jsonResponse({ error: { message: "GeWe 暂不可用" } }, 502);
        }
        return jsonResponse({ id: "send_retry_1", status: "pending" });
      }
      return mockResponseForRoute(path, {
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
            lastMessageText: "旧消息",
            lastMessageAt: "2026-07-06T07:16:37.000Z",
            status: "active",
          },
        ],
        "/api/conversations/conv_1/messages?take=50": [
          messageFixture("row_old", "msg_old", "旧消息", "2026-07-06T07:16:37.000Z"),
        ],
      });
    });

    renderWorkbenchPage();

    const input = await screen.findByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行");
    fireEvent.change(input, { target: { value: "失败后重试" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("发送失败")).toBeInTheDocument();
    expect(screen.getByText("GeWe 暂不可用")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试发送 失败后重试" }));

    await waitFor(() => expect(sendAttempts).toBe(2));
    expect(screen.getByText("发送中")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除未发送消息 失败后重试" }));
    expect(screen.queryByText("失败后重试")).not.toBeInTheDocument();
  });

  it("点击加载更早消息时用当前最旧 messageId 翻页并 prepend 到消息流", async () => {
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
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "最新消息",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_new", "msg_new", "最新消息", "2026-07-06T07:18:37.000Z"),
        messageFixture("row_old", "msg_old", "当前最旧消息", "2026-07-06T07:16:37.000Z"),
      ],
      "/api/conversations/conv_1/messages?take=50&before=msg_old": [
        messageFixture("row_older", "msg_older", "更早的历史消息", "2026-07-06T07:10:37.000Z"),
      ],
    });

    renderWorkbenchPage();

    expect(await screen.findByText("当前最旧消息")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加载更早消息" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/messages?take=50&before=msg_old",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(await screen.findByText("更早的历史消息")).toBeInTheDocument();
  });
});
