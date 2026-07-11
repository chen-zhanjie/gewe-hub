import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileConversationsPage } from "./MobileConversationsPage";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockWorkspace() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/accounts") return response([
      { id: "acc-1", wxid: "wxid_one", nickname: "客服一号", onlineStatus: "online" },
      { id: "acc-2", wxid: "wxid_two", nickname: "客服二号", onlineStatus: "offline" },
    ]);
    if (path === "/api/apps") return response([]);
    if (path === "/api/conversations") return response([
      { id: "conv-pinned", accountId: "acc-1", peerWxid: "wxid_a", type: "private", name: "林晴", lastMessageText: "文件已收到", lastMessageAt: "2026-07-11T10:24:00Z", pinnedAt: "2026-07-11T10:00:00Z", unreadCount: 2, status: "active" },
      { id: "conv-group", accountId: "acc-1", peerWxid: "room@chatroom", type: "group", name: "产品讨论群", lastMessageText: "这版交互我补一下", lastMessageAt: "2026-07-11T09:52:00Z", unreadCount: 0, status: "active" },
      { id: "conv-other", accountId: "acc-2", peerWxid: "wxid_b", type: "private", name: "其他账号会话", lastMessageText: "不应显示", unreadCount: 0, status: "active" },
    ]);
    if (path === "/api/conversations/conv-pinned/read" && init?.method === "POST") return response({ ok: true });
    if (path === "/api/conversations/conv-pinned" && init?.method === "PATCH") return response({ ok: true });
    return response({ error: { message: `not found ${path}` } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage(props: Partial<React.ComponentProps<typeof MobileConversationsPage>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MobileConversationsPage onOpenConversation={vi.fn()} {...props} />
      <Toaster />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("MobileConversationsPage", () => {
  it("按当前账号展示置顶、普通会话和未读数", async () => {
    mockWorkspace();
    renderPage();

    expect(await screen.findByRole("heading", { name: "会话" })).toBeInTheDocument();
    expect(await screen.findByText("置顶")).toBeInTheDocument();
    expect(screen.getByText("普通会话")).toBeInTheDocument();
    expect(screen.getByText("林晴")).toBeInTheDocument();
    expect(screen.getByText("产品讨论群")).toBeInTheDocument();
    expect(screen.queryByText("其他账号会话")).not.toBeInTheDocument();
    expect(screen.getByLabelText("林晴 2 条未读")).toBeInTheDocument();
  });

  it("搜索会话并点击进入聊天", async () => {
    mockWorkspace();
    const onOpenConversation = vi.fn();
    renderPage({ onOpenConversation });
    await screen.findByText("林晴");

    fireEvent.change(screen.getByPlaceholderText("搜索会话"), { target: { value: "产品" } });
    expect(screen.queryByText("林晴")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /打开会话 产品讨论群/ }));
    expect(onOpenConversation).toHaveBeenCalledWith("conv-group");
  });

  it("切换微信账号后仅展示对应会话", async () => {
    mockWorkspace();
    renderPage();
    await screen.findByText("林晴");

    fireEvent.click(screen.getByRole("button", { name: /切换微信账号 客服一号/ }));
    const dialog = screen.getByRole("dialog", { name: "选择微信账号" });
    fireEvent.click(within(dialog).getByRole("button", { name: /客服二号/ }));

    expect(await screen.findByText("其他账号会话")).toBeInTheDocument();
    expect(screen.queryByText("林晴")).not.toBeInTheDocument();
  });

  it("打开会话操作并执行标为已读", async () => {
    const fetchMock = mockWorkspace();
    renderPage();
    await screen.findByText("林晴");

    fireEvent.click(screen.getByRole("button", { name: "林晴 更多操作" }));
    fireEvent.click(screen.getByRole("button", { name: "标为已读" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv-pinned/read",
      expect.objectContaining({ method: "POST" }),
    ));
  });
});
