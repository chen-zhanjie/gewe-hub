import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWorkbenchPage } from "./WorkbenchPage.test-utils";

describe("WorkbenchPage HTML composer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("HTML 表单支持直接发送 HTML 内容并返回 type=html 请求", async () => {
    const fetchMock = mockFetch({
      ...workbenchRoutes(),
      "/api/send": {
        success: true,
        messageId: "msg_html",
        url: "https://gewehub.yunzxu.com/h/html_token",
      },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.click(screen.getByRole("button", { name: "HTML" }));
    const dialog = await screen.findByRole("dialog", { name: "发送 HTML" });
    fireEvent.change(within(dialog).getByLabelText("HTML 标题"), { target: { value: "日报" } });
    fireEvent.change(within(dialog).getByLabelText("HTML 描述"), { target: { value: "今日 AI 日报" } });
    fireEvent.change(within(dialog).getByLabelText("HTML 缩略图 URL"), { target: { value: "https://example.com/cover.jpg" } });
    fireEvent.change(within(dialog).getByLabelText("HTML 内容"), {
      target: { value: "<!doctype html><html><body>日报</body></html>" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "发送 HTML" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "html",
            title: "日报",
            desc: "今日 AI 日报",
            thumbUrl: "https://example.com/cover.jpg",
            htmlContent: "<!doctype html><html><body>日报</body></html>",
          }),
          credentials: "include",
        }),
      ),
    );
  });

  it("HTML 表单支持选择本地 html 文件并发送 base64 内容", async () => {
    const fetchMock = mockFetch({
      ...workbenchRoutes(),
      "/api/send": {
        success: true,
        messageId: "msg_html_file",
        url: "https://gewehub.yunzxu.com/h/html_file",
      },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.click(screen.getByRole("button", { name: "HTML" }));
    const dialog = await screen.findByRole("dialog", { name: "发送 HTML" });
    fireEvent.click(within(dialog).getByRole("button", { name: "文件" }));
    fireEvent.change(within(dialog).getByLabelText("HTML 标题"), { target: { value: "文件报告" } });
    fireEvent.change(within(dialog).getByLabelText("HTML 描述"), { target: { value: "由本地文件发送" } });
    const htmlFile = new File(["<!doctype html><html>file</html>"], "report.html", { type: "text/html" });
    fireEvent.change(within(dialog).getByLabelText("上传 HTML 文件"), { target: { files: [htmlFile] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "发送 HTML" }));

    await waitFor(() => {
      const sendCall = fetchMock.mock.calls.find(([input]) => String(input).replace("http://localhost", "") === "/api/send");
      expect(sendCall).toBeTruthy();
      const [, init] = sendCall!;
      expect(JSON.parse(String(init?.body))).toEqual({
        conversationId: "conv_1",
        type: "html",
        title: "文件报告",
        desc: "由本地文件发送",
        htmlContentBase64: "PCFkb2N0eXBlIGh0bWw+PGh0bWw+ZmlsZTwvaHRtbD4=",
        htmlFileName: "report.html",
      });
    });
  });

  it("HTML 表单支持发送已有公网 URL，仍使用 type=html", async () => {
    const fetchMock = mockFetch({
      ...workbenchRoutes(),
      "/api/send": {
        success: true,
        messageId: "msg_html_url",
        url: "https://example.com/report.html",
      },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.click(screen.getByRole("button", { name: "HTML" }));
    const dialog = await screen.findByRole("dialog", { name: "发送 HTML" });
    fireEvent.click(within(dialog).getByRole("button", { name: "URL" }));
    fireEvent.change(within(dialog).getByLabelText("HTML 标题"), { target: { value: "外部页面" } });
    fireEvent.change(within(dialog).getByLabelText("HTML 描述"), { target: { value: "外部托管" } });
    fireEvent.change(within(dialog).getByLabelText("HTML 地址"), { target: { value: "https://example.com/report.html" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "发送 HTML" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "html",
            title: "外部页面",
            desc: "外部托管",
            linkUrl: "https://example.com/report.html",
          }),
          credentials: "include",
        }),
      ),
    );
  });
});

function workbenchRoutes() {
  return {
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
  };
}
