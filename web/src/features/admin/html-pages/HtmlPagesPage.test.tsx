import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "../AdminPages";
import { mockFetch, render } from "../AdminPages.test-utils";

describe("HtmlPagesPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("从 /api/html-pages 加载托管页面并支持归档", async () => {
    const fetchMock = mockFetch({
      "/api/html-pages?take=20&skip=0": [
        {
          id: "html_1",
          title: "日报",
          desc: "今日 AI 日报",
          publicUrl: "https://gewehub.yunzxu.com/h/html_token",
          status: "active",
          createdAt: "2026-07-08T07:16:37.000Z",
          account: { nickname: "客服主号", wxid: "wxid_bot" },
          conversation: { platformRemark: "陈可乐", name: null, peerWxid: "wxid_target" },
          app: { name: "Hermes 助手" },
          sendRequest: { id: "send_html_1", status: "sent" },
        },
      ],
      "/api/html-pages/html_1/archive": { id: "html_1", status: "archived" },
    });

    render(<AdminPage page={"htmlPages" as never} />);

    const table = await screen.findByRole("table", { name: "HTML 页面列表" });
    expect(within(table).getByText("html_1")).toBeInTheDocument();
    expect(within(table).getByText("日报")).toBeInTheDocument();
    expect(within(table).getByText("今日 AI 日报")).toBeInTheDocument();
    expect(within(table).getByText("陈可乐")).toBeInTheDocument();
    expect(within(table).getByText("Hermes 助手")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索 HTML 页面")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();

    const openLink = within(table).getByRole("link", { name: "打开公网页面 日报" });
    expect(openLink).toHaveAttribute("href", "https://gewehub.yunzxu.com/h/html_token");
    expect(openLink).toHaveAttribute("target", "_blank");

    fireEvent.click(within(table).getByRole("button", { name: "归档" }));
    const confirmDialog = await screen.findByRole("alertdialog", { name: "归档 HTML 页面" });
    expect(within(confirmDialog).getByText("html_1")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("归档后公开访问入口会停止返回页面内容。")).toBeInTheDocument();

    fireEvent.click(within(confirmDialog).getByRole("button", { name: "确认归档" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/html-pages/html_1/archive",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/html-pages?take=20&skip=0")).toHaveLength(2);
  });
});
