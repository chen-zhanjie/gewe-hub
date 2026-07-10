import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, mockResponseForRoute, renderWorkbenchPage } from "./WorkbenchPage.test-utils";

const baseRoutes = {
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

function createTextFile(name: string) {
  return new File([new Uint8Array([72, 101, 108, 108, 111])], name, { type: "text/plain" });
}

describe("WorkbenchPage local send status", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("选择图片文件后立即在聊天区展示发送中占位", async () => {
    let resolveSend: (value: Response) => void = () => undefined;
    const sendPromise = new Promise<Response>((resolve) => {
      resolveSend = resolve;
    });
    const fetchMock = mockFetch(baseRoutes);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/send" && init?.method === "POST") return sendPromise;
      return mockResponseForRoute(path, baseRoutes);
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    const imageInput = screen.getByLabelText("选择图片文件") as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "slow-image.png", { type: "image/png" });
    let resolveRead: (value: ArrayBuffer) => void = () => undefined;
    const readPromise = new Promise<ArrayBuffer>((resolve) => {
      resolveRead = resolve;
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(() => readPromise),
    });
    fireEvent.change(imageInput, { target: { files: [file] } });

    expect(await screen.findByText("图片加载中")).toBeInTheDocument();
    expect(screen.getByText("发送中")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).replace("http://localhost", "") === "/api/send")).toBe(
      false,
    );

    resolveRead(new Uint8Array([137, 80, 78, 71]).buffer);
    resolveSend(jsonResponse({ success: true, messageId: "msg_image_sent", accepted: true }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "image",
            contentBase64: "iVBORw==",
            mimeType: "image/png",
            fileName: "slow-image.png",
          }),
          credentials: "include",
        }),
      ),
    );
  });

  it("文件发送失败后在原气泡左侧显示感叹号，点击后复用原气泡重试", async () => {
    const fetchMock = mockFetch(baseRoutes);
    let sendAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/send" && init?.method === "POST") {
        sendAttempts += 1;
        if (sendAttempts === 1) return jsonResponse({ error: { message: "文件上传失败" } }, 502);
        return jsonResponse({ success: true, messageId: "msg_file_retry", accepted: true });
      }
      return mockResponseForRoute(path, baseRoutes);
    });

    const { container } = renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.change(screen.getByLabelText("选择文件"), { target: { files: [createTextFile("retry-note.txt")] } });

    expect(await screen.findByText("发送失败")).toBeInTheDocument();
    expect(screen.getByText("文件上传失败")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-local-send-status="failed"]')).toHaveLength(1);
    const retryButton = screen.getByRole("button", { name: "重试发送 [文件] retry-note.txt" });
    expect(retryButton).toHaveAttribute("data-local-send-retry-position", "left");

    fireEvent.click(retryButton);

    await waitFor(() => expect(sendAttempts).toBe(2));
    expect(container.querySelectorAll('[data-local-send-status="pending"]')).toHaveLength(1);
    expect(screen.getByText("发送中")).toBeInTheDocument();
  });

  it("文件发送返回 unknown 结果时保留失败气泡，且不轮询旧 sendRequest 状态", async () => {
    const fetchMock = mockFetch(baseRoutes);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/send" && init?.method === "POST") {
        return jsonResponse({ success: false, accepted: false });
      }
      return mockResponseForRoute(path, baseRoutes);
    });

    const { container } = renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.change(screen.getByLabelText("选择文件"), { target: { files: [createTextFile("unknown-note.txt")] } });

    expect(await screen.findByText("发送失败")).toBeInTheDocument();
    expect(screen.getByText("发送结果未知")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-local-send-status="failed"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "重试发送 [文件] unknown-note.txt" })).toBeEnabled();
    expect(fetchMock.mock.calls.some(([request]) => String(request).includes("/api/send-requests/"))).toBe(false);
  });
});
