import { describe, expect, it, vi } from "vitest";
import type { AccountSummary, MessageItem } from "@/lib/workspace-data";
import {
  buildVisibleMessages,
  compareMessagesBySentAt,
  createLocalMediaSend,
  createLocalTextSend,
  mapLocalSendToMessageItem,
  mergeMessagesById,
} from "./workbench-local-sends";

describe("workbench-local-sends", () => {
  it("创建本地发送中消息草稿", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T07:16:37.000Z"));

    const send = createLocalTextSend("conv_1", "你好");

    expect(send).toMatchObject({
      id: "local_text_1783322197000_i",
      conversationId: "conv_1",
      text: "你好",
      status: "pending",
      createdAtIso: "2026-07-06T07:16:37.000Z",
    });

    vi.useRealTimers();
  });

  it("将本地发送草稿映射为自发消息", () => {
    const account: AccountSummary = {
      id: "acc_1",
      name: "客服主号",
      wxid: "wxid_bot",
      status: "online",
    };

    const message = mapLocalSendToMessageItem(
      {
        id: "local_1",
        conversationId: "conv_1",
        type: "text",
        text: "本地消息",
        status: "failed",
        errorMessage: "网络错误",
        sendRequestId: "send_1",
        createdAtIso: "2026-07-06T07:16:37.000Z",
      },
      account,
    );

    expect(message).toMatchObject({
      id: "local_1",
      messageId: "local_1",
      senderName: "客服主号",
      isSelf: true,
      content: { type: "text", text: "本地消息" },
      localSend: {
        conversationId: "conv_1",
        text: "本地消息",
        status: "failed",
        errorMessage: "网络错误",
        sendRequestId: "send_1",
      },
    });
  });

  it("将本地图片和文件发送草稿映射为对应消息节点", () => {
    const image = mapLocalSendToMessageItem({
      id: "local_image_1",
      conversationId: "conv_1",
      type: "image",
      text: "[图片] screenshot.png",
      fileName: "screenshot.png",
      mimeType: "image/png",
      status: "pending",
      createdAtIso: "2026-07-06T07:16:37.000Z",
    });
    const file = mapLocalSendToMessageItem({
      id: "local_file_1",
      conversationId: "conv_1",
      type: "file",
      text: "[文件] note.txt",
      fileName: "note.txt",
      mimeType: "text/plain",
      status: "failed",
      errorMessage: "上传失败",
      createdAtIso: "2026-07-06T07:16:38.000Z",
    });

    expect(image.content).toEqual({
      type: "image",
      text: "[图片] screenshot.png",
      media: {
        status: "pending",
        fileName: "screenshot.png",
        mimeType: "image/png",
      },
    });
    expect(file.content).toEqual({
      type: "file",
      text: "[文件] note.txt",
      media: {
        status: "failed",
        fileName: "note.txt",
        mimeType: "text/plain",
      },
    });
    expect(file.localSend).toMatchObject({
      type: "file",
      label: "[文件] note.txt",
      status: "failed",
      errorMessage: "上传失败",
    });
  });

  it("创建本地媒体发送草稿时保留重试所需 payload", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T07:16:37.000Z"));

    const send = createLocalMediaSend("conv_1", {
      type: "file",
      contentBase64: "SGVsbG8=",
      mimeType: "text/plain",
      fileName: "note.txt",
    });

    expect(send).toMatchObject({
      conversationId: "conv_1",
      type: "file",
      text: "[文件] note.txt",
      fileName: "note.txt",
      mimeType: "text/plain",
      status: "pending",
      sendPayload: {
        type: "file",
        contentBase64: "SGVsbG8=",
        mimeType: "text/plain",
        fileName: "note.txt",
      },
      createdAtIso: "2026-07-06T07:16:37.000Z",
    });

    vi.useRealTimers();
  });

  it("将本地 HTML 发送草稿映射为 html 消息节点", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T07:16:37.000Z"));

    const send = createLocalMediaSend("conv_1", {
      type: "html",
      title: "日报",
      desc: "今日 AI 日报",
      htmlContentBase64: "PGh0bWw+PC9odG1sPg==",
      htmlFileName: "report.html",
    });
    const message = mapLocalSendToMessageItem(send);

    expect(send).toMatchObject({
      conversationId: "conv_1",
      type: "html",
      text: "[HTML] 日报",
      status: "pending",
      sendPayload: {
        type: "html",
        title: "日报",
        desc: "今日 AI 日报",
        htmlContentBase64: "PGh0bWw+PC9odG1sPg==",
        htmlFileName: "report.html",
      },
    });
    expect(message.content).toEqual({
      type: "html",
      text: "[HTML] 日报",
      link: {
        title: "日报",
        desc: "今日 AI 日报",
        url: undefined,
        thumbnailUrl: undefined,
      },
    });

    vi.useRealTimers();
  });

  it("构造可见消息时过滤已被服务端 sendRequestId 替换的本地消息并按时间排序", () => {
    const server = messageFixture("server_1", "send_1", "2026-07-06T07:16:39.000Z");
    const visible = buildVisibleMessages(
      [server],
      [
        {
          id: "local_replaced",
          conversationId: "conv_1",
          type: "text",
          text: "已替换",
          status: "pending",
          sendRequestId: "send_1",
          createdAtIso: "2026-07-06T07:16:38.000Z",
        },
        {
          id: "local_visible",
          conversationId: "conv_1",
          type: "text",
          text: "仍显示",
          status: "pending",
          createdAtIso: "2026-07-06T07:16:37.000Z",
        },
      ],
      "conv_1",
    );

    expect(visible.map((message) => message.id)).toEqual(["local_visible", "server_1"]);
  });

  it("按 id 合并消息并按 sentAtIso 比较顺序", () => {
    const first = messageFixture("m1", null, "2026-07-06T07:16:37.000Z");
    const duplicate = messageFixture("m1", null, "2026-07-06T07:16:38.000Z");
    const second = messageFixture("m2", null, "2026-07-06T07:16:39.000Z");

    expect(mergeMessagesById([first, duplicate, second]).map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(compareMessagesBySentAt(first, second)).toBeLessThan(0);
  });
});

function messageFixture(id: string, sendRequestId: string | null, sentAtIso: string): MessageItem {
  return {
    id,
    messageId: id,
    sendRequestId,
    senderName: "客户",
    senderProfile: {
      wxid: "wxid_user",
      nickname: "客户",
      displayName: "客户",
      platformRemark: null,
      avatarUrl: null,
      status: "active",
    },
    isSelf: false,
    sentAt: sentAtIso,
    sentAtIso,
    status: "normal",
    content: { type: "text", text: id },
    standardJson: { type: "text", text: id },
    rawPayload: null,
    deliveries: [],
  };
}
