import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FakeEventSource,
  messageFixture,
  mockFetch,
  renderWorkbenchPage,
} from "./WorkbenchPage.test-utils";
import { workbenchRealtimeMessageEvent } from "./queries";

describe("WorkbenchPage realtime events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("收到管理员内部 SSE 消息事件后刷新会话列表和当前会话消息", async () => {
    const eventSources: FakeEventSource[] = [];
    vi.stubGlobal("EventSource", class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        eventSources.push(this);
      }
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

    renderWorkbenchPage();

    await screen.findByText("旧消息");
    expect(eventSources).toHaveLength(1);
    expect(eventSources[0]?.url).toBe("/api/admin/events");
    fetchMock.mockClear();

    eventSources[0]?.emit("message.created", {
      conversationId: "conv_1",
      messageId: "msg_new",
    });

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).replace("http://localhost", "") === "/api/conversations")).toBe(true),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).replace("http://localhost", "") === "/api/conversations/conv_1/messages?take=50"),
      ).toBe(true),
    );
  });

  it("管理员 SSE 断开时在工作台顶部显示重连横幅，恢复后自动消失", async () => {
    const eventSources: FakeEventSource[] = [];
    vi.stubGlobal("EventSource", class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        eventSources.push(this);
      }
    });
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
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    expect(screen.queryByText("连接已断开，正在重连…")).not.toBeInTheDocument();

    eventSources[0]?.emit("error", {});

    expect(await screen.findByText("连接已断开，正在重连…")).toBeInTheDocument();

    eventSources[0]?.emit("open", {});

    await waitFor(() => expect(screen.queryByText("连接已断开，正在重连…")).not.toBeInTheDocument());
  });

  it("收到当前会话的完整 SSE 消息时直接追加消息流，不重新拉取当前消息列表", async () => {
    const eventSources: FakeEventSource[] = [];
    vi.stubGlobal("EventSource", class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        eventSources.push(this);
      }
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

    renderWorkbenchPage();

    await screen.findByText("旧消息");
    await waitFor(() => expect(eventSources).toHaveLength(1));
    await waitFor(() => expect(eventSources[0]?.listenerCount("message.created")).toBeGreaterThan(0));
    const realtimeMessageListener = vi.fn();
    window.addEventListener(workbenchRealtimeMessageEvent, realtimeMessageListener);
    fetchMock.mockClear();

    eventSources[0]?.emit("message.created", {
      conversationId: "conv_1",
      messageId: "msg_new",
      message: messageFixture("row_new", "msg_new", "SSE 直接追加", "2026-07-06T07:17:37.000Z"),
      conversation: {
        id: "conv_1",
        peerWxid: "wxid_target",
        type: "private",
        platformRemark: "陈可乐",
        lastMessageText: "SSE 直接追加",
        lastMessageAt: "2026-07-06T07:17:37.000Z",
        status: "active",
      },
    });

    await waitFor(() => expect(realtimeMessageListener).toHaveBeenCalledTimes(1));
    window.removeEventListener(workbenchRealtimeMessageEvent, realtimeMessageListener);
    expect(await within(screen.getByLabelText("消息区")).findByText("SSE 直接追加")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input]) => String(input).replace("http://localhost", "") === "/api/conversations/conv_1/messages?take=50",
      ),
    ).toBe(false);
  });

  it("不在底部时收到当前会话 SSE 消息显示新消息浮标，点击后滚到底部并清零", async () => {
    const eventSources: FakeEventSource[] = [];
    vi.stubGlobal("EventSource", class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        eventSources.push(this);
      }
    });
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

    const { container } = renderWorkbenchPage();

    await screen.findByText("旧消息");
    const messageList = container.querySelector(".overflow-y-auto.p-6") as HTMLDivElement | null;
    expect(messageList).toBeTruthy();
    Object.defineProperties(messageList, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1200 },
    });
    messageList!.scrollTop = 200;

    eventSources[0]?.emit("message.created", {
      conversationId: "conv_1",
      messageId: "msg_new_1",
      message: messageFixture("row_new_1", "msg_new_1", "第一条新消息", "2026-07-06T07:17:37.000Z"),
      conversation: {
        id: "conv_1",
        peerWxid: "wxid_target",
        type: "private",
        platformRemark: "陈可乐",
        lastMessageText: "第一条新消息",
        lastMessageAt: "2026-07-06T07:17:37.000Z",
        status: "active",
      },
    });

    expect(await screen.findByRole("button", { name: "跳到 1 条新消息" })).toBeInTheDocument();

    eventSources[0]?.emit("message.created", {
      conversationId: "conv_1",
      messageId: "msg_new_2",
      message: messageFixture("row_new_2", "msg_new_2", "第二条新消息", "2026-07-06T07:18:37.000Z"),
      conversation: {
        id: "conv_1",
        peerWxid: "wxid_target",
        type: "private",
        platformRemark: "陈可乐",
        lastMessageText: "第二条新消息",
        lastMessageAt: "2026-07-06T07:18:37.000Z",
        status: "active",
      },
    });

    expect(await screen.findByRole("button", { name: "跳到 2 条新消息" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "跳到 2 条新消息" }));

    expect(messageList!.scrollTop).toBe(1200);
    expect(screen.queryByRole("button", { name: "跳到 2 条新消息" })).not.toBeInTheDocument();
  });

  it("其他会话收到 SSE 消息时更新左侧摘要并显示未读点，切换过去后清零", async () => {
    const eventSources: FakeEventSource[] = [];
    vi.stubGlobal("EventSource", class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        eventSources.push(this);
      }
    });
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
          peerWxid: "wxid_alpha",
          type: "private",
          platformRemark: "Alpha 客户",
          lastMessageText: "Alpha 旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
        {
          id: "conv_2",
          peerWxid: "wxid_beta",
          type: "private",
          platformRemark: "Beta 客户",
          lastMessageText: "Beta 旧消息",
          lastMessageAt: "2026-07-06T07:15:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_alpha", "msg_alpha", "Alpha 旧消息", "2026-07-06T07:16:37.000Z"),
      ],
      "/api/conversations/conv_2/messages?take=50": [
        messageFixture("row_beta", "msg_beta", "Beta 新消息", "2026-07-06T07:17:37.000Z"),
      ],
    });

    renderWorkbenchPage();

    await screen.findByRole("heading", { name: "Alpha 客户" });
    expect(screen.getByText("Beta 旧消息")).toBeInTheDocument();
    expect(screen.queryByLabelText("Beta 客户 1 条未读消息")).not.toBeInTheDocument();

    eventSources[0]?.emit("message.created", {
      conversationId: "conv_2",
      messageId: "msg_beta_new",
      message: messageFixture("row_beta_new", "msg_beta_new", "Beta 新消息", "2026-07-06T07:17:37.000Z"),
      conversation: {
        id: "conv_2",
        peerWxid: "wxid_beta",
        type: "private",
        platformRemark: "Beta 客户",
        lastMessageText: "Beta 新消息",
        lastMessageAt: "2026-07-06T07:17:37.000Z",
        status: "active",
      },
    });

    expect(await screen.findByText("Beta 新消息")).toBeInTheDocument();
    expect(await screen.findByLabelText("Beta 客户 1 条未读消息")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开会话 Beta 客户" }));

    await screen.findByRole("heading", { name: "Beta 客户" });
    expect(screen.queryByLabelText("Beta 客户 1 条未读消息")).not.toBeInTheDocument();
  });
});
