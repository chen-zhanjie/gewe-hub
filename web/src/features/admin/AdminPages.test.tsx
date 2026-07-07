import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPages";
import { mockFetch, render } from "./AdminPages.test-utils";

describe("AdminPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("应用管理从真实 API 加载应用列表", async () => {
    const fetchMock = mockFetch({
      "/api/apps": [
        {
          id: "app_real",
          name: "真实 Hermes 应用",
          status: "active",
          ownerWxid: "wxid_owner_real",
          token: "ghub_real_token_123456",
          defaultDebounceMs: 1500,
          _count: { conversations: 7 },
        },
      ],
    });

    render(<AdminPage page="apps" />);

    expect(await screen.findByText("真实 Hermes 应用")).toBeInTheDocument();
    expect(screen.getByText("wxid_owner_real")).toBeInTheDocument();
    expect(screen.getByText("7 个")).toBeInTheDocument();
    expect(screen.queryByText("客服审计")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/apps",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("应用管理可以新建应用并刷新列表", async () => {
    const fetchMock = mockFetch({
      "/api/apps": [],
    });

    render(<AdminPage page="apps" />);

    await screen.findByText("暂无应用");
    fireEvent.click(screen.getByRole("button", { name: "新增应用" }));
    const formSheet = await screen.findByRole("dialog", { name: "新增应用" });
    fireEvent.change(screen.getByLabelText("应用名称"), { target: { value: "Hermes 新应用" } });
    fireEvent.change(screen.getByLabelText("Owner wxid"), { target: { value: "wxid_owner" } });
    fireEvent.change(screen.getByLabelText("默认防抖毫秒"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("默认最大等待毫秒"), { target: { value: "8000" } });
    fireEvent.click(within(formSheet).getByRole("button", { name: "保存应用" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/apps",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Hermes 新应用",
            ownerWxid: "wxid_owner",
            mainConversationId: undefined,
            defaultDebounceMs: 2000,
            defaultMaxWaitMs: 8000,
            deliverSelfMessages: false,
          }),
          credentials: "include",
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).replace("http://localhost", "") === "/api/apps" && !init?.method,
      ),
    ).toHaveLength(2);
  });

  it("应用管理可以重置应用 token 并刷新列表", async () => {
    const fetchMock = mockFetch({
      "/api/apps": [
        {
          id: "app_real",
          name: "真实 Hermes 应用",
          status: "active",
          ownerWxid: "wxid_owner_real",
          token: "ghub_real_token_123456",
          defaultDebounceMs: 1500,
          _count: { conversations: 7 },
        },
      ],
      "/api/apps/app_real/reset-token": {
        id: "app_real",
        token: "ghub_next_token_123456",
      },
    });

    render(<AdminPage page="apps" />);

    const appCard = await screen.findByText("真实 Hermes 应用");
    fireEvent.click(within(appCard.closest("section")!).getByRole("button", { name: "重置 token" }));

    const confirmDialog = await screen.findByRole("alertdialog", { name: "重置 token" });
    expect(within(confirmDialog).getByText("请输入应用名称确认重置 token")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("真实 Hermes 应用")).toBeInTheDocument();
    expect(within(confirmDialog).getByRole("button", { name: "确认重置 token" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/apps/app_real/reset-token",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.change(within(confirmDialog).getByLabelText("输入应用名称确认"), { target: { value: "真实 Hermes 应用" } });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "确认重置 token" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/apps/app_real/reset-token",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/apps")).toHaveLength(2);
  });

  it("应用管理可以编辑应用基础配置并刷新列表", async () => {
    const fetchMock = mockFetch({
      "/api/apps": [
        {
          id: "app_real",
          name: "真实 Hermes 应用",
          status: "active",
          ownerWxid: "wxid_owner_real",
          token: "ghub_real_token_123456",
          defaultDebounceMs: 1500,
          defaultMaxWaitMs: 6000,
          deliverSelfMessages: false,
          _count: { conversations: 7 },
        },
      ],
      "/api/apps/app_real": {
        id: "app_real",
        name: "Hermes 生产应用",
      },
    });

    render(<AdminPage page="apps" />);

    const appCard = await screen.findByText("真实 Hermes 应用");
    fireEvent.click(within(appCard.closest("section")!).getByRole("button", { name: "编辑应用" }));
    const formSheet = await screen.findByRole("dialog", { name: "编辑应用" });
    fireEvent.change(within(formSheet).getByLabelText("应用名称"), { target: { value: "Hermes 生产应用" } });
    fireEvent.change(within(formSheet).getByLabelText("Owner wxid"), { target: { value: "wxid_owner_prod" } });
    fireEvent.change(within(formSheet).getByLabelText("默认防抖毫秒"), { target: { value: "2500" } });
    fireEvent.change(within(formSheet).getByLabelText("默认最大等待毫秒"), { target: { value: "9000" } });
    fireEvent.click(within(formSheet).getByRole("button", { name: "保存应用" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/apps/app_real",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Hermes 生产应用",
            ownerWxid: "wxid_owner_prod",
            mainConversationId: undefined,
            defaultDebounceMs: 2500,
            defaultMaxWaitMs: 9000,
            deliverSelfMessages: false,
            accountRemarks: [],
          }),
          credentials: "include",
        }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/apps")).toHaveLength(2);
  });

  it("应用管理可以查看应用绑定会话列表", async () => {
    const fetchMock = mockFetch({
      "/api/apps": [
        {
          id: "app_real",
          name: "真实 Hermes 应用",
          status: "active",
          ownerWxid: "wxid_owner_real",
          token: "ghub_real_token_123456",
          defaultDebounceMs: 1500,
          _count: { conversations: 1 },
        },
      ],
      "/api/apps/app_real/conversations?take=50&skip=0": {
        items: [
          {
            id: "conv_1",
            platformRemark: "真实产品群",
            name: null,
            peerWxid: "room@chatroom",
            deliveryFilter: "at_only",
            debounceMs: 2000,
            maxWaitMs: 8000,
          },
        ],
        total: 1,
        take: 50,
        skip: 0,
        nextSkip: 1,
        hasMore: false,
      },
    });

    render(<AdminPage page="apps" />);

    const appCard = await screen.findByText("真实 Hermes 应用");
    fireEvent.click(within(appCard.closest("section")!).getByRole("button", { name: "查看绑定会话" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/apps/app_real/conversations?take=50&skip=0",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(await screen.findByText("真实产品群")).toBeInTheDocument();
    expect(screen.getByText("只投递 @ 我")).toBeInTheDocument();
  });

  it("应用管理可以保存应用级微信账号备注", async () => {
    const fetchMock = mockFetch({
      "/api/apps": [
        {
          id: "app_real",
          name: "真实 Hermes 应用",
          status: "active",
          ownerWxid: "wxid_owner_real",
          token: "ghub_real_token_123456",
          defaultDebounceMs: 1500,
          defaultMaxWaitMs: 6000,
          deliverSelfMessages: false,
          accountRemarks: [],
          _count: { conversations: 7 },
        },
      ],
      "/api/accounts": [
        {
          id: "acc_real_1",
          appId: "wx_app",
          wxid: "wxid_bot",
          nickname: "客服主号",
          platformRemark: "平台主号",
          onlineStatus: "online",
        },
      ],
      "/api/apps/app_real": {
        id: "app_real",
        accountRemarks: [{ id: "remark_1", remark: "应用主控账号" }],
      },
    });

    render(<AdminPage page="apps" />);

    expect(await screen.findByText("真实 Hermes 应用")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑应用" }));
    const formSheet = await screen.findByRole("dialog", { name: "编辑应用" });
    fireEvent.change(within(formSheet).getByLabelText("账号备注：平台主号"), { target: { value: "应用主控账号" } });
    fireEvent.change(within(formSheet).getByLabelText("账号标签：平台主号"), { target: { value: "owner,prod" } });
    fireEvent.click(within(formSheet).getByRole("button", { name: "保存应用" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/apps/app_real",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "真实 Hermes 应用",
            ownerWxid: "wxid_owner_real",
            mainConversationId: undefined,
            defaultDebounceMs: 1500,
            defaultMaxWaitMs: 6000,
            deliverSelfMessages: false,
            accountRemarks: [
              {
                accountId: "acc_real_1",
                remark: "应用主控账号",
                tags: ["owner", "prod"],
              },
            ],
          }),
          credentials: "include",
        }),
      ),
    );
  });

  it("推送日志从无副作用 delivery 管理 API 加载", async () => {
    const fetchMock = mockFetch({
      "/api/deliveries?take=20&skip=0&status=failed": [
        {
          eventId: "del_real_1",
          status: "failed",
          attempts: 3,
          updatedAt: "2026-07-06T07:16:37.000Z",
          app: { name: "真实 Hermes 应用" },
          message: {
            conversation: {
              platformRemark: "真实产品群",
              name: null,
              peerWxid: "room@chatroom",
            },
          },
        },
      ],
    });

    render(<AdminPage page="deliveries" />);

    const table = await screen.findByRole("table", { name: "推送日志列表" });
    expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "失败 1" })).toBeInTheDocument();
    expect(screen.queryByLabelText("投递状态筛选")).not.toBeInTheDocument();
    expect(screen.getByLabelText("每页数量")).toHaveValue("20");
    expect(within(table).getByText("del_real_1")).toBeInTheDocument();
    expect(within(table).getByText("真实 Hermes 应用")).toBeInTheDocument();
    expect(within(table).getByText("真实产品群")).toBeInTheDocument();
    expect(within(table).queryByText("del_msg_1001_app_001")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=20&skip=0&status=failed",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("推送日志默认聚焦失败投递，并能一键切换到全部投递", async () => {
    const fetchMock = mockFetch({
      "/api/deliveries?take=20&skip=0&status=failed": [
        {
          eventId: "del_failed_focus_1",
          status: "failed",
          attempts: 3,
          lastError: "SSE 连接断开",
          updatedAt: "2026-07-06T07:16:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            conversation: {
              platformRemark: "产品体验群",
              peerWxid: "room@chatroom",
            },
          },
        },
      ],
      "/api/deliveries?take=20&skip=0": [
        {
          eventId: "del_all_1",
          status: "delivered",
          attempts: 1,
          updatedAt: "2026-07-06T07:17:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            conversation: {
              platformRemark: "产品体验群",
              peerWxid: "room@chatroom",
            },
          },
        },
      ],
    });
    const deliveryFilterChange = vi.fn();

    render(<AdminPage page="deliveries" onDeliveryFiltersChange={deliveryFilterChange} />);

    expect(await screen.findByText("del_failed_focus_1")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "推送日志状态" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "失败 1" })).toHaveAttribute("aria-pressed", "true");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=20&skip=0&status=failed",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "全部 1" }));

    expect(await screen.findByText("del_all_1")).toBeInTheDocument();
    expect(deliveryFilterChange).toHaveBeenLastCalledWith({ status: "", page: 1, pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=20&skip=0",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("推送日志重投失败 delivery 前需要二次确认", async () => {
    const fetchMock = mockFetch({
      "/api/deliveries?take=20&skip=0&status=failed": [
        {
          eventId: "del_retry_1",
          eventType: "message.created",
          status: "failed",
          attempts: 3,
          lastError: "SSE 连接断开",
          updatedAt: "2026-07-06T07:16:37.000Z",
          app: { name: "真实 Hermes 应用" },
          message: {
            conversation: {
              platformRemark: "真实产品群",
              name: null,
              peerWxid: "room@chatroom",
            },
          },
        },
      ],
      "/api/deliveries/del_retry_1/retry": {
        eventId: "del_retry_1",
        status: "queued",
      },
    });

    render(<AdminPage page="deliveries" />);

    const table = await screen.findByRole("table", { name: "推送日志列表" });
    expect(within(table).getByText("room@chatroom")).toBeInTheDocument();
    expect(within(table).getByLabelText("真实产品群")).toHaveClass("size-6");
    const updatedAt = within(table).getByText("07-06 15:16");
    expect(updatedAt.tagName.toLowerCase()).toBe("time");
    expect(updatedAt).toHaveAttribute("datetime", "2026-07-06T07:16:37.000Z");
    expect(updatedAt).toHaveAttribute("title", "2026-07-06 15:16:37");
    fireEvent.click(within(table).getByRole("button", { name: "重投" }));

    const confirmDialog = await screen.findByRole("alertdialog", { name: "重投投递事件" });
    expect(within(confirmDialog).getByText("重投会将该投递记录重新置为 queued，并清空失败状态。")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("del_retry_1")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("真实 Hermes 应用")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/deliveries/del_retry_1/retry",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(within(confirmDialog).getByRole("button", { name: "确认重投" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/deliveries/del_retry_1/retry",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/deliveries?take=20&skip=0&status=failed")).toHaveLength(2);
  });

  it("推送日志可以打开单条详情查看 payload 和失败原因", async () => {
    mockFetch({
      "/api/deliveries?take=20&skip=0&status=failed": [
        {
          eventId: "del_detail_1",
          eventType: "message.created",
          status: "failed",
          attempts: 3,
          lastError: "SSE 连接断开",
          updatedAt: "2026-07-06T07:16:37.000Z",
          payload: {
            messageId: "msg_001",
            content: { type: "text", text: "投递详情文本" },
          },
          app: { name: "真实 Hermes 应用" },
          message: {
            messageId: "msg_001",
            renderedText: "投递详情文本",
            conversation: {
              platformRemark: "真实产品群",
              name: null,
              peerWxid: "room@chatroom",
            },
          },
        },
      ],
    });

    render(<AdminPage page="deliveries" />);

    const table = await screen.findByRole("table", { name: "推送日志列表" });
    fireEvent.click(within(table).getByRole("button", { name: "查看详情" }));

    const detailDialog = await screen.findByRole("dialog", { name: "投递详情" });
    expect(detailDialog).toHaveClass("inset-y-0");
    expect(detailDialog).toHaveClass("right-0");
    expect(within(detailDialog).getAllByText("del_detail_1").length).toBeGreaterThan(0);
    expect(within(detailDialog).getByText("真实 Hermes 应用")).toBeInTheDocument();
    expect(within(detailDialog).getByText("真实产品群")).toBeInTheDocument();
    expect(within(detailDialog).getByText("message.created")).toBeInTheDocument();
    expect(within(detailDialog).getByText("SSE 连接断开")).toBeInTheDocument();
    expect(within(detailDialog).getByText("投递 payload")).toBeInTheDocument();
    expect(within(detailDialog).getByText("投递详情文本")).toBeInTheDocument();
  });

  it("推送日志支持状态筛选、下一页请求并同步 URL", async () => {
    const fetchMock = mockFetch({
      "/api/deliveries?take=20&skip=0": [
        {
          eventId: "del_delivered_1",
          status: "delivered",
          attempts: 1,
          updatedAt: "2026-07-06T07:16:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            conversation: {
              platformRemark: "产品体验群",
              name: null,
              peerWxid: "room@chatroom",
            },
          },
        },
      ],
      "/api/deliveries?take=20&skip=0&status=failed": [
        {
          eventId: "del_failed_1",
          status: "failed",
          attempts: 3,
          updatedAt: "2026-07-06T07:17:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            conversation: {
              platformRemark: "产品体验群",
              name: null,
              peerWxid: "room@chatroom",
            },
          },
        },
        ...Array.from({ length: 19 }, (_, index) => ({
          eventId: `del_failed_extra_${index}`,
          status: "failed",
          attempts: 1,
          updatedAt: "2026-07-06T07:17:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            conversation: {
              platformRemark: "产品体验群",
              name: null,
              peerWxid: "room@chatroom",
            },
          },
        })),
      ],
      "/api/deliveries?take=20&skip=20&status=failed": [
        {
          eventId: "del_failed_2",
          status: "failed",
          attempts: 4,
          updatedAt: "2026-07-06T07:18:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            conversation: {
              platformRemark: "产品体验群",
              name: null,
              peerWxid: "room@chatroom",
            },
          },
        },
      ],
      "/api/deliveries?take=50&skip=0&status=failed": [
        {
          eventId: "del_failed_50",
          status: "failed",
          attempts: 2,
          updatedAt: "2026-07-06T07:19:37.000Z",
          app: { name: "Hermes 助手" },
          message: {
            conversation: {
              platformRemark: "产品体验群",
              name: null,
              peerWxid: "room@chatroom",
            },
          },
        },
      ],
    });

    const deliveryFilterChange = vi.fn();
    render(<AdminPage page="deliveries" deliveryFilters={{ status: "", page: 1, pageSize: 20 }} onDeliveryFiltersChange={deliveryFilterChange} />);

    expect(await screen.findByText("del_delivered_1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "失败 0" }));

    expect(await screen.findByText("del_failed_1")).toBeInTheDocument();
    expect(deliveryFilterChange).toHaveBeenLastCalledWith({ status: "failed", page: 1, pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=20&skip=0&status=failed",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(await screen.findByText("del_failed_2")).toBeInTheDocument();
    expect(deliveryFilterChange).toHaveBeenLastCalledWith({ status: "failed", page: 2, pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=20&skip=20&status=failed",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.change(screen.getByLabelText("每页数量"), { target: { value: "50" } });

    expect(await screen.findByText("del_failed_50")).toBeInTheDocument();
    expect(deliveryFilterChange).toHaveBeenLastCalledWith({ status: "failed", page: 1, pageSize: 50 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/deliveries?take=50&skip=0&status=failed",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("接入设置可以一键设置 GeWe 回调并刷新状态", async () => {
    const fetchMock = mockFetch({
      "/api/gewe/status": {
        ok: true,
        callbackUrl: "http://localhost:8090/webhook/gewe/dev-secret",
        baseUrl: "https://gewe.example",
      },
      "/api/gewe/set-callback": {
        ok: true,
        callbackUrl: "http://localhost:8090/webhook/gewe/dev-secret",
      },
    });

    render(<AdminPage page="settings" />);

    expect(await screen.findByText("http://localhost:8090/webhook/gewe/dev-secret")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一键设置回调" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gewe/set-callback",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).replace("http://localhost", "") === "/api/gewe/status" && !init?.method,
      ),
    ).toHaveLength(2);
  });

  it("账号页可以为首个微信账号创建通讯录同步任务并刷新账号列表", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_real_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/contacts?accountId=acc_real_1": [],
      "/api/groups?accountId=acc_real_1": [],
      "/api/contacts/sync": {
        id: "task_sync_1",
        taskType: "sync_contacts",
        refId: "acc_real_1",
      },
    });

    render(<AdminPage page="accounts" />);

    expect(await screen.findByText("客服主号")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "联系人" }));
    const contactsSheet = await screen.findByRole("dialog", { name: "联系人" });
    fireEvent.click(within(contactsSheet).getByRole("button", { name: "同步通讯录" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contacts/sync",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ accountId: "acc_real_1", mode: "full" }),
          credentials: "include",
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).replace("http://localhost", "") === "/api/accounts" && !init?.method,
      ),
    ).toHaveLength(2);
  });

  it("账号页优先展示离线账号，并在第一眼摘要中点名离线对象", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_online_1",
          appId: "wx_app_online",
          wxid: "wxid_online_bot",
          nickname: "在线客服",
          platformRemark: "在线主号",
          onlineStatus: "online",
        },
        {
          id: "acc_offline_1",
          appId: "wx_app_offline",
          wxid: "wxid_offline_bot",
          nickname: "离线客服",
          platformRemark: "离线主号",
          onlineStatus: "offline",
        },
      ],
    });

    render(<AdminPage page="accounts" />);

    const summary = await screen.findByRole("status", { name: "微信账号状态摘要" });
    expect(summary).toHaveTextContent("1 个账号离线");
    expect(summary).toHaveTextContent("离线主号");

    const accountTable = screen.getByRole("table", { name: "微信账号列表" });
    const accountRows = within(accountTable).getAllByRole("row").slice(1);
    expect(accountRows[0]).toHaveTextContent("离线主号");
    expect(accountRows[0]).toHaveTextContent("离线");
    expect(accountRows[1]).toHaveTextContent("在线主号");
    expect(accountRows[1]).toHaveTextContent("在线");
  });

  it("账号页可以手动录入微信账号并刷新列表", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [],
    });

    render(<AdminPage page="accounts" />);

    await screen.findByText("暂无微信账号");
    fireEvent.click(screen.getByRole("button", { name: "新增账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "新增账号" });
    fireEvent.change(within(accountDialog).getByLabelText("GeWe appId"), { target: { value: "wx_app_manual" } });
    fireEvent.change(within(accountDialog).getByLabelText("账号 wxid"), { target: { value: "wxid_manual_bot" } });
    fireEvent.change(within(accountDialog).getByLabelText("账号昵称"), { target: { value: "手动主号" } });
    fireEvent.change(within(accountDialog).getByLabelText("平台备注"), { target: { value: "本地测试号" } });
    fireEvent.click(within(accountDialog).getByRole("button", { name: "保存账号" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accounts",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            appId: "wx_app_manual",
            wxid: "wxid_manual_bot",
            nickname: "手动主号",
            platformRemark: "本地测试号",
          }),
          credentials: "include",
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).replace("http://localhost", "") === "/api/accounts" && !init?.method,
      ),
    ).toHaveLength(2);
  });

  it("账号页可以编辑已有微信账号并刷新列表", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_real_1",
          appId: "wx_app_old",
          wxid: "wxid_bot",
          nickname: "客服主号",
          platformRemark: "旧备注",
          onlineStatus: "online",
        },
      ],
      "/api/accounts/acc_real_1": {
        id: "acc_real_1",
        appId: "wx_app_old",
        wxid: "wxid_bot",
        nickname: "客服新名",
        platformRemark: "主控账号",
      },
    });

    render(<AdminPage page="accounts" />);

    expect(await screen.findByText("旧备注")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "编辑账号" });
    fireEvent.change(within(accountDialog).getByLabelText("账号昵称"), { target: { value: "客服新名" } });
    fireEvent.change(within(accountDialog).getByLabelText("平台备注"), { target: { value: "主控账号" } });
    fireEvent.click(within(accountDialog).getByRole("button", { name: "保存账号" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accounts/acc_real_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            appId: "wx_app_old",
            wxid: "wxid_bot",
            nickname: "客服新名",
            platformRemark: "主控账号",
          }),
          credentials: "include",
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).replace("http://localhost", "") === "/api/accounts" && !init?.method,
      ),
    ).toHaveLength(2);
  });
});
