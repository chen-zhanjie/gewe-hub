import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render } from "@/features/admin/AdminPages.test-utils";
import { MobileAccountsPage } from "./MobileAccountsPage";
import { MobileAppsPage } from "./MobileAppsPage";

const app = {
  id: "app_1",
  name: "Hermes",
  token: "secret-token",
  status: "active" as const,
  ownerWxid: "wxid_owner",
  createdAt: "2026-07-01T00:00:00.000Z",
  _count: { conversations: 2 },
};

const account = {
  id: "account_1",
  appId: "gewe_app",
  wxid: "wxid_bot",
  nickname: "客服主号",
  platformRemark: "主控账号",
  onlineStatus: "online" as const,
  status: "active" as const,
  source: "manual" as const,
};

describe("移动端应用与微信账号管理", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("用卡片展示应用，并保留新增、编辑、绑定、重置 Token 和停用操作", async () => {
    const fetchMock = mockFetch({
      "/api/apps": [app],
      "/api/accounts": [account],
      "/api/apps/app_1/reset-token": { ...app, token: "new-token" },
      "/api/apps/app_1": app,
    });

    render(<MobileAppsPage />);

    expect(await screen.findByRole("list", { name: "应用列表" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Hermes")).toBeInTheDocument();
    expect(screen.getByText("绑定会话 2 个")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增应用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑应用 Hermes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看绑定会话 Hermes" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重置 token Hermes" }));
    const resetDialog = await screen.findByRole("alertdialog", { name: "重置 token" });
    fireEvent.change(within(resetDialog).getByLabelText("输入应用名称确认"), { target: { value: "Hermes" } });
    fireEvent.click(within(resetDialog).getByRole("button", { name: "确认重置 token" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/apps/app_1/reset-token", expect.objectContaining({ method: "POST" })));

    fireEvent.click(screen.getByRole("button", { name: "停用应用 Hermes" }));
    const deleteDialog = await screen.findByRole("alertdialog", { name: "停用应用" });
    expect(within(deleteDialog).getByRole("button", { name: "确认停用" })).toBeDisabled();
    fireEvent.change(within(deleteDialog).getByLabelText("输入应用名确认停用"), { target: { value: "Hermes" } });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/apps/app_1", expect.objectContaining({ method: "DELETE" })));
  });

  it("应用编辑页沿用现有字段与保存协议", async () => {
    const fetchMock = mockFetch({ "/api/apps": [app], "/api/accounts": [account], "/api/apps/app_1": app });
    render(<MobileAppsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "编辑应用 Hermes" }));
    expect(await screen.findByRole("heading", { name: "编辑应用" })).toBeInTheDocument();
    expect(screen.getByLabelText("应用名称")).toHaveValue("Hermes");
    expect(screen.getByLabelText("Owner wxid")).toHaveValue("wxid_owner");
    fireEvent.change(screen.getByLabelText("应用名称"), { target: { value: "Hermes Mobile" } });
    fireEvent.click(screen.getByRole("button", { name: "保存应用" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/apps/app_1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"name":"Hermes Mobile"') }),
    ));
  });

  it("绑定页用卡片展示当前绑定会话", async () => {
    mockFetch({
      "/api/apps": [app],
      "/api/accounts": [account],
      "/api/apps/app_1/conversations?take=50&skip=0": {
        items: [{ id: "conversation_1", peerWxid: "wxid_friend", type: "private", name: "Alice", deliveryFilter: "all" }],
        total: 1,
        take: 50,
        skip: 0,
        nextSkip: 1,
        hasMore: false,
      },
    });
    render(<MobileAppsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "查看绑定会话 Hermes" }));
    expect(await screen.findByRole("heading", { name: "绑定会话" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "应用绑定会话列表" })).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("用卡片展示账号在线摘要，并保留资料刷新、通讯录、编辑、新增和停用", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [account],
      "/api/accounts/account_1/sync-profile": account,
      "/api/accounts/account_1": account,
    });
    const onOpenContacts = vi.fn();
    render(<MobileAccountsPage onOpenContacts={onOpenContacts} />);

    expect(await screen.findByText("在线 1")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "微信账号列表" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑账号 主控账号" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更新信息 主控账号" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/accounts/account_1/sync-profile", expect.objectContaining({ method: "POST" })));

    fireEvent.click(screen.getByRole("button", { name: "联系人 主控账号" }));
    expect(onOpenContacts).toHaveBeenCalledWith(account);

    fireEvent.click(screen.getByRole("button", { name: "停用账号 主控账号" }));
    const dialog = await screen.findByRole("dialog", { name: "确认停用账号" });
    expect(within(dialog).getByRole("button", { name: "确认停用" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("输入账号 wxid 确认停用"), { target: { value: "wxid_bot" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/accounts/account_1", expect.objectContaining({ method: "DELETE" })));
  });

  it("账号编辑页沿用 appId、wxid、昵称和平台备注字段", async () => {
    const fetchMock = mockFetch({ "/api/accounts": [account], "/api/accounts/account_1": account });
    render(<MobileAccountsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "编辑账号 主控账号" }));
    expect(await screen.findByRole("heading", { name: "编辑账号" })).toBeInTheDocument();
    expect(screen.getByLabelText("GeWe appId")).toHaveValue("gewe_app");
    expect(screen.getByLabelText("微信 wxid")).toHaveValue("wxid_bot");
    fireEvent.change(screen.getByLabelText("账号昵称"), { target: { value: "新昵称" } });
    fireEvent.click(screen.getByRole("button", { name: "保存账号" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/accounts/account_1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"nickname":"新昵称"') }),
    ));
  });
});
