import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPages";
import { mockFetch, render } from "./AdminPages.test-utils";

describe("AdminPage stage 3 management surfaces", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("应用管理只保留表格页面，新增应用在 Sheet 中完成", async () => {
    mockFetch({
      "/api/apps": [],
      "/api/accounts": [],
    });

    render(<AdminPage page="apps" />);

    await screen.findByRole("table", { name: "应用列表" });
    expect(screen.queryByLabelText("应用名称")).not.toBeInTheDocument();
    expect(screen.queryByText("应用级账号备注")).not.toBeInTheDocument();
    expect(screen.queryByText("绑定会话列表")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增应用" }));

    const sheet = await screen.findByRole("dialog", { name: "新增应用" });
    expect(within(sheet).getByLabelText("应用名称")).toHaveFocus();
    expect(within(sheet).getByText("应用级账号备注")).toBeInTheDocument();
  });

  it("应用编辑 Sheet 合并应用级账号备注并提交 accountRemarks", async () => {
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
          accountRemarks: [{ accountId: "acc_real_1", remark: "旧备注", tags: ["old"] }],
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
      "/api/apps/app_real": { id: "app_real", name: "真实 Hermes 应用" },
    });

    render(<AdminPage page="apps" />);

    const table = await screen.findByRole("table", { name: "应用列表" });
    fireEvent.click(within(table).getByRole("button", { name: "编辑应用" }));

    const sheet = await screen.findByRole("dialog", { name: "编辑应用" });
    fireEvent.change(within(sheet).getByLabelText("账号备注：平台主号"), { target: { value: "应用主控账号" } });
    fireEvent.change(within(sheet).getByLabelText("账号标签：平台主号"), { target: { value: "owner,prod" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "保存应用" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/apps/app_real",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"accountRemarks"'),
          credentials: "include",
        }),
      ),
    );
    const [, init] = fetchMock.mock.calls.find(
      ([input, requestInit]) => String(input).replace("http://localhost", "") === "/api/apps/app_real" && requestInit?.method === "PATCH",
    )!;
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        accountRemarks: [{ accountId: "acc_real_1", remark: "应用主控账号", tags: ["owner", "prod"] }],
      }),
    );
  });

  it("应用绑定会话在行操作 Sheet 中展示", async () => {
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
      "/api/accounts": [],
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
            boundAt: "2026-07-06T07:16:37.000Z",
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

    const table = await screen.findByRole("table", { name: "应用列表" });
    fireEvent.click(within(table).getByRole("button", { name: "查看绑定会话" }));

    const sheet = await screen.findByRole("dialog", { name: "绑定会话" });
    expect(within(sheet).getByRole("table", { name: "应用绑定会话列表" })).toBeInTheDocument();
    expect(within(sheet).getByText("真实产品群")).toBeInTheDocument();
    expect(within(sheet).getByText("只投递 @ 我")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/apps/app_real/conversations?take=50&skip=0",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("账号管理使用表格和 Dialog 表单，联系人从行操作 Sheet 打开", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_real_1",
          appId: "wx_app",
          wxid: "wxid_bot",
          nickname: "客服主号",
          platformRemark: "平台主号",
          onlineStatus: "online",
          source: "manual",
          lastSyncAt: "2026-07-06T07:16:37.000Z",
        },
      ],
    });

    render(<AdminPage page="accounts" />);

    const table = await screen.findByRole("table", { name: "微信账号列表" });
    expect(screen.queryByText("手动录入账号")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("GeWe appId")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增账号" }));
    const dialog = await screen.findByRole("dialog", { name: "新增账号" });
    expect(within(dialog).getByLabelText("GeWe appId")).toHaveFocus();

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    fireEvent.click(within(table).getByRole("button", { name: "联系人" }));

    const contactsSheet = await screen.findByRole("dialog", { name: "联系人" });
    expect(within(contactsSheet).getByRole("table", { name: "联系人列表" })).toBeInTheDocument();
    expect(within(contactsSheet).getByPlaceholderText("搜索联系人")).toBeInTheDocument();
    expect(within(contactsSheet).getByRole("button", { name: "同步通讯录" })).toBeInTheDocument();
  });

  it("推送日志和发送记录只保留一层快速状态筛选", async () => {
    mockFetch({
      "/api/deliveries?take=20&skip=0&status=failed": [],
      "/api/send-requests?take=20&skip=0": [],
    });

    const { unmount } = render(<AdminPage page="deliveries" />);
    await screen.findByRole("table", { name: "推送日志列表" });
    expect(screen.queryByLabelText("投递状态筛选")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "投递状态: failed" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "失败 0" })).toBeInTheDocument();
    unmount();

    render(<AdminPage page="sendRequests" />);
    await screen.findByRole("table", { name: "发送记录列表" });
    expect(screen.queryByLabelText("发送状态筛选")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送状态: 全部状态" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部 0" })).toBeInTheDocument();
  });
});
