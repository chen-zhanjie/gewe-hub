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

  it("从联系人列表跳转到新建会话时刷新工作台数据并选中目标会话", async () => {
    let conversationsFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/accounts") {
        return jsonResponse([
          {
            id: "acc_1",
            wxid: "wxid_bot",
            nickname: "客服主号",
            onlineStatus: "online",
          },
        ]);
      }
      if (path === "/api/conversations") {
        conversationsFetchCount += 1;
        return jsonResponse(
          conversationsFetchCount === 1
            ? [
                {
                  id: "conv_old",
                  accountId: "acc_1",
                  peerWxid: "wxid_old",
                  type: "private",
                  platformRemark: "旧会话",
                  lastMessageText: "旧消息",
                  lastMessageAt: "2026-07-06T07:16:37.000Z",
                  status: "active",
                },
              ]
            : [
                {
                  id: "conv_new",
                  accountId: "acc_1",
                  peerWxid: "wxid_new",
                  type: "private",
                  platformRemark: "新建联系人",
                  lastMessageText: null,
                  lastMessageAt: null,
                  status: "active",
                },
                {
                  id: "conv_old",
                  accountId: "acc_1",
                  peerWxid: "wxid_old",
                  type: "private",
                  platformRemark: "旧会话",
                  lastMessageText: "旧消息",
                  lastMessageAt: "2026-07-06T07:16:37.000Z",
                  status: "active",
                },
              ],
        );
      }
      if (path === "/api/apps") return jsonResponse([]);
      if (path === "/api/conversations/conv_old/messages?take=50") return jsonResponse([]);
      if (path === "/api/conversations/conv_new/messages?take=50") return jsonResponse([]);
      return jsonResponse({ error: { message: "not found" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerenderWorkbenchPage } = renderWorkbenchPage();

    expect(await screen.findByRole("heading", { name: "旧会话" })).toBeInTheDocument();

    rerenderWorkbenchPage({
      initialAccountId: "acc_1",
      initialConversationId: "conv_new",
    });

    await waitFor(() => expect(conversationsFetchCount).toBeGreaterThanOrEqual(2));
    expect(await screen.findByRole("heading", { name: "新建联系人" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开会话 新建联系人" })).toHaveClass("bg-muted");
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
      "/api/send": { success: true, messageId: "msg_sent_1" },
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

  it("群聊输入 @ 后选择成员会自动插入正文并携带真实 mentions", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [{ id: "acc_1", wxid: "wxid_bot", nickname: "客服主号", onlineStatus: "online" }],
      "/api/conversations": [{
        id: "conv_1", accountId: "acc_1", peerWxid: "room_alpha@chatroom", type: "group", platformRemark: "Alpha 产品群",
        lastMessageText: "需要确认", lastMessageAt: "2026-07-06T07:16:37.000Z", status: "active",
      }],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/groups?accountId=acc_1&q=room_alpha%40chatroom": [{ id: "group_1", accountId: "acc_1", wxid: "room_alpha@chatroom", name: "Alpha 产品群", status: "active" }],
      "/api/groups/group_1/members?take=50&skip=0": {
        items: [
          { id: "member_kele", wxid: "wxid_kele", nickname: "陈可乐", displayName: "可乐", platformRemark: "负责人", status: "active" },
          { id: "member_left", wxid: "wxid_left", nickname: "已离开", displayName: "已离开", status: "left" },
        ], total: 2, take: 50, skip: 0, nextSkip: 0, hasMore: false,
      },
      "/api/send": { success: true, messageId: "msg_mention_sent" },
    });

    renderWorkbenchPage();
    await waitFor(() => expect(fetchMock.mock.calls.some(([request]) => String(request).includes("/api/groups/group_1/members"))).toBe(true));
    const input = screen.getByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行") as HTMLTextAreaElement;
    input.setSelectionRange(4, 4);
    fireEvent.change(input, { target: { value: "请 @负", selectionStart: 4, selectionEnd: 4 } });

    expect(await screen.findByRole("button", { name: "提及 负责人" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "提及 已离开" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提及 负责人" }));
    await waitFor(() => expect(input).toHaveValue("请 @负责人 "));

    fireEvent.change(input, { target: { value: "请 @负责人 请确认", selectionStart: "请 @负责人 请确认".length } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => {
      const sendCall = fetchMock.mock.calls.find(([request]) => String(request).replace("http://localhost", "") === "/api/send");
      expect(JSON.parse(String(sendCall?.[1]?.body))).toEqual({
        conversationId: "conv_1", type: "text", text: "请 @负责人 请确认", mentions: ["wxid_kele"],
      });
    });
  });

  it("删除 @名称 自动空格后仅取消真实 mentions，保留文本", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [{ id: "acc_1", wxid: "wxid_bot", nickname: "客服主号", onlineStatus: "online" }],
      "/api/conversations": [{
        id: "conv_1", accountId: "acc_1", peerWxid: "room_alpha@chatroom", type: "group", platformRemark: "Alpha 产品群",
        lastMessageText: "需要确认", lastMessageAt: "2026-07-06T07:16:37.000Z", status: "active",
      }],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/groups?accountId=acc_1&q=room_alpha%40chatroom": [{ id: "group_1", accountId: "acc_1", wxid: "room_alpha@chatroom", name: "Alpha 产品群", status: "active" }],
      "/api/groups/group_1/members?take=50&skip=0": { items: [{ id: "member_kele", wxid: "wxid_kele", displayName: "可乐", platformRemark: "负责人", status: "active" }], total: 1, take: 50, skip: 0, nextSkip: 0, hasMore: false },
      "/api/send": { success: true, messageId: "msg_text_sent" },
    });

    renderWorkbenchPage();
    await waitFor(() => expect(fetchMock.mock.calls.some(([request]) => String(request).includes("/api/groups/group_1/members"))).toBe(true));
    const input = screen.getByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行") as HTMLTextAreaElement;
    input.setSelectionRange(1, 1);
    fireEvent.change(input, { target: { value: "@", selectionStart: 1, selectionEnd: 1 } });
    fireEvent.click(await screen.findByRole("button", { name: "提及 负责人" }));
    await waitFor(() => expect(input).toHaveValue("@负责人 "));
    fireEvent.change(input, { target: { value: "@负责人", selectionStart: "@负责人".length } });
    expect(input).toHaveValue("@负责人");
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      const sendCall = fetchMock.mock.calls.find(([request]) => String(request).replace("http://localhost", "") === "/api/send");
      expect(JSON.parse(String(sendCall?.[1]?.body))).toEqual({ conversationId: "conv_1", type: "text", text: "@负责人" });
    });
  });

  it("引用消息时阻止真实 @，避免 GeWe 静默丢失 ats", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [{ id: "acc_1", wxid: "wxid_bot", nickname: "客服主号", onlineStatus: "online" }],
      "/api/conversations": [{ id: "conv_1", accountId: "acc_1", peerWxid: "room_alpha@chatroom", type: "group", platformRemark: "Alpha 产品群", lastMessageText: "文件", lastMessageAt: "2026-07-06T07:16:37.000Z", status: "active" }],
      "/api/conversations/conv_1/messages?take=50": [{ id: "row_file", messageId: "msg_file", senderWxid: "wxid_sender", isSelf: false, status: "normal", sentAt: "2026-07-06T07:16:37.000Z", renderedText: "[文件] mapping_app.txt", payload: { sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false }, content: { type: "file", text: "[文件] mapping_app.txt", media: { status: "ready", fileName: "mapping_app.txt" } } }, webhookEvent: { rawPayload: { TypeName: "AddMsg" } }, deliveries: [] }],
      "/api/groups?accountId=acc_1&q=room_alpha%40chatroom": [{ id: "group_1", accountId: "acc_1", wxid: "room_alpha@chatroom", name: "Alpha 产品群", status: "active" }],
      "/api/groups/group_1/members?take=50&skip=0": { items: [{ id: "member_kele", wxid: "wxid_kele", displayName: "可乐", platformRemark: "负责人", status: "active" }], total: 1, take: 50, skip: 0, nextSkip: 0, hasMore: false },
    });

    renderWorkbenchPage();
    const messageRegion = screen.getByLabelText("消息区");
    expect(await within(messageRegion).findByText("mapping_app.txt")).toBeInTheDocument();
    fireEvent.click(within(messageRegion).getByRole("button", { name: "引用消息 msg_file" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([request]) => String(request).includes("/api/groups/group_1/members"))).toBe(true));
    const input = screen.getByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行") as HTMLTextAreaElement;
    input.setSelectionRange(1, 1);
    fireEvent.change(input, { target: { value: "@", selectionStart: 1, selectionEnd: 1 } });
    fireEvent.click(await screen.findByRole("button", { name: "提及 负责人" }));
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("引用消息暂不支持真实 @；请取消引用后再发送。")).toBeInTheDocument();
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
    await waitFor(() => expect(input).toHaveValue("乐观发送测试"));
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(input).toHaveValue(""));
    expect(await screen.findByText("乐观发送测试")).toBeInTheDocument();
    expect(screen.getByText("发送中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();

    resolveSend(jsonResponse({ success: true, messageId: "msg_pending_1", accepted: true }));
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

  it("文本发送失败后保留失败气泡并支持重试，重试 pending 时禁用删除", async () => {
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
      "/api/send": { success: true, messageId: "msg_retry_1" },
    });
    let sendAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/send" && init?.method === "POST") {
        sendAttempts += 1;
        if (sendAttempts === 1) {
          return jsonResponse({ error: { message: "GeWe 暂不可用" } }, 502);
        }
        return jsonResponse({ success: true, messageId: "msg_retry_1" });
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

    expect(screen.getByRole("button", { name: "删除未发送消息 失败后重试" })).toBeDisabled();
    expect(screen.getByText("失败后重试")).toBeInTheDocument();
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

  it("人工发送 held 消息后刷新消息和 workspace，并按新的 sentAt 重排", async () => {
    let messageFetchCount = 0;
    const account = {
      id: "acc_1",
      wxid: "wxid_bot",
      nickname: "客服主号",
      onlineStatus: "online",
    };
    const conversation = {
      id: "conv_1",
      accountId: "acc_1",
      peerWxid: "wxid_target",
      type: "private",
      platformRemark: "陈可乐",
      lastMessageText: "普通消息",
      lastMessageAt: "2026-07-11T08:00:00.000Z",
      status: "active",
    };
    const heldMessage = (sentAt: string, isSent: boolean, status: string) => ({
      id: "row_held",
      messageId: isSent ? "msg_sent" : "msg_held_send_1",
      sendRequestId: "send_1",
      senderWxid: "wxid_bot",
      isSelf: true,
      isSent,
      sendRequest: { id: "send_1", status },
      status: "normal",
      sentAt,
      payload: {
        sender: { wxid: "wxid_bot", name: "客服主号", isOwner: true },
        content: { type: "text", text: "待发送消息" },
      },
      deliveries: [],
    });
    const normalMessage = messageFixture(
      "row_normal",
      "msg_normal",
      "普通消息",
      "2026-07-11T08:00:00.000Z",
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/accounts") return jsonResponse([account]);
      if (path === "/api/apps") return jsonResponse([]);
      if (path === "/api/conversations") return jsonResponse([conversation]);
      if (path === "/api/conversations/conv_1/messages?take=50") {
        messageFetchCount += 1;
        return jsonResponse(
          messageFetchCount === 1
            ? [normalMessage, heldMessage("2026-07-11T07:00:00.000Z", false, "held")]
            : [heldMessage("2026-07-11T09:00:00.000Z", true, "sent"), normalMessage],
        );
      }
      if (path === "/api/send/send_1/dispatch" && init?.method === "POST") {
        return jsonResponse({ id: "send_1", status: "pending" });
      }
      return jsonResponse({ error: { message: "not found" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWorkbenchPage();

    expect(await screen.findByText("待确认")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "发送消息 msg_held_send_1" }));

    await waitFor(() => expect(messageFetchCount).toBe(2));
    await waitFor(() => expect(screen.queryByText("未发送")).not.toBeInTheDocument());
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/accounts")).toHaveLength(2);
      expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/conversations")).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send/send_1/dispatch",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const messageArea = screen.getByLabelText("消息区");
    const normal = within(messageArea).getByText("普通消息");
    const dispatched = within(messageArea).getByText("待发送消息");
    expect(normal.compareDocumentPosition(dispatched) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

});
