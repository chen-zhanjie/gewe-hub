import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationList } from "./ConversationList";
import { messageFixture, mockFetch, renderWorkbenchPage } from "./WorkbenchPage.test-utils";
import { render } from "@testing-library/react";
import type { ConversationSummary } from "@/lib/workspace-data";

describe("WorkbenchPage conversation list", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/workbench");
  });

  it("账号选择器展示完整账号实体并切换 URL 参数和会话范围", async () => {
    window.history.replaceState(null, "", "/workbench?accountId=acc_2");
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_alpha_bot",
          nickname: "客服一号",
          platformRemark: "销售号",
          onlineStatus: "online",
        },
        {
          id: "acc_2",
          wxid: "wxid_beta_bot",
          nickname: "客服二号",
          platformRemark: "售后号",
          onlineStatus: "offline",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_alpha",
          accountId: "acc_1",
          peerWxid: "wxid_alpha_customer",
          type: "private",
          platformRemark: "Alpha 客户",
          lastMessageText: "Alpha 最近消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
        {
          id: "conv_beta",
          accountId: "acc_2",
          peerWxid: "wxid_beta_customer",
          type: "private",
          platformRemark: "Beta 客户",
          lastMessageText: "Beta 最近消息",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_beta/messages?take=50": [
        messageFixture("row_beta", "msg_beta", "Beta 消息", "2026-07-06T07:18:37.000Z"),
      ],
      "/api/conversations/conv_alpha/messages?take=50": [
        messageFixture("row_alpha", "msg_alpha", "Alpha 消息", "2026-07-06T07:16:37.000Z"),
      ],
    });

    renderWorkbenchPage({
      initialAccountId: "acc_2",
      onAccountChange: (accountId) => {
        const url = new URL(window.location.href);
        url.searchParams.set("accountId", accountId);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      },
    });

    const conversationList = screen.getByLabelText("会话列表");
    expect(await within(conversationList).findByText("售后号")).toBeInTheDocument();
    expect(within(conversationList).getByText("wxid_beta_bot")).toBeInTheDocument();
    expect(within(conversationList).getByLabelText("售后号 离线")).toBeInTheDocument();
    expect(within(conversationList).getByText("Beta 客户")).toBeInTheDocument();
    expect(within(conversationList).queryByText("Alpha 客户")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Beta 客户" })).toBeInTheDocument();

    fireEvent.click(within(conversationList).getByRole("button", { name: "切换微信账号 售后号 wxid_beta_bot" }));
    const accountPanel = await screen.findByRole("dialog", { name: "微信账号选择" });
    expect(within(accountPanel).getByText("销售号(客服一号)")).toBeInTheDocument();
    expect(within(accountPanel).getByText("wxid_alpha_bot")).toBeInTheDocument();
    expect(within(accountPanel).getByLabelText("当前账号 售后号")).toBeInTheDocument();

    fireEvent.click(within(accountPanel).getByRole("button", { name: "选择账号 销售号 wxid_alpha_bot" }));

    expect(window.location.search).toContain("accountId=acc_1");
    expect(await within(conversationList).findByText("Alpha 客户")).toBeInTheDocument();
    expect(within(conversationList).queryByText("Beta 客户")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_alpha/messages?take=50",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("账号参数由路由层传入并可在运行中切换", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_alpha_bot",
          nickname: "客服一号",
          platformRemark: "销售号",
          onlineStatus: "online",
        },
        {
          id: "acc_2",
          wxid: "wxid_beta_bot",
          nickname: "客服二号",
          platformRemark: "售后号",
          onlineStatus: "offline",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_alpha",
          accountId: "acc_1",
          peerWxid: "wxid_alpha_customer",
          type: "private",
          platformRemark: "Alpha 客户",
          lastMessageText: "Alpha 最近消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
        {
          id: "conv_beta",
          accountId: "acc_2",
          peerWxid: "wxid_beta_customer",
          type: "private",
          platformRemark: "Beta 客户",
          lastMessageText: "Beta 最近消息",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_beta/messages?take=50": [
        messageFixture("row_beta", "msg_beta", "Beta 消息", "2026-07-06T07:18:37.000Z"),
      ],
      "/api/conversations/conv_alpha/messages?take=50": [
        messageFixture("row_alpha", "msg_alpha", "Alpha 消息", "2026-07-06T07:16:37.000Z"),
      ],
    });

    const { rerenderWorkbenchPage } = renderWorkbenchPage({ initialAccountId: "acc_1" });

    const conversationList = screen.getByLabelText("会话列表");
    expect(await within(conversationList).findByText("Alpha 客户")).toBeInTheDocument();
    expect(within(conversationList).queryByText("Beta 客户")).not.toBeInTheDocument();

    rerenderWorkbenchPage({ initialAccountId: "acc_2" });

    expect(await within(conversationList).findByText("Beta 客户")).toBeInTheDocument();
    expect(within(conversationList).queryByText("Alpha 客户")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_beta/messages?take=50",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("没有账号参数时默认使用上次手动选择的账号", async () => {
    window.localStorage.setItem("gewehub.workbench.selectedAccountId", "acc_2");
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_alpha_bot",
          nickname: "客服一号",
          platformRemark: "销售号",
          onlineStatus: "online",
        },
        {
          id: "acc_2",
          wxid: "wxid_beta_bot",
          nickname: "客服二号",
          platformRemark: "售后号",
          onlineStatus: "offline",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_alpha",
          accountId: "acc_1",
          peerWxid: "wxid_alpha_customer",
          type: "private",
          platformRemark: "Alpha 客户",
          lastMessageText: "Alpha 最近消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
        {
          id: "conv_beta",
          accountId: "acc_2",
          peerWxid: "wxid_beta_customer",
          type: "private",
          platformRemark: "Beta 客户",
          lastMessageText: "Beta 最近消息",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_beta/messages?take=50": [
        messageFixture("row_beta", "msg_beta", "Beta 消息", "2026-07-06T07:18:37.000Z"),
      ],
    });

    renderWorkbenchPage();

    const conversationList = screen.getByLabelText("会话列表");
    expect(await within(conversationList).findByText("售后号")).toBeInTheDocument();
    expect(within(conversationList).getByText("Beta 客户")).toBeInTheDocument();
    expect(within(conversationList).queryByText("Alpha 客户")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_beta/messages?take=50",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("账号参数被路由清空时继续使用上次选择的账号", async () => {
    window.localStorage.setItem("gewehub.workbench.selectedAccountId", "acc_2");
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_alpha_bot",
          nickname: "客服一号",
          platformRemark: "销售号",
          onlineStatus: "online",
        },
        {
          id: "acc_2",
          wxid: "wxid_beta_bot",
          nickname: "客服二号",
          platformRemark: "售后号",
          onlineStatus: "offline",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_alpha",
          accountId: "acc_1",
          peerWxid: "wxid_alpha_customer",
          type: "private",
          platformRemark: "Alpha 客户",
          lastMessageText: "Alpha 最近消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
        {
          id: "conv_beta",
          accountId: "acc_2",
          peerWxid: "wxid_beta_customer",
          type: "private",
          platformRemark: "Beta 客户",
          lastMessageText: "Beta 最近消息",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_beta/messages?take=50": [
        messageFixture("row_beta", "msg_beta", "Beta 消息", "2026-07-06T07:18:37.000Z"),
      ],
    });

    const { rerenderWorkbenchPage } = renderWorkbenchPage({ initialAccountId: "acc_2" });
    const conversationList = screen.getByLabelText("会话列表");
    expect(await within(conversationList).findByText("Beta 客户")).toBeInTheDocument();

    rerenderWorkbenchPage();

    expect(await within(conversationList).findByText("售后号")).toBeInTheDocument();
    expect(within(conversationList).getByText("Beta 客户")).toBeInTheDocument();
    expect(within(conversationList).queryByText("Alpha 客户")).not.toBeInTheDocument();
  });

  it("会话列表按置顶和普通分区展示，隐藏会话不显示且不展示应用徽标", async () => {
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
          id: "conv_pinned",
          accountId: "acc_1",
          peerWxid: "wxid_pinned",
          type: "private",
          platformRemark: "置顶客户",
          lastMessageText: "置顶摘要",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          pinnedAt: "2026-07-06T08:00:00.000Z",
          unreadCount: 120,
          status: "active",
          app: { id: "app_1", name: "Hermes 助手" },
        },
        {
          id: "conv_normal",
          accountId: "acc_1",
          peerWxid: "wxid_normal",
          type: "private",
          platformRemark: "普通客户",
          lastMessageText: "普通摘要",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          unreadCount: 2,
          status: "active",
        },
        {
          id: "conv_hidden",
          accountId: "acc_1",
          peerWxid: "wxid_hidden",
          type: "private",
          platformRemark: "隐藏客户",
          lastMessageText: "隐藏摘要",
          lastMessageAt: "2026-07-06T07:20:37.000Z",
          isHidden: true,
          status: "active",
        },
      ],
      "/api/conversations/conv_pinned/messages?take=50": [],
    });

    renderWorkbenchPage();

    const conversationList = screen.getByLabelText("会话列表");
    expect(await within(conversationList).findByText("置顶")).toBeInTheDocument();
    expect(within(conversationList).getByText("普通会话")).toBeInTheDocument();
    expect(within(conversationList).getByText("置顶客户")).toBeInTheDocument();
    expect(within(conversationList).getByText("普通客户")).toBeInTheDocument();
    expect(within(conversationList).queryByText("隐藏客户")).not.toBeInTheDocument();
    expect(within(conversationList).queryByText("Hermes 助手")).not.toBeInTheDocument();
    expect(within(conversationList).queryByText("已投递")).not.toBeInTheDocument();
    expect(within(conversationList).getByLabelText("置顶客户 120 条未读消息")).toHaveTextContent("99+");

    const pinnedButton = within(conversationList).getByRole("button", { name: "打开会话 置顶客户" });
    expect(pinnedButton).toHaveClass("bg-muted/60");
  });

  it("会话列表保持后端最后聊天时间顺序，不按 lastOpenedAt 将点击过的会话提前", () => {
    const conversations = [
      conversationSummary({
        id: "conv_older",
        name: "旧消息但刚打开",
        lastMessageAt: "2026-07-06T07:16:37.000Z",
        lastOpenedAt: "2026-07-06T08:30:00.000Z",
      }),
      conversationSummary({
        id: "conv_newer",
        name: "新消息会话",
        lastMessageAt: "2026-07-06T07:18:37.000Z",
      }),
    ];

    render(
      <ConversationList
        accounts={[]}
        selectedAccountId={null}
        conversations={conversations}
        selectedConversationId={null}
        loading={false}
        error={null}
        onSelectConversation={vi.fn()}
        onSelectAccount={vi.fn()}
        onTogglePinned={vi.fn()}
        onHideConversation={vi.fn()}
        onMarkRead={vi.fn()}
        onEditRemark={vi.fn()}
        onOpenManagement={vi.fn()}
      />,
    );

    const conversationList = screen.getByLabelText("会话列表");
    const rows = within(conversationList).getAllByRole("button", { name: /^打开会话/ });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "打开会话 旧消息但刚打开",
      "打开会话 新消息会话",
    ]);
  });

  it("会话右键菜单展示置顶、隐藏、已读、编辑备注和会话管理五项", async () => {
    mockFetch(conversationActionRoutes());

    renderWorkbenchPage();

    const conversationList = screen.getByLabelText("会话列表");
    const row = await within(conversationList).findByRole("button", { name: "打开会话 陈可乐" });
    fireEvent.contextMenu(row);

    const menu = await screen.findByRole("menu", { name: "会话操作" });
    expect(within(menu).getByRole("menuitem", { name: "置顶" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "隐藏会话" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "标为已读" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "编辑备注" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "会话管理" })).toBeInTheDocument();
  });

  it("会话右键菜单置顶调用会话状态接口", async () => {
    const fetchMock = mockFetch({
      ...conversationActionRoutes(),
      "/api/conversations/conv_1": { ok: true },
    });

    renderWorkbenchPage();

    const conversationList = screen.getByLabelText("会话列表");
    const row = await within(conversationList).findByRole("button", { name: "打开会话 陈可乐" });
    fireEvent.contextMenu(row);

    const menu = await screen.findByRole("menu", { name: "会话操作" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "置顶" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ pinned: true }),
        }),
      ),
    );
  });

  it("会话右键菜单标为已读调用已读接口", async () => {
    const fetchMock = mockFetch({
      ...conversationActionRoutes(),
      "/api/conversations/conv_1/read": { ok: true },
    });

    renderWorkbenchPage();

    const conversationList = screen.getByLabelText("会话列表");
    const row = await within(conversationList).findByRole("button", { name: "打开会话 陈可乐" });

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: "标为已读" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/read",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("会话右键菜单编辑备注和隐藏会话调用更新接口", async () => {
    const fetchMock = mockFetch({
      ...conversationActionRoutes(),
      "/api/conversations/conv_1": { ok: true },
    });

    renderWorkbenchPage();

    const conversationList = screen.getByLabelText("会话列表");
    const row = await within(conversationList).findByRole("button", { name: "打开会话 陈可乐" });
    fireEvent.contextMenu(row);
    const editMenuItem = await screen.findByRole("menuitem", { name: "编辑备注" });
    fireEvent.click(editMenuItem);
    const remarkDialog = await screen.findByRole("dialog", { name: "编辑会话备注" });
    fireEvent.change(within(remarkDialog).getByLabelText("平台会话备注"), { target: { value: "重要客户" } });
    fireEvent.click(within(remarkDialog).getByRole("button", { name: "保存备注" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ platformRemark: "重要客户" }),
        }),
      ),
    );

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑会话备注" })).not.toBeInTheDocument());
    const nextRow = await within(conversationList).findByRole("button", { name: "打开会话 陈可乐" });
    fireEvent.contextMenu(nextRow);
    fireEvent.click(await screen.findByRole("menuitem", { name: "隐藏会话" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ hidden: true }),
        }),
      ),
    );
  });

  it("隐藏会话乐观状态在服务端刷新后清理，允许新消息重新显示", async () => {
    let conversationHidden = false;
    const fetchMock = mockFetch(conversationActionRoutes());
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/conversations/conv_1" && init?.method === "PATCH") {
        conversationHidden = true;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/api/conversations") {
        return new Response(
          JSON.stringify([
            {
              id: "conv_1",
              accountId: "acc_1",
              peerWxid: "wxid_target",
              type: "private",
              platformRemark: "陈可乐",
              lastMessageText: conversationHidden ? "新消息后重新显示" : "待处理消息",
              lastMessageAt: "2026-07-06T07:16:37.000Z",
              unreadCount: 3,
              isHidden: false,
              status: "active",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(conversationActionRoutes()[path as keyof ReturnType<typeof conversationActionRoutes>]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderWorkbenchPage();

    const conversationList = screen.getByLabelText("会话列表");
    const row = await within(conversationList).findByRole("button", { name: "打开会话 陈可乐" });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: "隐藏会话" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ hidden: true }),
        }),
      ),
    );
    expect(await within(conversationList).findByText("新消息后重新显示")).toBeInTheDocument();
  });

  it("会话管理抽屉集中展示信息、绑定应用、投递统计和解绑流程", async () => {
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
        { id: "app_1", name: "Hermes 助手", defaultDebounceMs: 500, defaultMaxWaitMs: 2000 },
        { id: "app_2", name: "值班助手", defaultDebounceMs: 800, defaultMaxWaitMs: 3000 },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "待处理消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          unreadCount: 0,
          status: "active",
          app: { id: "app_1", name: "Hermes 助手" },
          deliveryFilter: "all",
          debounceMs: 300,
          maxWaitMs: 1000,
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_1", "msg_1", "待处理消息", "2026-07-06T07:16:37.000Z"),
      ],
      "/api/conversations/conv_1/bind": { ok: true },
      "/api/conversations/conv_1/unbind": { ok: true },
    });

    renderWorkbenchPage();

    const row = await within(screen.getByLabelText("会话列表")).findByRole("button", { name: "打开会话 陈可乐" });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: "会话管理" }));

    const sheet = await screen.findByRole("dialog", { name: "会话管理" });
    expect(within(sheet).getByText("会话信息")).toBeInTheDocument();
    expect(within(sheet).getAllByText("wxid_target").length).toBeGreaterThan(0);
    expect(within(sheet).getByText("客服主号")).toBeInTheDocument();
    expect(within(sheet).getByText("应用绑定")).toBeInTheDocument();
    expect(within(sheet).getByText("当前绑定应用")).toBeInTheDocument();
    expect(within(sheet).getAllByText("Hermes 助手").length).toBeGreaterThan(0);
    expect(within(sheet).getByText("投递统计")).toBeInTheDocument();
    expect(within(sheet).getByText("近 24h 成功")).toBeInTheDocument();

    fireEvent.change(within(sheet).getByLabelText("绑定应用"), { target: { value: "app_2" } });
    fireEvent.change(within(sheet).getByLabelText("投递过滤"), { target: { value: "at_only" } });
    fireEvent.change(within(sheet).getByLabelText("防抖毫秒"), { target: { value: "900" } });
    fireEvent.change(within(sheet).getByLabelText("最大等待毫秒"), { target: { value: "4000" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "保存绑定" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/bind",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            appId: "app_2",
            deliveryFilter: "at_only",
            debounceMs: 900,
            maxWaitMs: 4000,
          }),
        }),
      ),
    );

    await waitFor(() => expect(within(sheet).getByRole("button", { name: "解绑应用" })).toBeEnabled());
    fireEvent.click(within(sheet).getByRole("button", { name: "解绑应用" }));
    const alert = await screen.findByRole("alertdialog", { name: "解绑应用" });
    expect(within(alert).getByText("解绑后该会话消息将停止投递")).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "确认解绑" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/conversations/conv_1/unbind",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});

function installLocalStorageMock() {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    },
  });
}

function conversationActionRoutes() {
  return {
    "/api/accounts": [
      {
        id: "acc_1",
        wxid: "wxid_bot",
        nickname: "客服主号",
        onlineStatus: "online",
      },
    ],
    "/api/apps": [{ id: "app_1", name: "Hermes 助手" }],
    "/api/conversations": [
      {
        id: "conv_1",
        accountId: "acc_1",
        peerWxid: "wxid_target",
        type: "private",
        platformRemark: "陈可乐",
        lastMessageText: "待处理消息",
        lastMessageAt: "2026-07-06T07:16:37.000Z",
        unreadCount: 3,
        status: "active",
      },
    ],
    "/api/conversations/conv_1/messages?take=50": [
      messageFixture("row_1", "msg_1", "待处理消息", "2026-07-06T07:16:37.000Z"),
    ],
  };
}

function conversationSummary(input: {
  id: string;
  name: string;
  lastMessageAt: string;
  lastOpenedAt?: string;
}): ConversationSummary {
  return {
    id: input.id,
    name: input.name,
    originalName: input.name,
    type: "private",
    lastMessage: "最近消息",
    lastAt: "15:16",
    unread: 0,
    avatarText: input.name.slice(0, 1),
    status: "active",
    raw: {
      id: input.id,
      accountId: "acc_1",
      peerWxid: `${input.id}_wxid`,
      type: "private",
      platformRemark: input.name,
      lastMessageText: "最近消息",
      lastMessageAt: input.lastMessageAt,
      lastOpenedAt: input.lastOpenedAt,
      status: "active",
    },
  };
}
