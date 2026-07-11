import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileChatPage } from "./MobileChatPage";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const conversation = {
  id: "conv-1",
  accountId: "acc-1",
  peerWxid: "room@chatroom",
  type: "group",
  name: "产品讨论群",
  lastMessageText: "最新消息",
  lastMessageAt: "2026-07-11T10:02:00.000Z",
  unreadCount: 0,
  status: "active",
};

function message(overrides: Record<string, unknown>) {
  return {
    id: "row-1",
    messageId: "msg-1",
    senderWxid: "wxid-member",
    isSelf: false,
    status: "normal",
    sentAt: "2026-07-11T10:00:00.000Z",
    payload: {
      sender: { wxid: "wxid-member", name: "群成员甲" },
      content: { type: "text", text: "收到" },
    },
    deliveries: [],
    ...overrides,
  };
}

function mockApi(
  initialMessages: unknown[],
  options: { older?: unknown[]; failFirstSend?: boolean } = {},
) {
  let sendCount = 0;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/accounts")
        return response([
          {
            id: "acc-1",
            wxid: "wxid-bot",
            nickname: "客服一号",
            onlineStatus: "online",
          },
        ]);
      if (path === "/api/apps") return response([]);
      if (path === "/api/conversations") return response([conversation]);
      if (path === "/api/conversations/conv-1/messages?take=50")
        return response(initialMessages);
      if (path.startsWith("/api/conversations/conv-1/messages?take=50&before="))
        return response(options.older ?? []);
      if (path === "/api/send" && init?.method === "POST") {
        sendCount += 1;
        if (options.failFirstSend && sendCount === 1)
          return response({ error: { message: "网络失败" } }, 500);
        return response({ success: true, messageId: `sent-${sendCount}` });
      }
      if (path === "/api/send/send-held/dispatch" && init?.method === "POST")
        return response({ ok: true });
      if (path === "/api/send/send-self/revoke" && init?.method === "POST")
        return response({ ok: true });
      return response({ error: { message: `not found ${path}` } }, 404);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage(
  props: Partial<React.ComponentProps<typeof MobileChatPage>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MobileChatPage conversationId="conv-1" {...props} />
      <Toaster />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MobileChatPage", () => {
  it("加载历史并按日期、左右方向和群发送者展示消息", async () => {
    let resolveMessages: (value: Response) => void = () => undefined;
    const messagesResponse = new Promise<Response>((resolve) => {
      resolveMessages = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/accounts")
        return response([
          {
            id: "acc-1",
            wxid: "wxid-bot",
            nickname: "客服一号",
            onlineStatus: "online",
          },
        ]);
      if (path === "/api/apps") return response([]);
      if (path === "/api/conversations") return response([conversation]);
      if (path === "/api/conversations/conv-1/messages?take=50")
        return messagesResponse;
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPage();

    expect(await screen.findByText("正在加载消息")).toBeInTheDocument();
    resolveMessages(
      response([
        message({
          id: "self",
          messageId: "self",
          senderWxid: "wxid-bot",
          isSelf: true,
          sentAt: "2026-07-11T10:02:00.000Z",
          payload: {
            sender: { wxid: "wxid-bot", name: "客服一号" },
            content: { type: "text", text: "我来处理" },
          },
        }),
        message({
          id: "incoming",
          messageId: "incoming",
          sentAt: "2026-07-10T10:00:00.000Z",
        }),
      ]),
    );

    expect(await screen.findByText("我来处理")).toBeInTheDocument();
    expect(screen.getByText("2026年7月10日")).toBeInTheDocument();
    expect(screen.getByText("2026年7月11日")).toBeInTheDocument();
    expect(screen.getByText("群成员甲")).toBeInTheDocument();
    expect(
      container.querySelector('[data-message-direction="incoming"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-message-direction="outgoing"]'),
    ).toBeInTheDocument();
  });

  it("加载更早消息并在无消息时展示空态", async () => {
    mockApi(
      [
        message({
          id: "new",
          messageId: "new",
          payload: {
            sender: { wxid: "wxid-member", name: "群成员甲" },
            content: { type: "text", text: "新消息" },
          },
        }),
      ],
      {
        older: [
          message({
            id: "old",
            messageId: "old",
            sentAt: "2026-07-09T10:00:00.000Z",
            payload: {
              sender: { wxid: "wxid-member", name: "群成员甲" },
              content: { type: "text", text: "更早消息" },
            },
          }),
        ],
      },
    );
    renderPage();
    await screen.findByText("新消息");
    fireEvent.click(screen.getByRole("button", { name: "加载更早消息" }));
    expect(await screen.findByText("更早消息")).toBeInTheDocument();

    vi.unstubAllGlobals();
    mockApi([]);
    renderPage({ conversationId: "conv-1" });
    expect(await screen.findByText("暂无消息")).toBeInTheDocument();
  });

  it("长按消息打开现有动作，并执行 held 人工发送", async () => {
    const fetchMock = mockApi([
      message({
        id: "held",
        messageId: "held",
        sendRequestId: "send-held",
        isSelf: true,
        isSent: false,
        payload: {
          sender: { wxid: "wxid-bot", name: "客服一号" },
          content: { type: "text", text: "待人工发送" },
        },
        sendRequest: {
          id: "send-held",
          status: "held",
          deliveryMode: "confirm",
        },
      }),
    ]);
    renderPage();
    const bubble = (await screen.findByText("待人工发送")).closest("article");
    expect(bubble).not.toBeNull();
    fireEvent.touchStart(bubble!);
    const dialog = await screen.findByRole(
      "dialog",
      { name: "消息操作" },
      { timeout: 1000 },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "发送" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send/send-held/dispatch",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("默认输入器发送文本，并可从消息长按动作引用回复", async () => {
    const fetchMock = mockApi([message({ id: "quote-source", messageId: "quote-source" })]);
    renderPage();
    await screen.findByText("收到");

    fireEvent.click(screen.getByRole("button", { name: "收到 更多操作" }));
    fireEvent.click(screen.getByRole("button", { name: "引用" }));
    expect(screen.getByText("引用 收到")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), { target: { value: "回复内容", selectionStart: 4 } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/send",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-1", type: "text", text: "回复内容", replyToMessageId: "quote-source" }),
      }),
    ));
  });

  it("聊天设置只提供现有的群成员和会话管理入口", async () => {
    mockApi([]);
    const onOpenManagement = vi.fn();
    const onOpenGroupMembers = vi.fn();
    renderPage({ onOpenManagement, onOpenGroupMembers });
    await screen.findByText("暂无消息");

    fireEvent.click(screen.getByRole("button", { name: "聊天设置" }));
    fireEvent.click(screen.getByRole("button", { name: "群成员" }));
    expect(onOpenGroupMembers).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "聊天设置" }));
    fireEvent.click(screen.getByRole("button", { name: "会话管理" }));
    expect(onOpenManagement).toHaveBeenCalled();
  });

  it("失败的本地消息可长按重试或删除", async () => {
    const fetchMock = mockApi([], { failFirstSend: true });
    renderPage({
      composer: ({ sendText }) => (
        <button type="button" onClick={() => void sendText("发送失败文本")}>
          测试发送
        </button>
      ),
    });
    await screen.findByText("暂无消息");
    fireEvent.click(screen.getByRole("button", { name: "测试发送" }));
    expect(await screen.findByText("发送失败文本")).toBeInTheDocument();
    expect(await screen.findByText("发送失败")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "发送失败文本 更多操作" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input) === "/api/send"),
      ).toHaveLength(2),
    );

    mockApi([], { failFirstSend: true });
    renderPage({
      composer: ({ sendText }) => (
        <button type="button" onClick={() => void sendText("删除失败文本")}>
          再次发送
        </button>
      ),
    });
    await screen.findAllByText("暂无消息");
    fireEvent.click(screen.getByRole("button", { name: "再次发送" }));
    expect(await screen.findByText("删除失败文本")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "删除失败文本 更多操作" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() =>
      expect(screen.queryByText("删除失败文本")).not.toBeInTheDocument(),
    );
  });

  it("撤回自发消息前要求二次确认", async () => {
    const fetchMock = mockApi([
      message({
        id: "self",
        messageId: "self",
        sendRequestId: "send-self",
        senderWxid: "wxid-bot",
        isSelf: true,
        sentAt: new Date().toISOString(),
        payload: {
          sender: { wxid: "wxid-bot", name: "客服一号" },
          content: { type: "text", text: "可撤回消息" },
        },
      }),
    ]);
    renderPage();
    await screen.findByText("可撤回消息");
    fireEvent.click(
      screen.getByRole("button", { name: "可撤回消息 更多操作" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "撤回" }));

    const confirm = screen.getByRole("alertdialog", { name: "撤回消息" });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认撤回" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send/send-self/revoke",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
