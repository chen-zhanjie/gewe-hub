import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jsonResponse,
  messageFixture,
  mockFetch,
  mockResponseForRoute,
  renderWorkbenchPage,
} from "./WorkbenchPage.test-utils";

describe("WorkbenchPage send response", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("使用成功响应的稳定 messageId 替换本地气泡，并按服务端 sentAt 重新排序", async () => {
    let messageFetchCount = 0;
    const fetchMock = mockFetch({});
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/accounts") {
        return jsonResponse([{ id: "acc_1", wxid: "wxid_bot", nickname: "客服主号", onlineStatus: "online" }]);
      }
      if (path === "/api/conversations") {
        return jsonResponse([{
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "较晚消息",
          lastMessageAt: "2026-07-06T07:18:37.000Z",
          status: "active",
        }]);
      }
      if (path === "/api/send" && init?.method === "POST") {
        return jsonResponse({ success: true, messageId: "msg_stable_sent", accepted: true });
      }
      if (path === "/api/conversations/conv_1/messages?take=50") {
        messageFetchCount += 1;
        if (messageFetchCount === 1) {
          return jsonResponse([
            messageFixture("row_late", "msg_late", "较晚消息", "2026-07-06T07:18:37.000Z"),
          ]);
        }
        return jsonResponse([
          messageFixture("row_late", "msg_late", "较晚消息", "2026-07-06T07:18:37.000Z"),
          {
            ...messageFixture("row_sent", "msg_stable_sent", "稳定 ID 消息", "2026-07-06T07:17:37.000Z"),
            senderWxid: "wxid_bot",
            isSelf: true,
          },
        ]);
      }
      return mockResponseForRoute(path, {});
    });

    renderWorkbenchPage();

    const input = await screen.findByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行");
    fireEvent.change(input, { target: { value: "稳定 ID 消息" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(messageFetchCount).toBe(2));
    await waitFor(() => expect(screen.queryByText("发送中")).not.toBeInTheDocument());

    const messageRegion = screen.getByLabelText("消息区");
    expect(within(messageRegion).getAllByText("稳定 ID 消息")).toHaveLength(1);
    const texts = within(messageRegion)
      .getAllByText(/稳定 ID 消息|较晚消息/)
      .map((node) => node.textContent);
    expect(texts).toEqual(["稳定 ID 消息", "较晚消息"]);
    expect(fetchMock.mock.calls.some(([request]) => String(request).includes("/api/send/msg_stable_sent"))).toBe(false);
  });

  it("200 unknown 响应不误判为已发送，保留本地失败消息供重试", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [{ id: "acc_1", wxid: "wxid_bot", nickname: "客服主号", onlineStatus: "online" }],
      "/api/conversations": [{
        id: "conv_1",
        peerWxid: "wxid_target",
        type: "private",
        platformRemark: "陈可乐",
        lastMessageText: "旧消息",
        lastMessageAt: "2026-07-06T07:16:37.000Z",
        status: "active",
      }],
      "/api/conversations/conv_1/messages?take=50": [
        messageFixture("row_old", "msg_old", "旧消息", "2026-07-06T07:16:37.000Z"),
      ],
      "/api/send": { success: false, accepted: false },
    });

    renderWorkbenchPage();

    const input = await screen.findByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行");
    fireEvent.change(input, { target: { value: "结果未知消息" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("发送失败")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试发送 结果未知消息" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /查看消息详情/ })).not.toHaveAccessibleName(/结果未知消息/);
    expect(fetchMock.mock.calls.some(([request]) => String(request).includes("/api/send/undefined"))).toBe(false);
  });


});
