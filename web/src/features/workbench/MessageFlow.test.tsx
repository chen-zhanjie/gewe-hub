import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageFlow";
import type { MessageItem } from "@/lib/workspace-data";

describe("MessageBubble", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("消息气泡为浮动操作区预留固定宽度", () => {
    const { container } = render(
      <MessageBubble
        message={buildSelfMessage("2026-07-07T09:59:00.000Z")}
        startsGroup
        onShowDetail={() => undefined}
        onOpenContact={() => undefined}
        onRetryLocalSend={() => undefined}
        onDeleteLocalSend={() => undefined}
        onRequestRevoke={() => undefined}
        onDispatchHeldMessage={() => undefined}
        onQuoteMessage={() => undefined}
      />,
    );

    const bubble = container.querySelector(".message-bubble");
    expect(bubble).toHaveClass("max-w-[calc(100%_-_200px)]", "min-w-0");
  });

  it("2 分钟撤回窗口到期后自动隐藏撤回按钮", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T10:00:00.000Z"));
    const message = buildSelfMessage(new Date(Date.now() - 119_500).toISOString());

    render(
      <MessageBubble
        message={message}
        startsGroup
        onShowDetail={() => undefined}
        onOpenContact={() => undefined}
        onRetryLocalSend={() => undefined}
        onDeleteLocalSend={() => undefined}
        onRequestRevoke={() => undefined}
        onDispatchHeldMessage={() => undefined}
        onQuoteMessage={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "撤回消息 msg_recent" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.queryByRole("button", { name: "撤回消息 msg_recent" })).not.toBeInTheDocument();
  });

  it("本地发送 pending 时禁用删除等重复操作", () => {
    render(
      <MessageBubble
        message={{
          ...buildSelfMessage("2026-07-07T09:59:00.000Z"),
          localSend: {
            conversationId: "conv_1",
            type: "text",
            text: "发送中消息",
            label: "发送中消息",
            status: "pending",
            sendRequestId: null,
          },
        }}
        startsGroup
        onShowDetail={() => undefined}
        onOpenContact={() => undefined}
        onRetryLocalSend={() => undefined}
        onDeleteLocalSend={() => undefined}
        onRequestRevoke={() => undefined}
        onDispatchHeldMessage={() => undefined}
        onQuoteMessage={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "删除未发送消息 发送中消息" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "重试发送 发送中消息" })).not.toBeInTheDocument();
  });

  it.each([
    ["discard", "未发送"],
    ["confirm", "待确认"],
  ] as const)("%s held 消息显示 %s 并允许人工发送", (deliveryMode, label) => {
    const onDispatchHeldMessage = vi.fn();
    const { container } = render(
      <MessageBubble
        message={{
          ...buildSelfMessage("2026-07-07T09:59:00.000Z"),
          isSent: false,
          sendRequest: { id: "send_recent", status: "held", deliveryMode },
        }}
        startsGroup
        onShowDetail={() => undefined}
        onOpenContact={() => undefined}
        onRetryLocalSend={() => undefined}
        onDeleteLocalSend={() => undefined}
        onRequestRevoke={() => undefined}
        onDispatchHeldMessage={onDispatchHeldMessage}
        onQuoteMessage={() => undefined}
      />,
    );

    const messageFrame = container.querySelector('[data-message-content-shell="true"] > div');
    expect(container.querySelector('[data-message-sent="false"]')).toHaveClass("opacity-60");
    expect(messageFrame).toHaveClass("border-dashed");
    if (deliveryMode === "confirm") {
      expect(messageFrame).toHaveClass("border-amber-400", "bg-amber-50", "text-amber-950");
    } else {
      expect(messageFrame).not.toHaveClass("border-amber-400", "bg-amber-50", "text-amber-950");
    }
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤回消息 msg_recent" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "发送消息 msg_recent" }));
    expect(onDispatchHeldMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "row_recent" }));
  });

  it("旧 held 消息缺少 deliveryMode 时安全降级为待确认", () => {
    render(
      <MessageBubble
        message={{
          ...buildSelfMessage("2026-07-07T09:59:00.000Z"),
          isSent: false,
          sendRequest: { id: "send_recent", status: "held" },
        }}
        startsGroup
        onShowDetail={() => undefined}
        onOpenContact={() => undefined}
        onRetryLocalSend={() => undefined}
        onDeleteLocalSend={() => undefined}
        onRequestRevoke={() => undefined}
        onDispatchHeldMessage={() => undefined}
        onQuoteMessage={() => undefined}
      />,
    );

    expect(screen.getByText("待确认")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息 msg_recent" })).toBeEnabled();
  });

  it("已提交 dispatch 但尚未实际发送的消息保持虚线样式并禁用重复发送", () => {
    const { container } = render(
      <MessageBubble
        message={{
          ...buildSelfMessage("2026-07-07T09:59:00.000Z"),
          isSent: false,
          sendRequest: { id: "send_pending", status: "pending" },
        }}
        startsGroup
        onShowDetail={() => undefined}
        onOpenContact={() => undefined}
        onRetryLocalSend={() => undefined}
        onDeleteLocalSend={() => undefined}
        onRequestRevoke={() => undefined}
        onDispatchHeldMessage={() => undefined}
        onQuoteMessage={() => undefined}
      />,
    );

    expect(container.querySelector('[data-message-sent="false"]')).toHaveClass("opacity-60");
    expect(container.querySelector('[data-message-content-shell="true"] > div')).toHaveClass("border-dashed");
    expect(screen.getAllByText("发送中").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "发送消息 msg_recent" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "撤回消息 msg_recent" })).not.toBeInTheDocument();
  });

});

function buildSelfMessage(sentAtIso: string): MessageItem {
  return {
    id: "row_recent",
    messageId: "msg_recent",
    sendRequestId: "send_recent",
    senderName: "客服主号",
    senderProfile: {
      wxid: "wxid_bot",
      nickname: "客服主号",
      status: "active",
    },
    isSelf: true,
    sentAt: "18:00",
    sentAtIso,
    status: "normal",
    revokedAtIso: null,
    content: { type: "text", text: "刚发出的消息" },
    standardJson: {},
    rawPayload: null,
    deliveries: [],
  };
}
