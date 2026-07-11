import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileHtmlPagesPage } from "./MobileHtmlPagesPage";
import { MobileObservabilityPage } from "./MobileObservabilityPage";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("MobileHtmlPagesPage", () => {
  it("支持状态筛选、搜索、公开链接、复制、发送详情和归档", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith("/api/html-pages?")) return response([{
        id: "html-1", title: "日报", desc: "今日 AI 日报", publicUrl: "https://example.com/h/token", sizeBytes: 42,
        status: "active", createdAt: "2026-07-11T10:00:00Z", conversation: { platformRemark: "客户群" }, app: { name: "助手" }, sendRequest: { id: "send-1", status: "sent" },
      }]);
      if (path === "/api/html-pages/html-1/archive" && init?.method === "POST") return response({ id: "html-1", status: "archived" });
      return response({ error: { message: `not found ${path}` } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onOpenSendRequest = vi.fn();
    renderWithClient(<MobileHtmlPagesPage onOpenSendRequest={onOpenSendRequest} />);

    expect(await screen.findByText("日报")).toBeInTheDocument();
    expect(screen.getByText("今日 AI 日报")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开公网页面 日报" })).toHaveAttribute("href", "https://example.com/h/token");
    fireEvent.click(screen.getByRole("button", { name: "复制公网链接 日报" }));
    expect(writeText).toHaveBeenCalledWith("https://example.com/h/token");
    fireEvent.click(screen.getByRole("button", { name: "查看发送详情 send-1" }));
    expect(onOpenSendRequest).toHaveBeenCalledWith("send-1");

    fireEvent.change(screen.getByLabelText("HTML 页面状态"), { target: { value: "active" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("status=active"), expect.anything()));
    fireEvent.change(screen.getByPlaceholderText("搜索 HTML 页面"), { target: { value: "不存在" } });
    expect(screen.getByText("无匹配 HTML 页面")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索 HTML 页面"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "归档 日报" }));
    const confirm = screen.getByRole("alertdialog", { name: "归档 HTML 页面" });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认归档" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/html-pages/html-1/archive", expect.objectContaining({ method: "POST" })));
  });
});

describe("MobileObservabilityPage", () => {
  it("展示健康摘要和四项指标，支持失败任务搜索、详情与重试", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/observability/summary") return response({ webhook24h: 128, failedTasks: 1, deliveryBacklog: 3, accounts: [{ onlineStatus: "online", _count: 2 }, { onlineStatus: "offline", _count: 1 }] });
      if (path === "/api/outbox/tasks") return response([{ id: "task-1", refId: "ref-1", taskType: "sync_contacts", status: "failed", lastError: "网络失败", retryCount: 2, payload: { accountId: "acc-1" } }]);
      if (path === "/api/outbox/tasks/task-1/retry" && init?.method === "POST") return response({ ok: true });
      return response({ error: { message: `not found ${path}` } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithClient(<MobileObservabilityPage />);

    expect(await screen.findByText("系统异常")).toBeInTheDocument();
    expect(screen.getByText("Webhook 24h")).toBeInTheDocument();
    expect(screen.getByText("失败任务")).toBeInTheDocument();
    expect(screen.getByText("投递积压")).toBeInTheDocument();
    expect(screen.getByText("账号在线")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索失败任务"), { target: { value: "task-1" } });
    fireEvent.click(await screen.findByRole("button", { name: "查看任务 task-1" }));

    expect(screen.getByRole("heading", { name: "任务详情" })).toBeInTheDocument();
    expect(screen.getByText("网络失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试任务" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/outbox/tasks/task-1/retry", expect.objectContaining({ method: "POST" })));
  });
});
