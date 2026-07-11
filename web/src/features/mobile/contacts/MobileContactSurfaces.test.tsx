import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HubAppSummary } from "@/features/workbench/queries";
import { mapAccountSummary, mapConversationSummary } from "@/lib/workspace-data";
import { MobileContactProfilePage } from "./MobileContactProfilePage";
import { MobileGroupMembersPage } from "./MobileGroupMembersPage";
import { MobileConversationManagePage } from "../conversations/MobileConversationManagePage";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}<Toaster /></QueryClientProvider>);
}

const backendAccount = { id: "acc-1", wxid: "wxid_bot", nickname: "客服一号", onlineStatus: "online" as const };
const backendConversation = {
  id: "conv-group",
  accountId: "acc-1",
  peerWxid: "product@chatroom",
  type: "group" as const,
  name: "产品讨论群",
  platformRemark: "核心产品群",
  avatarUrl: null,
  lastMessageText: "收到",
  lastMessageAt: "2026-07-11T08:00:00.000Z",
  status: "active" as const,
  app: { id: "app-1", name: "客服应用" },
  deliveryFilter: "all" as const,
  debounceMs: 300,
  maxWaitMs: 1500,
};
const conversation = mapConversationSummary(backendConversation);
const account = mapAccountSummary(backendAccount);
const apps: HubAppSummary[] = [
  { id: "app-1", name: "客服应用" },
  { id: "app-2", name: "通知应用" },
];

function installProfileApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === "/api/contacts/wxid_lin/profile?accountId=acc-1") return response({
      accountId: "acc-1",
      wxid: "wxid_lin",
      contact: { id: "contact-1", wxid: "wxid_lin", nickname: "林晴", platformRemark: "产品林晴", avatarUrl: null, status: "active" },
      groupMemberships: [{ id: "member-1", wxid: "wxid_lin", nickname: "林晴", displayName: "晴晴", platformRemark: "群内备注", avatarUrl: null, status: "active", group: { id: "group-1", wxid: "product@chatroom", name: "产品讨论群", avatarUrl: null, platformRemark: null } }],
      privateConversation: { id: "conv-private" },
      commonGroups: [{ id: "group-1", wxid: "product@chatroom", name: "产品讨论群", avatarUrl: null, platformRemark: null }],
    });
    return response({ error: { message: `not found ${path}` } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function installGroupApi() {
  const memberPages = [
    { items: [{ id: "member-1", wxid: "wxid_lin", nickname: "林晴", displayName: "晴晴", platformRemark: "产品林晴", avatarUrl: null, status: "active" }], total: 2, take: 50, skip: 0, nextSkip: 1, hasMore: true },
    { items: [{ id: "member-2", wxid: "wxid_zhou", nickname: "周远", displayName: null, platformRemark: null, avatarUrl: null, status: "left" }], total: 2, take: 50, skip: 1, nextSkip: 2, hasMore: false },
  ];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/groups?accountId=acc-1&q=product%40chatroom") return response([{ id: "group-1", accountId: "acc-1", wxid: "product@chatroom", name: "产品讨论群", status: "active" }]);
    if (path === "/api/groups/group-1/members?take=50&skip=0") return response(memberPages[0]);
    if (path === "/api/groups/group-1/members?take=50&skip=1") return response(memberPages[1]);
    if (path === "/api/groups/group-1/members?take=50&skip=0&q=%E5%91%A8%E8%BF%9C") return response({ ...memberPages[1], skip: 0 });
    if (path === "/api/groups/group-1/members/member-1" && init?.method === "PATCH") return response({ ok: true });
    if (path === "/api/groups/group-1/sync-members" && init?.method === "POST") return response({ id: "task-sync" });
    if (path === "/api/outbox/tasks/task-sync") return response({ id: "task-sync", status: "done" });
    return response({ error: { message: `not found ${path}` } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function installManagementApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/conversations/conv-group" && init?.method === "PATCH") return response({ ok: true });
    if (path === "/api/conversations/conv-group/bind" && init?.method === "POST") return response({ ok: true });
    if (path === "/api/conversations/conv-group/unbind" && init?.method === "POST") return response({ ok: true });
    if (path === "/api/accounts") return response([backendAccount]);
    if (path === "/api/conversations") return response([backendConversation]);
    if (path === "/api/apps") return response(apps);
    return response({ error: { message: `not found ${path}` } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MobileContactProfilePage", () => {
  it("只展示现有联系人资料并打开已有私聊，不提供编辑或删除", async () => {
    installProfileApi();
    const onOpenConversation = vi.fn();
    renderPage(<MobileContactProfilePage accountId="acc-1" wxid="wxid_lin" onBack={vi.fn()} onOpenConversation={onOpenConversation} />);

    expect(await screen.findByRole("heading", { name: "联系人详情" })).toBeInTheDocument();
    expect((await screen.findAllByText("产品林晴")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("wxid_lin").length).toBeGreaterThan(0);
    expect(screen.getByText("联系人 / 群成员")).toBeInTheDocument();
    expect(screen.getByText("群内备注")).toBeInTheDocument();
    expect(screen.getByText("产品讨论群")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /编辑联系人/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /删除联系人/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /打开私聊会话/ }));
    expect(onOpenConversation).toHaveBeenCalledWith("conv-private");
  });
});

describe("MobileGroupMembersPage", () => {
  it("支持搜索、同步、加载更多，并通过成员操作编辑备注或查看详情", async () => {
    const fetchMock = installGroupApi();
    const onOpenContact = vi.fn();
    renderPage(<MobileGroupMembersPage conversation={conversation} onBack={vi.fn()} onOpenContact={onOpenContact} />);

    expect(await screen.findByRole("heading", { name: "群成员" })).toBeInTheDocument();
    expect(await screen.findByText("产品林晴(晴晴)")).toBeInTheDocument();
    expect(screen.getByText("共 2 位成员")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "加载更多群成员" }));
    expect(await screen.findByText("周远")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("button", { name: /群成员 产品林晴/ }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑成员备注" }));
    fireEvent.change(screen.getByRole("textbox", { name: "成员备注" }), { target: { value: "新备注" } });
    fireEvent.click(screen.getByRole("button", { name: "保存成员备注" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/groups/group-1/members/member-1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ platformRemark: "新备注" }) })));

    fireEvent.contextMenu(screen.getByRole("button", { name: /群成员 产品林晴/ }));
    fireEvent.click(await screen.findByRole("button", { name: "查看联系人详情" }));
    expect(onOpenContact).toHaveBeenCalledWith("wxid_lin");

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索群成员" }), { target: { value: "周远" } });
    fireEvent.submit(screen.getByRole("search", { name: "搜索群成员" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/groups/group-1/members?take=50&skip=0&q=%E5%91%A8%E8%BF%9C", expect.anything()));

    fireEvent.click(screen.getByRole("button", { name: "同步群成员" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/groups/group-1/sync-members", expect.objectContaining({ method: "POST" })));
    expect(screen.queryByRole("button", { name: /邀请|移出群聊|踢出/ })).not.toBeInTheDocument();
  });
});

describe("MobileConversationManagePage", () => {
  it("展示会话资料，保存备注和完整绑定参数，并在确认后解绑", async () => {
    const fetchMock = installManagementApi();
    renderPage(<MobileConversationManagePage conversation={conversation} account={account} apps={apps} onBack={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "会话管理" })).toBeInTheDocument();
    expect(screen.getAllByText("核心产品群(产品讨论群)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("product@chatroom").length).toBeGreaterThan(0);
    expect(screen.getByText("客服一号")).toBeInTheDocument();
    expect(screen.queryByText("投递统计")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "平台会话备注" }), { target: { value: "新的会话备注" } });
    fireEvent.click(screen.getByRole("button", { name: "保存备注" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/conversations/conv-group", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ platformRemark: "新的会话备注" }) })));

    fireEvent.change(screen.getByRole("combobox", { name: "绑定应用" }), { target: { value: "app-2" } });
    fireEvent.change(screen.getByRole("combobox", { name: "投递过滤" }), { target: { value: "at_only" } });
    fireEvent.change(screen.getByRole("textbox", { name: "防抖毫秒" }), { target: { value: "500" } });
    fireEvent.change(screen.getByRole("textbox", { name: "最大等待毫秒" }), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存绑定" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/conversations/conv-group/bind", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ appId: "app-2", deliveryFilter: "at_only", debounceMs: 500, maxWaitMs: 2000 }),
    })));

    fireEvent.click(screen.getByRole("button", { name: "解绑应用" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("解绑后该会话消息将停止投递");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/conversations/conv-group/unbind", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "确认解绑" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/conversations/conv-group/unbind", expect.objectContaining({ method: "POST" })));
  });
});
