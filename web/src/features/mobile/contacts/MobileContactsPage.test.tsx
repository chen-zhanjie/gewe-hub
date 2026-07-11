import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileContactsPage } from "./MobileContactsPage";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function installLocalStorageMock(selectedAccountId = "acc-1") {
  const storage = new Map<string, string>();
  if (selectedAccountId) storage.set("gewehub.mobile.accountId", selectedAccountId);
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

const accounts = [
  { id: "acc-1", wxid: "wxid_one", nickname: "客服一号", onlineStatus: "online", status: "active" },
  { id: "acc-2", wxid: "wxid_two", nickname: "客服二号", onlineStatus: "offline", status: "active" },
];

const contacts = [
  { id: "contact-active", wxid: "wxid_lin", nickname: "林晴", avatarUrl: "https://example.test/lin.jpg", status: "active" },
  { id: "contact-blocked", wxid: "wxid_zhou", nickname: "周远", platformRemark: "供应商周远", status: "blocked" },
];

const groups = [
  { id: "group-active", wxid: "product@chatroom", name: "产品讨论群", memberCount: 18, status: "active" },
  { id: "group-quit", wxid: "old@chatroom", name: "已退出群", memberCount: 6, status: "quit" },
];

function mockApi(options: { empty?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/accounts") return response(accounts);
    if (path.startsWith("/api/contacts?")) {
      const url = new URL(path, "http://localhost");
      if (url.searchParams.get("accountId") === "acc-2") return response([]);
      if (options.empty) return response([]);
      const q = url.searchParams.get("q") ?? "";
      const status = url.searchParams.get("status") ?? "";
      return response(contacts.filter((contact) => (!q || contact.nickname?.includes(q) || contact.platformRemark?.includes(q)) && (!status || contact.status === status)));
    }
    if (path.startsWith("/api/groups?")) {
      const url = new URL(path, "http://localhost");
      if (url.searchParams.get("accountId") === "acc-2" || options.empty) return response([]);
      const q = url.searchParams.get("q") ?? "";
      return response(groups.filter((group) => !q || group.name.includes(q)));
    }
    if (path === "/api/contacts/sync" && init?.method === "POST") return response({ id: "sync-contacts" });
    if (path === "/api/conversations/open" && init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      return response({ id: payload.type === "private" ? "conversation-contact" : "conversation-group" });
    }
    if (path === "/api/groups/group-active/sync-members" && init?.method === "POST") return response({ id: "task-group" });
    if (path === "/api/outbox/tasks/task-group") return response({ id: "task-group", status: "done" });
    return response({ error: { message: `not found ${path}` } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage(props: Partial<React.ComponentProps<typeof MobileContactsPage>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MobileContactsPage onOpenConversation={vi.fn()} {...props} />
      <Toaster />
    </QueryClientProvider>,
  );
}

beforeEach(() => installLocalStorageMock());
afterEach(() => vi.unstubAllGlobals());

describe("MobileContactsPage", () => {
  it("按当前账号展示联系人和群 Tab，并支持搜索与现有联系人状态筛选", async () => {
    const fetchMock = mockApi();
    renderPage();

    expect(await screen.findByRole("heading", { name: "通讯录" })).toBeInTheDocument();
    expect(await screen.findByText(/客服一号/)).toBeInTheDocument();
    expect(await screen.findByText("林晴")).toBeInTheDocument();
    expect(screen.getByText("供应商周远")).toBeInTheDocument();
    expect(screen.queryByText("产品讨论群")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索联系人或群"), { target: { value: "林晴" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/contacts?accountId=acc-1&q=%E6%9E%97%E6%99%B4", expect.anything()));
    expect(await screen.findByText("林晴")).toBeInTheDocument();
    expect(screen.queryByText("供应商周远")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("联系人状态"), { target: { value: "blocked" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/contacts?accountId=acc-1&q=%E6%9E%97%E6%99%B4&status=blocked", expect.anything()));

    fireEvent.change(screen.getByPlaceholderText("搜索联系人或群"), { target: { value: "产品" } });
    fireEvent.click(screen.getByRole("tab", { name: "群列表" }));
    expect(await screen.findByText("产品讨论群")).toBeInTheDocument();
    expect(screen.queryByLabelText("联系人状态")).not.toBeInTheDocument();
  });

  it("切换当前账号后重新加载该账号范围内的联系人和群", async () => {
    const fetchMock = mockApi();
    renderPage();
    await screen.findByText("林晴");

    fireEvent.click(screen.getByRole("button", { name: /切换微信账号 客服一号/ }));
    fireEvent.click(screen.getByRole("button", { name: /客服二号 wxid_two/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/contacts?accountId=acc-2", expect.anything()));
    expect(await screen.findByText("暂无联系人")).toBeInTheDocument();
    expect(screen.queryByText("林晴")).not.toBeInTheDocument();
  });

  it("同步通讯录，并可从 active 联系人或群发起聊天", async () => {
    const fetchMock = mockApi();
    const onOpenConversation = vi.fn();
    renderPage({ onOpenConversation });
    await screen.findByText("林晴");

    fireEvent.click(screen.getByRole("button", { name: "同步通讯录" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/contacts/sync",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ accountId: "acc-1", mode: "full" }) }),
    ));

    fireEvent.click(screen.getByRole("button", { name: "发起聊天 林晴" }));
    await waitFor(() => expect(onOpenConversation).toHaveBeenCalledWith("conversation-contact"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/open",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ accountId: "acc-1", peerWxid: "wxid_lin", type: "private" }) }),
    );

    fireEvent.click(screen.getByRole("tab", { name: "群列表" }));
    fireEvent.click(await screen.findByRole("button", { name: "发起聊天 产品讨论群" }));
    await waitFor(() => expect(onOpenConversation).toHaveBeenCalledWith("conversation-group"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/open",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ accountId: "acc-1", peerWxid: "product@chatroom", type: "group" }) }),
    );
  });

  it("同步 active 群成员，非 active 联系人和群灰显且不可操作", async () => {
    const fetchMock = mockApi();
    renderPage();
    await screen.findByText("供应商周远");

    expect(screen.getByTestId("contact-contact-blocked")).toHaveClass("opacity-50");
    expect(screen.getByRole("button", { name: "发起聊天 供应商周远" })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "群列表" }));
    expect(await screen.findByText("18 人")).toBeInTheDocument();
    expect(screen.getByTestId("group-group-quit")).toHaveClass("opacity-50");
    expect(screen.getByRole("button", { name: "发起聊天 已退出群" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "同步群成员 已退出群" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "同步群成员 产品讨论群" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/groups/group-active/sync-members",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/outbox/tasks/task-group", expect.anything()));
  });

  it("联系人和群均提供空态", async () => {
    mockApi({ empty: true });
    renderPage();

    expect(await screen.findByText("暂无联系人")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "群列表" }));
    expect(await screen.findByText("暂无群聊")).toBeInTheDocument();
  });
});
