import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageItem } from "@/lib/workspace-data";
import { MobileMessageDetailPage } from "./MobileMessageDetailPage";

function message(id: string, overrides: Partial<MessageItem> = {}): MessageItem {
  return {
    id,
    messageId: `msg-${id}`,
    senderName: "群成员甲",
    senderProfile: { wxid: "wxid-member", displayName: "群成员甲" },
    isSelf: false,
    sentAt: "2026-07-11 10:00:00",
    sentAtIso: "2026-07-11T10:00:00.000Z",
    status: "normal",
    content: { type: "text", text: `消息 ${id}` },
    standardJson: { id, content: { type: "text" } },
    rawPayload: { raw: id },
    deliveries: [{ eventId: `delivery-${id}`, status: "failed" }],
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("MobileMessageDetailPage", () => {
  it("展示概览并可复制 messageId", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MobileMessageDetailPage message={message("current")} />);

    expect(screen.getByRole("heading", { name: "消息详情" })).toBeInTheDocument();
    expect(screen.getAllByText("msg-current")).toHaveLength(2);
    expect(screen.getByText("群成员甲")).toBeInTheDocument();
    expect(screen.getByText("delivery-current")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复制 messageId" }));
    expect(writeText).toHaveBeenCalledWith("msg-current");
  });

  it("切换标准 JSON、原始 payload 和投递记录", async () => {
    render(<MobileMessageDetailPage message={message("current")} />);

    await activateTab("标准 JSON");
    expect(screen.getByRole("button", { name: "复制标准 JSON" })).toBeInTheDocument();

    await activateTab("原始 payload");
    expect(screen.getByRole("button", { name: "复制原始 payload" })).toBeInTheDocument();

    await activateTab("投递记录");
    expect(screen.getByRole("button", { name: "复制投递记录 JSON" })).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("支持上一条、下一条和跳转推送日志", async () => {
    const messages = [message("previous"), message("current"), message("next")];
    const onSelectMessage = vi.fn();
    const onOpenDeliveryLog = vi.fn();
    render(<MobileMessageDetailPage message={messages[1]} messages={messages} onSelectMessage={onSelectMessage} onOpenDeliveryLog={onOpenDeliveryLog} />);

    fireEvent.click(screen.getByRole("button", { name: "上一条消息" }));
    expect(onSelectMessage).toHaveBeenCalledWith(messages[0]);
    fireEvent.click(screen.getByRole("button", { name: "下一条消息" }));
    expect(onSelectMessage).toHaveBeenCalledWith(messages[2]);

    await activateTab("投递记录");
    const section = screen.getByRole("region", { name: "投递记录详情" });
    fireEvent.click(within(section).getByRole("button", { name: "在推送日志查看 msg-current" }));
    expect(onOpenDeliveryLog).toHaveBeenCalledWith("msg-current");
  });
});

async function activateTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  tab.focus();
  fireEvent.keyDown(tab, { key: "Enter" });
  await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
}
