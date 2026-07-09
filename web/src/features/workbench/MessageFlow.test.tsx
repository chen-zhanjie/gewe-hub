import { act, render, screen } from "@testing-library/react";
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
        onQuoteMessage={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "撤回消息 msg_recent" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

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
