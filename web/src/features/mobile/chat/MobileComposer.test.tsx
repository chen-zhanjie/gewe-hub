import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PendingAttachment } from "@/features/workbench/MessageComposer";
import { MobileComposer } from "./MobileComposer";

function renderComposer(overrides: Partial<React.ComponentProps<typeof MobileComposer>> = {}) {
  const props: React.ComponentProps<typeof MobileComposer> = {
    selected: true,
    sending: false,
    voiceRecording: false,
    messageText: "",
    pendingAttachments: [],
    mentionCandidates: [],
    activeMentionQuery: null,
    quotedMessageLabel: null,
    sendError: null,
    voiceInputRef: createRef<HTMLInputElement>(),
    imageInputRef: createRef<HTMLInputElement>(),
    fileInputRef: createRef<HTMLInputElement>(),
    onMessageTextChange: vi.fn(),
    onInsertMention: vi.fn(),
    onSendMedia: vi.fn(),
    onVoiceRecord: vi.fn(),
    onRemovePendingAttachment: vi.fn(),
    onClearQuotedMessage: vi.fn(),
    onSendPendingAttachments: vi.fn(),
    onPaste: vi.fn(),
    onSendText: vi.fn(),
    onOpenVideo: vi.fn(),
    onOpenLink: vi.fn(),
    onOpenHtml: vi.fn(),
    ...overrides,
  };
  render(<MobileComposer {...props} />);
  return props;
}

describe("MobileComposer", () => {
  it("发送文本，Enter 换行不误发送", () => {
    const props = renderComposer();
    const input = screen.getByRole("textbox", { name: "消息" });
    fireEvent.change(input, { target: { value: "你好", selectionStart: 2 } });
    expect(props.onMessageTextChange).toHaveBeenCalledWith("你好", 2);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSendText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(props.onSendText).toHaveBeenCalledOnce();
  });

  it("展示并可清除引用，群聊输入 @ 时展示候选", () => {
    const props = renderComposer({
      quotedMessageLabel: "小明：收到",
      activeMentionQuery: { start: 0, query: "小" },
      mentionCandidates: [{ wxid: "wxid_1", label: "小明" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "取消引用消息" }));
    expect(props.onClearQuotedMessage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "提及 小明" }));
    expect(props.onInsertMention).toHaveBeenCalledWith({ wxid: "wxid_1", label: "小明" }, expect.any(Number));
  });

  it("附件面板只提供已有七类能力且没有拍照", () => {
    const props = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "更多发送方式" }));
    const dialog = screen.getByRole("dialog", { name: "发送内容" });
    for (const label of ["录制语音", "语音文件", "图片", "文件", "视频", "链接", "HTML"]) {
      expect(within(dialog).getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(within(dialog).queryByText("拍照")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "录制语音" }));
    expect(props.onVoiceRecord).toHaveBeenCalledOnce();
  });

  it("支持选择图片、文件和语音文件", () => {
    const props = renderComposer();
    fireEvent.change(screen.getByLabelText("选择图片文件"), { target: { files: [new File(["i"], "a.png", { type: "image/png" })] } });
    fireEvent.change(screen.getByLabelText("选择文件"), { target: { files: [new File(["f"], "a.pdf")] } });
    fireEvent.change(screen.getByLabelText("选择语音文件"), { target: { files: [new File(["v"], "a.silk")] } });
    expect(props.onSendMedia).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: "a.png" }), "image");
    expect(props.onSendMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: "a.pdf" }), "file");
    expect(props.onSendMedia).toHaveBeenNthCalledWith(3, expect.objectContaining({ name: "a.silk" }), "voice");
  });

  it("展示待发送附件，可确认或删除，并为软键盘保留可见底部语义", () => {
    const attachment: PendingAttachment = { id: "a1", file: new File(["x"], "report.pdf"), type: "file" };
    const props = renderComposer({ pendingAttachments: [attachment], voiceRecording: true });
    const region = screen.getByTestId("mobile-composer");
    expect(region).toHaveClass("shrink-0");
    expect(region).toHaveStyle({ paddingBottom: "max(8px, env(safe-area-inset-bottom))" });
    expect(screen.getByRole("button", { name: "停止并发送" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除附件 report.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "发送附件" }));
    expect(props.onRemovePendingAttachment).toHaveBeenCalledWith("a1");
    expect(props.onSendPendingAttachments).toHaveBeenCalledOnce();
  });
});
