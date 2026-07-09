import { describe, expect, it } from "vitest";
import {
  ackResponseSchema,
  messageEnvelopeSchema,
  messageNodeSchema,
  sendResponseSchema,
  sendRequestSchema
} from "../src/index";

describe("标准消息契约", () => {
  it("接受合法的 text 消息信封，并保持所有微信 ID 为字符串", () => {
    const parsed = messageEnvelopeSchema.parse({
      schemaVersion: 1,
      eventType: "message.created",
      messageId: "msg_9154866412345678",
      status: "normal",
      isSelf: false,
      isAtMe: true,
      account: {
        id: "acc_1",
        wxid: "wxid_bot",
        name: "机器人昵称",
        remark: "客服号1"
      },
      conversation: {
        id: "cvs_1",
        type: "group",
        wxid: "48315023241@chatroom",
        name: "客户群 A",
        remark: "VIP客户群"
      },
      sender: {
        wxid: "wxid_abc",
        name: "陈可乐",
        remark: "张总-决策人",
        isOwner: false
      },
      mentions: [
        { wxid: "wxid_bot", name: "机器人", isMe: true, resolved: true },
        { name: "云知序", resolved: false }
      ],
      content: { type: "text", text: "@机器人 看看这个" },
      quote: null,
      renderedText: "@机器人 看看这个",
      renderedMd:
        "[上下文]\n消息ID: msg_9154866412345678\n\n[正文]\n@机器人 看看这个",
      sentAt: "2026-07-05T20:49:00.000+08:00",
      metadata: {
        debounceMs: 2000,
        maxWaitMs: 8000
      }
    });

    expect(parsed.messageId).toBe("msg_9154866412345678");
    expect(parsed.account.wxid).toBe("wxid_bot");
  });

  it("拒绝散落的未知 MessageNode type", () => {
    expect(() =>
      messageNodeSchema.parse({ type: "photo", text: "[图片]" })
    ).toThrow();
  });

  it("接受合并转发条目的真实 senderWxid，但仍不要求每个条目都有 wxid", () => {
    const parsed = messageNodeSchema.parse({
      type: "chat_record",
      text: "客户群的聊天记录",
      items: [
        {
          type: "text",
          text: "收到",
          senderName: "陈可乐",
          senderWxid: "wxid_abc",
          sourceMessageId: "msg_1"
        },
        {
          type: "text",
          text: "只有昵称",
          senderName: "张三"
        }
      ]
    });

    expect(parsed.items?.[0]?.senderWxid).toBe("wxid_abc");
    expect(parsed.items?.[1]?.senderWxid).toBeUndefined();
  });

  it("接受 message.revoked 事件最小载荷", () => {
    const parsed = messageEnvelopeSchema.parse({
      schemaVersion: 1,
      eventType: "message.revoked",
      messageId: "msg_1",
      status: "revoked",
      isSelf: false,
      isAtMe: false,
      account: { wxid: "wxid_bot" },
      conversation: { id: "cvs_1", type: "private", wxid: "wxid_a" },
      sender: { wxid: "wxid_a", isOwner: false },
      mentions: [],
      content: { type: "system", text: "撤回了一条消息", rawType: "REVOKE_MSG" },
      quote: null,
      renderedText: "撤回了一条消息",
      sentAt: "2026-07-05T20:49:00.000+08:00",
      revokedAt: "2026-07-05T20:50:00.000+08:00"
    });

    expect(parsed.status).toBe("revoked");
  });

  it("校验发送请求第一版支持类型", () => {
    expect(sendRequestSchema.parse({ conversationId: "cvs_1", type: "text", text: "你好" }).type).toBe("text");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "text",
        text: "你好",
        mentions: ["wxid_a", "notify@all"],
        replyToMessageId: "msg_9154866412345678",
        idempotencyKey: "idem_1",
        requestId: "req_1"
      }).replyToMessageId
    ).toBe("msg_9154866412345678");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "image",
        contentBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        fileName: "screenshot.png"
      }).type
    ).toBe("image");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "file",
        contentBase64: "SGVsbG8=",
        mimeType: "text/plain",
        fileName: "note.txt"
      }).type
    ).toBe("file");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "voice",
        contentBase64: "UklGRg==",
        mimeType: "audio/webm",
        fileName: "recording.webm",
        durationMs: 2600
      }).type
    ).toBe("voice");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "video",
        mediaUrl: "https://cdn.example/video.mp4",
        thumbUrl: "https://cdn.example/video-cover.jpg"
      }).type
    ).toBe("video");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "video",
        contentBase64: "AAAA",
        mimeType: "video/mp4"
      }).type
    ).toBe("video");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "link",
        linkUrl: "https://example.com/article"
      }).type
    ).toBe("link");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "html",
        title: "页面标题",
        desc: "页面描述",
        htmlContent: "<!doctype html><html><body>报告</body></html>",
        htmlFileName: "report.html"
      }).type
    ).toBe("html");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "html",
        title: "页面标题",
        htmlContentBase64: "PCFkb2N0eXBlIGh0bWw+",
        htmlFileName: "report.html"
      }).type
    ).toBe("html");
    expect(
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "html",
        title: "页面标题",
        linkUrl: "https://example.com/report.html"
      }).type
    ).toBe("html");
    expect(() => sendRequestSchema.parse({ conversationId: "cvs_1", type: "image" })).toThrow();
    expect(() => sendRequestSchema.parse({ conversationId: "cvs_1", type: "file" })).toThrow();
    expect(() => sendRequestSchema.parse({ conversationId: "cvs_1", type: "video" })).toThrow();
    expect(() =>
      sendRequestSchema.parse({
        conversationId: "cvs_1",
        type: "video",
        mediaUrl: "https://cdn.example/video.mp4"
      })
    ).toThrow("远程视频消息必须提供缩略图");
    expect(() => sendRequestSchema.parse({ conversationId: "cvs_1", type: "link" })).toThrow();
    expect(() => sendRequestSchema.parse({ conversationId: "cvs_1", type: "html" })).toThrow();
    expect(() => sendRequestSchema.parse({ conversationId: "cvs_1", type: "sticker" })).toThrow();
  });

  it("校验 ACK 与发送响应契约", () => {
    expect(ackResponseSchema.parse({ ok: true, acked: 2 }).acked).toBe(2);
    expect(sendResponseSchema.parse({ id: "send_1", status: "pending" }).status).toBe("pending");
    expect(sendResponseSchema.parse({ id: "send_1", status: "sent", messageId: "msg_1" }).messageId).toBe("msg_1");
    expect(
      sendResponseSchema.parse({
        id: "send_html",
        status: "pending",
        htmlPublicUrl: "https://gewehub.yunzxu.com/h/html_token",
        htmlPageId: "html_1",
        htmlHosted: true
      }).htmlPublicUrl
    ).toBe("https://gewehub.yunzxu.com/h/html_token");
    expect(() => ackResponseSchema.parse({ ok: false, acked: 0 })).toThrow();
    expect(() => sendResponseSchema.parse({ id: "send_1", status: "unknown" })).toThrow();
  });

  it("接受 html 标准消息节点，链接字段承载公网访问地址", () => {
    const parsed = messageNodeSchema.parse({
      type: "html",
      text: "[HTML] 页面标题",
      link: {
        title: "页面标题",
        desc: "页面描述",
        url: "https://gewehub.yunzxu.com/h/html_token"
      }
    });

    expect(parsed.type).toBe("html");
    expect(parsed.link?.url).toBe("https://gewehub.yunzxu.com/h/html_token");
  });
});
