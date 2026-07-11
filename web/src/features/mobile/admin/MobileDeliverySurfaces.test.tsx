import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render } from "@/features/admin/AdminPages.test-utils";
import { MobileDeliveriesPage } from "./MobileDeliveriesPage";
import { MobileSendRequestsPage } from "./MobileSendRequestsPage";

const delivery = {
  eventId: "evt_1",
  eventType: "message.created",
  status: "failed",
  attempts: 3,
  lastError: "签名校验失败",
  updatedAt: "2026-07-06T07:16:37.000Z",
  payload: { event: "message.created" },
  app: { name: "Hermes" },
  message: {
    messageId: "msg_1",
    renderedText: "你好",
    conversation: { id: "conv_1", platformRemark: "陈可乐", name: null, peerWxid: "wxid_target" },
  },
};

const sentRequest = {
  id: "send_1",
  type: "image",
  deliveryMode: "confirm",
  status: "sent",
  updatedAt: "2026-07-06T07:16:37.000Z",
  message: { messageId: "msg_stable_1" },
  conversation: { platformRemark: "陈可乐", name: null, peerWxid: "wxid_target" },
  requestPayload: { fileName: "hello.png" },
  geweRequest: { api: "postImage" },
  geweResponse: { ret: 0, msg: "ok" },
};

describe("移动端推送日志与发送记录", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("推送日志以卡片展示并保留状态、搜索、刷新、分页和 messageId 定位", async () => {
    const onFiltersChange = vi.fn();
    const fetchMock = mockFetch({
      "/api/deliveries?take=1&skip=0&status=failed&messageId=msg_1": [delivery],
      "/api/deliveries?take=1&skip=0&status=success&messageId=msg_1": [delivery],
      "/api/deliveries?take=1&skip=1&status=success&messageId=msg_1": [],
    });

    render(<MobileDeliveriesPage initialFilters={{ status: "failed", messageId: "msg_1", page: 1, pageSize: 1 }} onFiltersChange={onFiltersChange} />);

    expect(await screen.findByRole("list", { name: "推送日志列表" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("evt_1")).toBeInTheDocument();
    expect(screen.getByText("Hermes")).toBeInTheDocument();
    expect(screen.getByText(/会话 陈可乐/)).toBeInTheDocument();
    expect(screen.getByText("尝试 3 次")).toBeInTheDocument();
    expect(screen.getByText("消息定位：msg_1")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索投递记录"), { target: { value: "不存在" } });
    expect(screen.getByText("没有匹配的投递记录")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索投递记录"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "成功" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "success", page: 1 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("status=success"), expect.anything()));

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
  });

  it("推送日志可打开会话、进入独立详情并确认重投", async () => {
    const onOpenConversation = vi.fn();
    const fetchMock = mockFetch({
      "/api/deliveries?take=20&skip=0&status=failed": [delivery],
      "/api/deliveries/evt_1/retry": {},
    });
    render(<MobileDeliveriesPage onOpenConversation={onOpenConversation} />);

    fireEvent.click(await screen.findByRole("button", { name: "打开会话 陈可乐" }));
    expect(onOpenConversation).toHaveBeenCalledWith("conv_1");

    fireEvent.click(screen.getByRole("button", { name: "查看投递详情 evt_1" }));
    expect(await screen.findByRole("heading", { name: "投递详情" })).toBeInTheDocument();
    expect(screen.getByText("签名校验失败")).toBeInTheDocument();
    expect(screen.getByText("投递 payload")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    fireEvent.click(screen.getByRole("button", { name: "重投 evt_1" }));
    const dialog = await screen.findByRole("alertdialog", { name: "重投投递事件" });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/deliveries/evt_1/retry", expect.objectContaining({ method: "POST" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "确认重投" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/deliveries/evt_1/retry", expect.objectContaining({ method: "POST" })));
  });

  it("发送记录以卡片展示并保留状态筛选、搜索、分页与详情", async () => {
    const onFiltersChange = vi.fn();
    const fetchMock = mockFetch({
      "/api/send-requests?take=20&skip=0": [sentRequest],
      "/api/send-requests?take=20&skip=0&status=unknown": [sentRequest],
      "/api/send-requests/send_1": sentRequest,
    });
    render(<MobileSendRequestsPage onFiltersChange={onFiltersChange} />);

    expect(await screen.findByRole("list", { name: "发送记录列表" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("send_1")).toBeInTheDocument();
    expect(screen.getByText("image · confirm")).toBeInTheDocument();
    expect(screen.getByText("结果 msg_stable_1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "结果未知" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "unknown", page: 1 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("status=unknown"), expect.anything()));

    fireEvent.click(screen.getByRole("button", { name: "查看发送详情 send_1" }));
    expect(await screen.findByRole("heading", { name: "发送详情" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/send-requests/send_1", expect.anything()));
    expect(screen.getByText("请求 payload")).toBeInTheDocument();
    expect(screen.getByText("GeWe 请求")).toBeInTheDocument();
    expect(screen.getByText("GeWe 响应")).toBeInTheDocument();
  });

  it("发送记录撤回已发送消息前需要确认", async () => {
    const fetchMock = mockFetch({
      "/api/send-requests?take=20&skip=0": [sentRequest],
      "/api/messages/msg_stable_1/revoke": {},
    });
    render(<MobileSendRequestsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "撤回 send_1" }));
    const dialog = await screen.findByRole("alertdialog", { name: "撤回发送消息" });
    expect(within(dialog).getByText("msg_stable_1")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认撤回" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/messages/msg_stable_1/revoke", expect.objectContaining({ method: "POST" })));
  });

  it("发送记录仅允许现有状态取消重试，并在执行前确认", async () => {
    const failedRequest = { ...sentRequest, id: "send_failed", status: "failed", message: null };
    const fetchMock = mockFetch({
      "/api/send-requests?take=20&skip=0": [failedRequest],
      "/api/send/send_failed/cancel": {},
    });
    render(<MobileSendRequestsPage />);

    expect(await screen.findByRole("button", { name: "撤回 send_failed" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "取消发送重试 send_failed" }));
    const dialog = await screen.findByRole("alertdialog", { name: "取消发送重试" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认取消" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/send/send_failed/cancel", expect.objectContaining({ method: "POST" })));
  });
});
