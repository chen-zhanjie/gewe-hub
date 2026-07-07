import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("未登录时显示登录页", async () => {
    mockFetch({
      "/api/auth/me": response(401, { error: { message: "未登录" } })
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "登录 GeWeHub" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "聊天工作台" })).not.toBeInTheDocument();
  });

  it("登录成功后渲染第一版控制台壳层和聊天三栏", async () => {
    const fetchMock = mockFetch({
      "/api/auth/me": response(401, { error: { message: "未登录" } }),
      "/api/auth/login": response(200, { ok: true, user: { username: "admin", role: "admin" } }),
      ...workbenchRoutes()
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("账号"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "admin123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST" })));

    expect(screen.getByRole("heading", { name: "聊天工作台" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByLabelText("会话列表")).toBeInTheDocument();
    expect(screen.getByLabelText("消息区")).toBeInTheDocument();
    expect(screen.getByLabelText("会话详情")).toBeInTheDocument();
  });

  it("可以切换到管理页壳", async () => {
    mockAuthenticatedFetch();

    render(<App />);

    await screen.findByRole("heading", { name: "聊天工作台" });
    fireEvent.click(screen.getByRole("button", { name: "应用管理" }));
    await waitFor(() => expect(window.location.pathname).toBe("/apps"));
    expect(screen.getByRole("heading", { name: "应用管理" })).toBeInTheDocument();
    expect(await screen.findByText("Hermes 助手")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "推送日志" }));
    await waitFor(() => expect(window.location.pathname).toBe("/deliveries"));
    expect(screen.getByRole("heading", { name: "推送日志" })).toBeInTheDocument();
    expect(await within(screen.getByRole("table")).findByText("del_failed_focus_app_001")).toBeInTheDocument();
  });

  it("推送日志筛选分页使用路由 search 参数初始化并同步 URL", async () => {
    const fetchMock = mockFetch({
      "/api/auth/me": response(200, { user: { username: "admin", role: "admin" } }),
      ...workbenchRoutes(),
      "/api/observability/summary": response(200, { failedTasks: 0 }),
      "/api/deliveries?take=20&skip=0&status=failed": response(200, [
        {
          eventId: "del_failed_default_1",
          status: "failed",
          attempts: 2,
          updatedAt: "2026-07-06T07:17:37.000Z",
          app: { name: "Hermes 助手" },
          message: { conversation: { platformRemark: "产品体验群", peerWxid: "room@chatroom" } },
        },
      ]),
      "/api/deliveries?take=20&skip=20&status=failed": response(200, [
        {
          eventId: "del_failed_page_2",
          status: "failed",
          attempts: 2,
          updatedAt: "2026-07-06T07:18:37.000Z",
          app: { name: "Hermes 助手" },
          message: { conversation: { platformRemark: "产品体验群", peerWxid: "room@chatroom" } },
        },
      ]),
      "/api/deliveries?take=20&skip=0&status=queued": response(200, [
        {
          eventId: "del_queued_1",
          status: "queued",
          attempts: 1,
          updatedAt: "2026-07-06T07:19:37.000Z",
          app: { name: "Hermes 助手" },
          message: { conversation: { platformRemark: "产品体验群", peerWxid: "room@chatroom" } },
        },
      ]),
      "/api/deliveries?take=20&skip=0": response(200, [
        {
          eventId: "del_all_1",
          status: "delivered",
          attempts: 1,
          updatedAt: "2026-07-06T07:20:37.000Z",
          app: { name: "Hermes 助手" },
          message: { conversation: { platformRemark: "产品体验群", peerWxid: "room@chatroom" } },
        },
      ]),
    });

    window.history.replaceState(null, "", "/deliveries");
    render(<App />);

    expect(await screen.findByText("del_failed_default_1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=20&skip=0&status=failed",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "查看全部投递" }));

    expect(await screen.findByText("del_all_1")).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe("?status=all"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=20&skip=0",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.change(screen.getByLabelText("投递状态筛选"), { target: { value: "queued" } });

    expect(await screen.findByText("del_queued_1")).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe("?status=queued"));
  });

  it("推送日志会话名可以直达工作台对应会话", async () => {
    const fetchMock = mockFetch({
      "/api/auth/me": response(200, { user: { username: "admin", role: "admin" } }),
      "/api/accounts": response(200, [
        {
          id: "acc_001",
          wxid: "wxid_gewe_owner",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ]),
      "/api/conversations": response(200, [
        {
          id: "conv_alpha",
          peerWxid: "room_alpha@chatroom",
          type: "group",
          platformRemark: "Alpha 群",
          lastMessageText: "Alpha 最近消息",
          lastMessageAt: "2026-07-06T07:15:37.000Z",
          status: "active",
        },
        {
          id: "conv_delivery_target",
          peerWxid: "room_delivery@chatroom",
          type: "group",
          platformRemark: "投递失败群",
          lastMessageText: "投递失败消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ]),
      "/api/apps": response(200, []),
      "/api/observability/summary": response(200, { failedTasks: 0 }),
      "/api/conversations/conv_alpha/messages?take=50": response(200, []),
      "/api/conversations/conv_delivery_target/messages?take=50": response(200, [
        {
          id: "row_delivery_target",
          messageId: "msg_delivery_target",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          renderedText: "从投递日志跳来的消息",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "从投递日志跳来的消息" },
          },
          deliveries: [{ eventId: "del_delivery_target", status: "failed" }],
        },
      ]),
      "/api/deliveries?take=20&skip=0&status=failed": response(200, [
        {
          eventId: "del_delivery_target",
          status: "failed",
          attempts: 3,
          updatedAt: "2026-07-06T07:16:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            messageId: "msg_delivery_target",
            conversation: {
              id: "conv_delivery_target",
              platformRemark: "投递失败群",
              peerWxid: "room_delivery@chatroom",
            },
          },
        },
      ]),
    });

    window.history.replaceState(null, "", "/deliveries");
    render(<App />);

    const table = await screen.findByRole("table", { name: "推送日志列表" });
    fireEvent.click(within(table).getByRole("link", { name: "打开工作台会话 投递失败群" }));

    await waitFor(() => expect(window.location.pathname).toBe("/workbench"));
    await waitFor(() => expect(window.location.search).toBe("?conversationId=conv_delivery_target"));
    expect(await screen.findByRole("heading", { name: "投递失败群" })).toBeInTheDocument();
    expect(await screen.findByText("从投递日志跳来的消息")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv_delivery_target/messages?take=50",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("消息调试投递记录可以直达按消息预筛的推送日志", async () => {
    const fetchMock = mockFetch({
      "/api/auth/me": response(200, { user: { username: "admin", role: "admin" } }),
      "/api/accounts": response(200, [
        {
          id: "acc_001",
          wxid: "wxid_gewe_owner",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ]),
      "/api/conversations": response(200, [
        {
          id: "conv_debug_delivery",
          peerWxid: "room_debug_delivery@chatroom",
          type: "group",
          platformRemark: "调试投递群",
          lastMessageText: "需要看推送日志",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ]),
      "/api/apps": response(200, []),
      "/api/observability/summary": response(200, { failedTasks: 0 }),
      "/api/conversations/conv_debug_delivery/messages?take=50": response(200, [
        {
          id: "row_debug_delivery",
          messageId: "msg_debug_delivery",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          renderedText: "需要看推送日志",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "需要看推送日志" },
          },
          deliveries: [{ eventId: "del_debug_delivery", status: "failed" }],
        },
      ]),
      "/api/deliveries?take=20&skip=0&status=failed&messageId=msg_debug_delivery": response(200, [
        {
          eventId: "del_debug_delivery",
          status: "failed",
          attempts: 3,
          updatedAt: "2026-07-06T07:16:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            messageId: "msg_debug_delivery",
            renderedText: "需要看推送日志",
            conversation: {
              id: "conv_debug_delivery",
              platformRemark: "调试投递群",
              peerWxid: "room_debug_delivery@chatroom",
            },
          },
        },
      ]),
    });

    window.history.replaceState(null, "", "/workbench?conversationId=conv_debug_delivery");
    render(<App />);

    const messageRegion = await screen.findByLabelText("消息区");
    expect(await within(messageRegion).findByText("需要看推送日志")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看投递状态 failed" }));
    const dialog = await screen.findByRole("dialog", { name: "消息调试详情" });
    fireEvent.click(within(dialog).getByRole("link", { name: "在推送日志查看 msg_debug_delivery" }));

    await waitFor(() => expect(window.location.pathname).toBe("/deliveries"));
    await waitFor(() => expect(window.location.search).toBe("?status=failed&messageId=msg_debug_delivery"));
    expect(await screen.findByRole("heading", { name: "推送日志" })).toBeInTheDocument();
    expect(await screen.findByText("del_debug_delivery")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=20&skip=0&status=failed&messageId=msg_debug_delivery",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("应用绑定会话列表可以直达工作台对应会话", async () => {
    const fetchMock = mockFetch({
      "/api/auth/me": response(200, { user: { username: "admin", role: "admin" } }),
      "/api/accounts": response(200, [
        {
          id: "acc_001",
          wxid: "wxid_gewe_owner",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ]),
      "/api/conversations": response(200, [
        {
          id: "conv_app_bound",
          peerWxid: "room_app_bound@chatroom",
          type: "group",
          platformRemark: "应用绑定群",
          lastMessageText: "从应用详情跳来的消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
          app: { id: "app_bound", name: "Hermes 助手" },
        },
      ]),
      "/api/apps": response(200, [
        {
          id: "app_bound",
          name: "Hermes 助手",
          status: "active",
          ownerWxid: "wxid_gewe_owner",
          token: "ghub_live_app_bound",
          defaultDebounceMs: 1500,
          _count: { conversations: 1 },
        },
      ]),
      "/api/observability/summary": response(200, { failedTasks: 0 }),
      "/api/apps/app_bound/conversations?take=50&skip=0": response(200, {
        items: [
          {
            id: "conv_app_bound",
            platformRemark: "应用绑定群",
            name: null,
            peerWxid: "room_app_bound@chatroom",
            deliveryFilter: "all",
            debounceMs: 1500,
            maxWaitMs: 8000,
          },
        ],
        total: 1,
        take: 50,
        skip: 0,
        nextSkip: 1,
        hasMore: false,
      }),
      "/api/conversations/conv_app_bound/messages?take=50": response(200, [
        {
          id: "row_app_bound",
          messageId: "msg_app_bound",
          senderWxid: "wxid_sender",
          isSelf: false,
          status: "normal",
          sentAt: "2026-07-06T07:16:37.000Z",
          renderedText: "从应用详情跳来的消息",
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
            content: { type: "text", text: "从应用详情跳来的消息" },
          },
          deliveries: [],
        },
      ]),
    });

    window.history.replaceState(null, "", "/apps");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "应用管理" })).toBeInTheDocument();
    const appCard = await screen.findByText("Hermes 助手");
    fireEvent.click(within(appCard.closest("section")!).getByRole("button", { name: "查看绑定会话" }));
    fireEvent.click(await screen.findByRole("link", { name: "打开工作台会话 应用绑定群" }));

    await waitFor(() => expect(window.location.pathname).toBe("/workbench"));
    await waitFor(() => expect(window.location.search).toBe("?conversationId=conv_app_bound"));
    expect(await screen.findByRole("heading", { name: "应用绑定群" })).toBeInTheDocument();
    const messageRegion = await screen.findByLabelText("消息区");
    expect(await within(messageRegion).findByText("从应用详情跳来的消息")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv_app_bound/messages?take=50",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("发送记录筛选分页使用路由 search 参数初始化并同步 URL", async () => {
    const fetchMock = mockFetch({
      "/api/auth/me": response(200, { user: { username: "admin", role: "admin" } }),
      ...workbenchRoutes(),
      "/api/observability/summary": response(200, { failedTasks: 0 }),
      "/api/send-requests?take=50&skip=0&status=sent": response(200, [
        {
          id: "send_sent_50",
          type: "text",
          status: "sent",
          resultMsgId: "769533803",
          updatedAt: "2026-07-06T07:21:37.000Z",
          conversation: { platformRemark: "陈可乐", peerWxid: "wxid_target" },
        },
      ]),
      "/api/send-requests?take=50&skip=0&status=failed": response(200, [
        {
          id: "send_failed_1",
          type: "text",
          status: "failed",
          resultMsgId: "",
          updatedAt: "2026-07-06T07:22:37.000Z",
          conversation: { platformRemark: "陈可乐", peerWxid: "wxid_target" },
        },
      ]),
    });

    window.history.replaceState(null, "", "/send-requests?status=sent&pageSize=50");
    render(<App />);

    expect(await screen.findByText("send_sent_50")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/send-requests?take=50&skip=0&status=sent",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.change(screen.getByLabelText("发送状态筛选"), { target: { value: "failed" } });

    await waitFor(() => expect(window.location.search).toBe("?status=failed&pageSize=50"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send-requests?take=50&skip=0&status=failed",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(await screen.findByText("send_failed_1")).toBeInTheDocument();
  });

  it("运行观测存在失败任务时侧栏显示红点", async () => {
    mockAuthenticatedFetch();

    render(<App />);

    await screen.findByRole("heading", { name: "聊天工作台" });
    const observabilityNavItem = screen.getByRole("button", { name: "运行观测 有失败任务" });
    expect(within(observabilityNavItem).getByText("有失败任务")).toHaveClass("sr-only");
  });

  it("全局命令面板支持快捷键打开、搜索并跳转页面和会话", async () => {
    mockAuthenticatedFetch();

    render(<App />);

    await screen.findByRole("heading", { name: "聊天工作台" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    const dialog = await screen.findByRole("dialog", { name: "命令面板" });
    expect(within(dialog).getByPlaceholderText("搜索页面、会话或动作")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText("搜索页面、会话或动作"), { target: { value: "推送" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "打开 推送日志" }));

    await waitFor(() => expect(window.location.pathname).toBe("/deliveries"));
    expect(screen.queryByRole("dialog", { name: "命令面板" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const nextDialog = await screen.findByRole("dialog", { name: "命令面板" });
    fireEvent.change(within(nextDialog).getByPlaceholderText("搜索页面、会话或动作"), { target: { value: "产品体验" } });
    fireEvent.click(within(nextDialog).getByRole("button", { name: "打开会话 产品体验群" }));

    await waitFor(() => expect(window.location.pathname).toBe("/workbench"));
    expect(screen.queryByRole("dialog", { name: "命令面板" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "聊天工作台" })).toBeInTheDocument();
  });

  it("全局命令面板支持常用动作：同步通讯录和新建应用", async () => {
    const fetchMock = mockAuthenticatedFetch();

    render(<App />);

    await screen.findByRole("heading", { name: "聊天工作台" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    const syncDialog = await screen.findByRole("dialog", { name: "命令面板" });
    fireEvent.change(within(syncDialog).getByPlaceholderText("搜索页面、会话或动作"), { target: { value: "同步" } });
    fireEvent.click(within(syncDialog).getByRole("button", { name: "同步通讯录" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/contacts/sync", expect.objectContaining({ method: "POST" })),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "命令面板" })).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const createAppDialog = await screen.findByRole("dialog", { name: "命令面板" });
    fireEvent.change(within(createAppDialog).getByPlaceholderText("搜索页面、会话或动作"), { target: { value: "新建应用" } });
    fireEvent.click(within(createAppDialog).getByRole("button", { name: "新建应用" }));

    await waitFor(() => expect(window.location.pathname).toBe("/apps"));
    expect(screen.queryByRole("dialog", { name: "命令面板" })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("应用名称")).toHaveFocus();
  });

  it("全站问号快捷键打开快捷键帮助，输入框聚焦时不抢键盘", async () => {
    mockAuthenticatedFetch();

    render(<App />);

    await screen.findByRole("heading", { name: "聊天工作台" });
    const searchInput = screen.getByPlaceholderText("搜索会话");
    searchInput.focus();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.queryByRole("dialog", { name: "快捷键帮助" })).not.toBeInTheDocument();

    searchInput.blur();
    fireEvent.keyDown(window, { key: "?" });

    const dialog = await screen.findByRole("dialog", { name: "快捷键帮助" });
    expect(within(dialog).getByText("⌘K / Ctrl K")).toBeInTheDocument();
    expect(within(dialog).getByText("打开命令面板")).toBeInTheDocument();
    expect(within(dialog).getByText("?")).toBeInTheDocument();
    expect(within(dialog).getByText("打开快捷键帮助")).toBeInTheDocument();
    expect(within(dialog).getByText("↑ / ↓")).toBeInTheDocument();
    expect(within(dialog).getByText("工作台切换会话")).toBeInTheDocument();
  });

  it("管理员 SSE 断开时在顶栏显示重连横幅，恢复后自动隐藏", async () => {
    const eventSources: FakeEventSource[] = [];
    vi.stubGlobal("EventSource", class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        eventSources.push(this);
      }
    });
    mockAuthenticatedFetch();

    render(<App />);

    await screen.findByRole("heading", { name: "聊天工作台" });
    expect(eventSources).toHaveLength(1);
    expect(screen.queryByText("连接已断开，重连中…")).not.toBeInTheDocument();

    eventSources[0]?.emit("error");
    expect(await screen.findByText("连接已断开，重连中…")).toBeInTheDocument();

    eventSources[0]?.emit("open");
    await waitFor(() => expect(screen.queryByText("连接已断开，重连中…")).not.toBeInTheDocument());
  });

  it("可以退出登录并回到登录页", async () => {
    let loggedIn = true;
    const fetchMock = mockFetch({
      "/api/auth/me": () =>
        loggedIn ? response(200, { user: { username: "admin", role: "admin" } }) : response(401, { error: { message: "未登录" } }),
      "/api/auth/logout": () => {
        loggedIn = false;
        return response(200, { ok: true });
      },
      ...workbenchRoutes()
    });

    render(<App />);

    await screen.findByRole("heading", { name: "聊天工作台" });
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" })));
    expect(window.location.pathname).toBe("/login");
    expect(await screen.findByRole("heading", { name: "登录 GeWeHub" })).toBeInTheDocument();
  });
});

function mockAuthenticatedFetch() {
  return mockFetch({
    "/api/auth/me": response(200, { user: { username: "admin", role: "admin" } }),
    ...workbenchRoutes(),
    "/api/apps": response(200, [
      {
        id: "app_001",
        name: "Hermes 助手",
        status: "active",
        ownerWxid: "wxid_gewe_owner",
        token: "hub_live_8f2e1234b91c",
        defaultDebounceMs: 2000,
        _count: { conversations: 12 }
      }
    ]),
    "/api/contacts/sync": response(200, { ok: true }),
    "/api/observability/summary": response(200, {
      webhook24h: 42,
      deliveryBacklog: 5,
      failedTasks: 2,
      accounts: [{ onlineStatus: "online", _count: 1 }]
    }),
    "/api/deliveries?take=20&skip=0&status=failed": response(200, [
      {
        eventId: "del_failed_focus_app_001",
        status: "failed",
        attempts: 3,
        updatedAt: "2026-07-06T07:16:37.000Z",
        app: { name: "Hermes 助手" },
        message: {
          conversation: {
            platformRemark: "产品体验群",
            name: null,
            peerWxid: "room@chatroom"
          }
        }
      }
    ])
  });
}

function workbenchRoutes(): Record<string, MockRouteResponse> {
  return {
    "/api/accounts": response(200, [
      {
        id: "acc_001",
        wxid: "wxid_gewe_owner",
        nickname: "客服主号",
        onlineStatus: "online"
      }
    ]),
    "/api/conversations": response(200, [
      {
        id: "conv_001",
        peerWxid: "room@chatroom",
        type: "group",
        platformRemark: "产品体验群",
        lastMessageText: "暂无消息",
        lastMessageAt: "2026-07-06T07:16:37.000Z",
        status: "active",
        app: { id: "app_001", name: "Hermes 助手" }
      }
    ]),
    "/api/conversations/conv_001/messages?take=50": response(200, [])
  };
}

interface MockRouteResponse {
  status: number;
  body: unknown;
}

function response(status: number, body: unknown): MockRouteResponse {
  return { status, body };
}

class FakeEventSource {
  readonly url: string;
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {}

  emit(type: string, data: unknown = {}) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

type MockRouteHandler = MockRouteResponse | (() => MockRouteResponse);

function mockFetch(routes: Record<string, MockRouteHandler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace("http://localhost", "");
    const routeHandler = routes[path] ?? response(404, { error: { message: "not found" } });
    const routeResponse = typeof routeHandler === "function" ? routeHandler() : routeHandler;
    return new Response(JSON.stringify(routeResponse.body), {
      status: routeResponse.status,
      headers: {
        "Content-Type": "application/json"
      }
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
