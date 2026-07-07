import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageNodeView } from "./MessageNodeView";

describe("MessageNodeView", () => {
  it("渲染 text 节点", () => {
    render(<MessageNodeView node={{ type: "text", text: "你好" }} />);

    expect(screen.getByText("你好")).toBeInTheDocument();
  });

  it("chat_record 初始只显示摘要卡片，点击后用弹窗递归展示条目", () => {
    render(
      <MessageNodeView
        node={{
          type: "chat_record",
          text: "聊天记录",
          items: [
            { type: "text", text: "第一条", senderName: "张三" },
            {
              type: "chat_record",
              text: "嵌套聊天记录",
              items: [{ type: "text", text: "内层消息", senderName: "李四" }]
            },
            { type: "file", text: "[文件]", media: { status: "failed", url: null, fileName: "合同.pdf" } },
          ]
        }}
      />
    );

    expect(screen.getByRole("button", { name: "打开聊天记录" })).toBeInTheDocument();
    expect(screen.getByText("3 条消息")).toBeInTheDocument();
    expect(screen.queryByText("第一条")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /打开聊天记录/ }));

    const dialog = screen.getByRole("dialog", { name: "聊天记录" });
    expect(within(dialog).getByText("张三")).toBeInTheDocument();
    expect(within(dialog).getByText("第一条")).toBeInTheDocument();
    expect(within(dialog).getByText("嵌套聊天记录")).toBeInTheDocument();
    expect(within(dialog).queryByText("内层消息")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /打开嵌套聊天记录/ }));

    const dialogs = screen.getAllByRole("dialog");
    expect(within(dialogs.at(-1)!).getByText("内层消息")).toBeInTheDocument();
  });

  it("chat_record 弹窗内的卡片类消息不再额外包一层边框", () => {
    render(
      <MessageNodeView
        node={{
          type: "chat_record",
          text: "聊天记录",
          items: [
            { type: "text", text: "文本条目", senderName: "张三" },
            {
              type: "image",
              text: "[图片]",
              senderName: "李四",
              media: { status: "ready", url: "https://example.test/a.jpg", mimeType: "image/jpeg" }
            },
            {
              type: "chat_record",
              text: "嵌套聊天记录",
              senderName: "王五",
              items: [{ type: "text", text: "内层消息" }]
            }
          ]
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /打开聊天记录/ }));

    const dialog = screen.getByRole("dialog", { name: "聊天记录" });
    const textItem = dialog.querySelector('[data-chat-record-item-frame="bubble"]');
    const cardItems = dialog.querySelectorAll('[data-chat-record-item-frame="bare"]');

    expect(textItem).toHaveClass("border");
    expect(cardItems).toHaveLength(2);
    for (const item of cardItems) {
      expect(item).not.toHaveClass("border");
      expect(item).not.toHaveClass("p-3");
    }
  });

  it("图片节点点击后弹窗预览大图", () => {
    const { container } = render(
      <section data-testid="message-host">
        <MessageNodeView
          node={{
            type: "image",
            text: "[图片]",
            media: { status: "ready", url: "https://example.test/a.jpg", mimeType: "image/jpeg" }
          }}
        />
      </section>
    );

    fireEvent.click(screen.getByRole("button", { name: "查看图片" }));

    const dialog = screen.getByRole("dialog", { name: "图片预览" });
    expect(within(dialog).getByAltText("[图片]")).toHaveAttribute("src", "https://example.test/a.jpg");
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    expect(document.body).toContainElement(dialog);
  });

  it("图片 URL 已就绪但浏览器未加载完成时继续展示加载占位", () => {
    const { container } = render(
      <MessageNodeView
        node={{
          type: "image",
          text: "[图片]",
          media: { status: "ready", url: "https://example.test/a.jpg", mimeType: "image/jpeg" }
        }}
      />
    );

    expect(screen.getByText("图片加载中")).toBeInTheDocument();
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toHaveClass("opacity-0");

    fireEvent.load(img);

    expect(screen.queryByText("图片加载中")).not.toBeInTheDocument();
    expect(img).toHaveClass("opacity-100");
  });

  it("图片 URL 加载失败时展示失败占位", () => {
    const { container } = render(
      <MessageNodeView
        node={{
          type: "image",
          text: "[图片]",
          media: { status: "ready", url: "https://example.test/broken.jpg", mimeType: "image/jpeg" }
        }}
      />
    );

    const img = container.querySelector("img") as HTMLImageElement;
    fireEvent.error(img);

    expect(screen.getByText("图片加载失败")).toBeInTheDocument();
    expect(img).toHaveClass("opacity-0");
  });

  it("图片下载中展示稳定占位和加载状态", () => {
    const { container } = render(
      <MessageNodeView
        node={{
          type: "image",
          text: "[图片]",
          media: { status: "pending", url: null, width: 320, height: 180 }
        }}
      />
    );

    expect(screen.getByText("图片加载中")).toBeInTheDocument();
    const imageFrame = container.querySelector('[data-media-frame="image"]') as HTMLElement | null;
    expect(imageFrame).toBeTruthy();
    expect(imageFrame).toHaveStyle({ aspectRatio: "320 / 180" });
    expect(imageFrame).toHaveClass("border", "border-dashed");
    expect(screen.queryByRole("button", { name: "查看图片" })).not.toBeInTheDocument();
  });

  it("图片和视频按媒体尺寸预留稳定占位，无尺寸时使用 200x150 默认尺寸", () => {
    const { container, rerender } = render(
      <MessageNodeView
        node={{
          type: "image",
          text: "[图片]",
          media: {
            status: "ready",
            url: "https://example.test/a.jpg",
            mimeType: "image/jpeg",
            width: 320,
            height: 180
          }
        }}
      />
    );

    const imageFrame = container.querySelector('[data-media-frame="image"]') as HTMLElement | null;
    expect(imageFrame).toBeTruthy();
    expect(imageFrame).toHaveStyle({ aspectRatio: "320 / 180" });
    expect(imageFrame).toHaveClass("overflow-hidden");
    expect(container.querySelector("img")).toHaveClass("opacity-0", "transition-opacity", "duration-120");

    rerender(
      <MessageNodeView
        node={{
          type: "video",
          text: "[视频]",
          media: {
            status: "ready",
            url: "https://example.test/a.mp4",
            mimeType: "video/mp4"
          }
        }}
      />
    );

    const videoFrame = container.querySelector('[data-media-frame="video"]') as HTMLElement | null;
    expect(videoFrame).toBeTruthy();
    expect(videoFrame).toHaveStyle({ width: "200px", height: "150px" });
    expect(container.querySelector("video")).toHaveClass("opacity-0", "transition-opacity", "duration-120");
  });

  it("语音节点使用 audio 控件播放并显示时长", () => {
    const { container } = render(
      <MessageNodeView
        node={{
          type: "voice",
          text: "[语音]",
          media: {
            status: "ready",
            url: "https://example.test/a.mp3",
            mimeType: "audio/mpeg",
            durationMs: 5314
          }
        }}
      />
    );

    expect(container.querySelector("audio")).toHaveAttribute("src", "https://example.test/a.mp3");
    expect(screen.getByText("00:05")).toBeInTheDocument();
  });

  it("位置、名片、红包、转账使用独立摘要形态", () => {
    const { rerender } = render(
      <MessageNodeView
        node={{
          type: "location",
          text: "[位置] 惠城区惠民大道辅路",
          location: {
            label: "惠城区惠民大道辅路",
            address: "惠城区星河传奇"
          }
        }}
      />
    );

    expect(screen.getByText("位置")).toBeInTheDocument();
    expect(screen.getByText("惠城区星河传奇")).toBeInTheDocument();

    rerender(<MessageNodeView node={{ type: "card", text: "[名片] 陈可乐", card: { wxid: "v3_card@stranger", nickName: "陈可乐" } }} />);
    expect(screen.getByText("名片")).toBeInTheDocument();
    expect(screen.getByText("v3_card@stranger")).toBeInTheDocument();

    rerender(<MessageNodeView node={{ type: "red_packet", text: "[红包] 红包测试哈哈哈", redPacket: { greeting: "红包测试哈哈哈" } }} />);
    expect(screen.getByText("红包")).toBeInTheDocument();
    expect(screen.getByText("红包测试哈哈哈")).toBeInTheDocument();

    rerender(<MessageNodeView node={{ type: "transfer", text: "[转账] ¥1.00", transfer: { amount: "¥1.00", memo: "测试" } }} />);
    expect(screen.getByText("转账")).toBeInTheDocument();
    expect(screen.getByText("测试")).toBeInTheDocument();
  });

  it("无明细的 chat_record 摘要型消息在主界面不暴露长正文", () => {
    const longSummary = "陈可乐与陳可乐的聊天记录 陳可乐: 这是一段非常长的摘要，包含大量被转发聊天内容，不应该直接铺在主聊天界面里。";
    render(<MessageNodeView node={{ type: "chat_record", text: longSummary, items: [] }} />);

    expect(screen.getByRole("button", { name: "打开聊天记录摘要" })).toBeInTheDocument();
    expect(screen.getByText("仅有摘要")).toBeInTheDocument();
    expect(screen.queryByText(longSummary)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开聊天记录摘要" }));

    expect(within(screen.getByRole("dialog", { name: "聊天记录摘要" })).getByText(longSummary)).toBeInTheDocument();
  });
});
