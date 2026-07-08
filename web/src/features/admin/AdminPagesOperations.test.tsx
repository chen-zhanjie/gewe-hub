import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPages";
import { mockFetch, render } from "./AdminPages.test-utils";

describe("AdminPage operations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("运行观测从 summary 和 outbox API 加载真实指标", async () => {
    mockFetch({
      "/api/observability/summary": {
        webhook24h: 42,
        deliveryBacklog: 5,
        failedTasks: 2,
        accounts: [{ onlineStatus: "online", _count: 1 }],
      },
      "/api/outbox/tasks": [
        {
          id: "task_real_dead",
          taskType: "deliver",
          refId: "del_real_1",
          status: "dead",
          lastError: "真实投递失败",
        },
      ],
    });

    render(<AdminPage page="observability" />);

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "失败任务列表" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索失败任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByText("task_real_dead")).toBeInTheDocument();
    expect(screen.getByText("真实投递失败")).toBeInTheDocument();
    expect(screen.queryByText("task_901")).not.toBeInTheDocument();
  });

  it("运行观测顶部健康摘要第一眼说明异常原因和正常状态", async () => {
    mockFetch({
      "/api/observability/summary": {
        webhook24h: 42,
        deliveryBacklog: 5,
        failedTasks: 2,
        accounts: [
          { onlineStatus: "online", _count: 1 },
          { onlineStatus: "offline", _count: 1 },
        ],
      },
      "/api/outbox/tasks": [],
    });

    const { unmount } = render(<AdminPage page="observability" />);

    const healthAlert = await screen.findByRole("status", { name: "运行健康摘要" });
    expect(healthAlert).toHaveTextContent("系统异常");
    expect(healthAlert).toHaveTextContent("2 个失败任务");
    expect(healthAlert).toHaveTextContent("5 条投递积压");
    expect(healthAlert).toHaveTextContent("1 个账号离线");

    unmount();
    vi.unstubAllGlobals();
    mockFetch({
      "/api/observability/summary": {
        webhook24h: 42,
        deliveryBacklog: 0,
        failedTasks: 0,
        accounts: [{ onlineStatus: "online", _count: 2 }],
      },
      "/api/outbox/tasks": [],
    });

    render(<AdminPage page="observability" />);

    const healthyAlert = await screen.findByRole("status", { name: "运行健康摘要" });
    expect(healthyAlert).toHaveTextContent("系统正常");
    expect(healthyAlert).toHaveTextContent("无失败任务、无投递积压，账号全部在线");
  });

  it("运行观测失败任务可以查看详情，重试前需要二次确认", async () => {
    const fetchMock = mockFetch({
      "/api/observability/summary": {
        webhook24h: 42,
        deliveryBacklog: 5,
        failedTasks: 1,
        accounts: [{ onlineStatus: "online", _count: 1 }],
      },
      "/api/outbox/tasks": [
        {
          id: "task_retry_dead",
          taskType: "send",
          refId: "send_failed_1",
          status: "dead",
          lastError: "真实发送失败",
          retryCount: 5,
          nextRetryAt: "2026-07-06T07:21:37.000Z",
          payload: { conversationId: "conv_1", type: "text" },
        },
      ],
      "/api/outbox/tasks/task_retry_dead/retry": {
        id: "task_retry_dead",
        status: "pending",
      },
    });

    render(<AdminPage page="observability" />);

    expect(await screen.findByText("task_retry_dead")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看任务详情" }));
    const detailSheet = await screen.findByRole("dialog", { name: "任务详情" });
    expect(within(detailSheet).getAllByText("task_retry_dead").length).toBeGreaterThan(0);
    expect(within(detailSheet).getByText("send")).toBeInTheDocument();
    expect(within(detailSheet).getByText("send_failed_1")).toBeInTheDocument();
    expect(within(detailSheet).getByText("真实发送失败")).toBeInTheDocument();
    expect(within(detailSheet).getByText("任务 payload")).toBeInTheDocument();
    expect(within(detailSheet).getByText("conversationId")).toBeInTheDocument();

    fireEvent.click(within(detailSheet).getByRole("button", { name: "重试任务" }));
    const confirmDialog = await screen.findByRole("alertdialog", { name: "重试任务" });
    expect(within(confirmDialog).getByText("重试会将失败任务重新置为 pending，并由 worker 再次执行。")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("task_retry_dead")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/outbox/tasks/task_retry_dead/retry",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(within(confirmDialog).getByRole("button", { name: "确认重试" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/outbox/tasks/task_retry_dead/retry",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/outbox/tasks")).toHaveLength(2);
  });

  it("发送记录页撤回已发送请求前需要二次确认", async () => {
    const fetchMock = mockFetch({
      "/api/send-requests?take=20&skip=0": [
        {
          id: "send_real_1",
          type: "text",
          status: "sent",
          resultMsgId: "769533801",
          resultNewMsgId: "5271007655758710001",
          updatedAt: "2026-07-06T07:16:37.000Z",
          conversation: {
            platformRemark: "陈可乐",
            name: null,
            peerWxid: "wxid_target",
          },
          geweResponse: { ret: 200, msg: "发送成功" },
        },
      ],
      "/api/send/send_real_1/revoke": { id: "send_real_1", status: "sent", geweResponse: { revoke: { ret: 200 } } },
    });

    window.history.replaceState(null, "", "/send-requests");
    render(<AdminPage page="sendRequests" />);

    const table = await screen.findByRole("table", { name: "发送记录列表" });
    expect(within(table).getByText("send_real_1")).toBeInTheDocument();
    expect(within(table).getByText("wxid_target")).toBeInTheDocument();
    expect(within(table).getByLabelText("陈可乐")).toHaveClass("size-6");
    const updatedAt = within(table).getByText("07-06 15:16");
    expect(updatedAt.tagName.toLowerCase()).toBe("time");
    expect(updatedAt).toHaveAttribute("datetime", "2026-07-06T07:16:37.000Z");
    expect(updatedAt).toHaveAttribute("title", "2026-07-06 15:16:37");
    expect(screen.getByPlaceholderText("搜索发送记录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "发送记录状态" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部 1" })).toBeInTheDocument();
    expect(screen.queryByLabelText("发送状态筛选")).not.toBeInTheDocument();
    expect(screen.getByLabelText("每页数量")).toHaveValue("20");
    fireEvent.click(within(table).getByRole("button", { name: "撤回" }));

    const confirmDialog = await screen.findByRole("alertdialog", { name: "撤回发送消息" });
    expect(within(confirmDialog).getByText("撤回后将调用 GeWe 撤回接口，微信侧消息会尝试显示为已撤回。")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("send_real_1")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("陈可乐")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/send/send_real_1/revoke",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(within(confirmDialog).getByRole("button", { name: "确认撤回" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send/send_real_1/revoke",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/send-requests?take=20&skip=0")).toHaveLength(2);
  });

  it("发送记录页可以取消失败或等待中的发送请求，阻止后续自动重试", async () => {
    const fetchMock = mockFetch({
      "/api/send-requests?take=20&skip=0": [
        {
          id: "send_failed_file",
          type: "file",
          status: "failed",
          resultMsgId: null,
          resultNewMsgId: null,
          updatedAt: "2026-07-06T07:16:37.000Z",
          conversation: {
            platformRemark: "陈可乐",
            name: null,
            peerWxid: "wxid_target",
          },
          geweResponse: { ret: 500, msg: "展示失败但微信可能已收到" },
        },
      ],
      "/api/send/send_failed_file/cancel": {
        id: "send_failed_file",
        status: "failed",
        errorMessage: "用户已取消后续发送重试",
      },
    });

    window.history.replaceState(null, "", "/send-requests");
    render(<AdminPage page="sendRequests" />);

    const table = await screen.findByRole("table", { name: "发送记录列表" });
    expect(within(table).getByText("send_failed_file")).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: "取消发送重试" }));

    const confirmDialog = await screen.findByRole("alertdialog", { name: "取消发送重试" });
    expect(within(confirmDialog).getByText("取消后会终止关联发送任务，避免同一文件或图片继续重复发送。")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("send_failed_file")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/send/send_failed_file/cancel",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(within(confirmDialog).getByRole("button", { name: "确认取消" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send/send_failed_file/cancel",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/send-requests?take=20&skip=0")).toHaveLength(2);
  });

  it("发送记录页可以打开单条详情查看请求和 GeWe 响应", async () => {
    const fetchMock = mockFetch({
      "/api/send-requests?take=20&skip=0": [
        {
          id: "send_detail_1",
          type: "image",
          status: "sent",
          resultMsgId: "769533801",
          resultNewMsgId: "5271007655758710001",
          updatedAt: "2026-07-06T07:16:37.000Z",
          conversation: {
            platformRemark: "陈可乐",
            name: null,
            peerWxid: "wxid_target",
          },
        },
      ],
      "/api/send-requests/send_detail_1": {
        id: "send_detail_1",
        type: "image",
        status: "sent",
        resultMsgId: "769533801",
        resultNewMsgId: "5271007655758710001",
        updatedAt: "2026-07-06T07:16:37.000Z",
        requestPayload: { type: "image", fileName: "真实图片.png" },
        geweRequest: { api: "postImage", imageUrl: "http://media.local/a.png" },
        geweResponse: { ret: 200, msg: "发送成功", newMsgId: "5271007655758710001" },
        conversation: {
          platformRemark: "陈可乐",
          name: null,
          peerWxid: "wxid_target",
        },
      },
    });

    window.history.replaceState(null, "", "/send-requests");
    render(<AdminPage page="sendRequests" />);

    const table = await screen.findByRole("table", { name: "发送记录列表" });
    fireEvent.click(within(table).getByRole("button", { name: "查看详情" }));

    const detailDialog = await screen.findByRole("dialog", { name: "发送详情" });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send-requests/send_detail_1",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(detailDialog).toHaveClass("inset-y-0");
    expect(detailDialog).toHaveClass("right-0");
    expect(within(detailDialog).getAllByText("send_detail_1").length).toBeGreaterThan(0);
    expect(within(detailDialog).getByText("陈可乐")).toBeInTheDocument();
    expect(within(detailDialog).getByText("请求 payload")).toBeInTheDocument();
    expect(within(detailDialog).getByText("GeWe 请求")).toBeInTheDocument();
    expect(within(detailDialog).getByText("GeWe 响应")).toBeInTheDocument();
    expect(within(detailDialog).getByText("真实图片.png")).toBeInTheDocument();
    expect(within(detailDialog).getByText("postImage")).toBeInTheDocument();
    expect(within(detailDialog).getByText("发送成功")).toBeInTheDocument();
  });

  it("发送记录支持状态筛选、分页请求并同步 URL", async () => {
    const fetchMock = mockFetch({
      "/api/send-requests?take=20&skip=20&status=failed": [
        {
          id: "send_failed_page_2",
          type: "voice",
          status: "failed",
          resultMsgId: null,
          resultNewMsgId: null,
          updatedAt: "2026-07-06T07:18:37.000Z",
          conversation: {
            platformRemark: "陈可乐",
            name: null,
            peerWxid: "wxid_target",
          },
          geweResponse: { ret: 500, msg: "发送失败" },
        },
      ],
      "/api/send-requests?take=20&skip=0&status=success": [
        {
          id: "send_sent_1",
          type: "text",
          status: "sent",
          resultMsgId: "769533801",
          resultNewMsgId: "5271007655758710001",
          updatedAt: "2026-07-06T07:19:37.000Z",
          conversation: {
            platformRemark: "陈可乐",
            name: null,
            peerWxid: "wxid_target",
          },
          geweResponse: { ret: 200, msg: "发送成功" },
        },
        ...Array.from({ length: 19 }, (_, index) => ({
          id: `send_sent_extra_${index}`,
          type: "text",
          status: "sent",
          resultMsgId: `msg_${index}`,
          resultNewMsgId: `new_${index}`,
          updatedAt: "2026-07-06T07:19:37.000Z",
          conversation: {
            platformRemark: "陈可乐",
            name: null,
            peerWxid: "wxid_target",
          },
          geweResponse: { ret: 200, msg: "发送成功" },
        })),
      ],
      "/api/send-requests?take=20&skip=20&status=success": [
        {
          id: "send_sent_page_2",
          type: "image",
          status: "sent",
          resultMsgId: "769533802",
          resultNewMsgId: "5271007655758710002",
          updatedAt: "2026-07-06T07:20:37.000Z",
          conversation: {
            platformRemark: "陈可乐",
            name: null,
            peerWxid: "wxid_target",
          },
          geweResponse: { ret: 200, msg: "发送成功" },
        },
      ],
      "/api/send-requests?take=50&skip=0&status=success": [
        {
          id: "send_sent_50",
          type: "text",
          status: "sent",
          resultMsgId: "769533803",
          resultNewMsgId: "5271007655758710003",
          updatedAt: "2026-07-06T07:21:37.000Z",
          conversation: {
            platformRemark: "陈可乐",
            name: null,
            peerWxid: "wxid_target",
          },
          geweResponse: { ret: 200, msg: "发送成功" },
        },
      ],
    });

    const sendRequestFilterChange = vi.fn();
    render(
      <AdminPage
        page="sendRequests"
        sendRequestFilters={{ status: "failed", page: 2, pageSize: 20 }}
        onSendRequestFiltersChange={sendRequestFilterChange}
      />,
    );

    expect(await screen.findByText("send_failed_page_2")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/send-requests?take=20&skip=20&status=failed",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "成功 0" }));

    expect(await screen.findByText("send_sent_1")).toBeInTheDocument();
    expect(sendRequestFilterChange).toHaveBeenLastCalledWith({ status: "success", page: 1, pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/send-requests?take=20&skip=0&status=success",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(await screen.findByText("send_sent_page_2")).toBeInTheDocument();
    expect(sendRequestFilterChange).toHaveBeenLastCalledWith({ status: "success", page: 2, pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/send-requests?take=20&skip=20&status=success",
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.change(screen.getByLabelText("每页数量"), { target: { value: "50" } });

    expect(await screen.findByText("send_sent_50")).toBeInTheDocument();
    expect(sendRequestFilterChange).toHaveBeenLastCalledWith({ status: "success", page: 1, pageSize: 50 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/send-requests?take=50&skip=0&status=success",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
