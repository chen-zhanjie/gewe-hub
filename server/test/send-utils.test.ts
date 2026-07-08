import { describe, expect, it } from "vitest";
import { buildLocalHubSendMessage, mapSendRequestToGewe } from "../src/modules/send/send-utils.js";

describe("send 工具", () => {
  it("将带 @ 的文本发送请求映射为 GeWe 文本请求，ats 使用逗号分隔字符串", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "text",
      text: "你好",
      mentions: ["wxid_a", "wxid_b"]
    });

    expect(result.path).toBe("/gewe/v2/api/message/postText");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      content: "你好",
      ats: "wxid_a,wxid_b"
    });
  });

  it("普通文本发送请求不携带 ats，避免 GeWe 将空数组判为类型错误", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "text",
      text: "普通文字"
    });

    expect(result.path).toBe("/gewe/v2/api/message/postText");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      content: "普通文字"
    });
  });

  it("将语音发送请求映射为待 Silk 转换的 GeWe 语音请求", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "voice",
      contentBase64: "UklGRg==",
      mimeType: "audio/webm",
      fileName: "recording.webm",
      durationMs: 2600
    });

    expect(result.path).toBe("/gewe/v2/api/message/postVoice");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      voiceDuration: 2600,
      source: {
        contentBase64: "UklGRg==",
        mimeType: "audio/webm",
        fileName: "recording.webm"
      }
    });
  });

  it("将上传图片发送请求映射为待本地发布的 GeWe 图片请求", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "image",
      contentBase64: "iVBORw0KGgo=",
      mimeType: "image/png",
      fileName: "screenshot.png"
    });

    expect(result.path).toBe("/gewe/v2/api/message/postImage");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      source: {
        contentBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        fileName: "screenshot.png"
      }
    });
  });

  it("将上传文件发送请求映射为待本地发布的 GeWe 文件请求", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "file",
      contentBase64: "SGVsbG8=",
      mimeType: "text/plain",
      fileName: "note.txt"
    });

    expect(result.path).toBe("/gewe/v2/api/message/postFile");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      source: {
        contentBase64: "SGVsbG8=",
        mimeType: "text/plain",
        fileName: "note.txt"
      }
    });
  });

  it("将上传视频发送请求映射为待本地发布的 GeWe 视频请求", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "video",
      contentBase64: "AAAAIGZ0eXA=",
      mimeType: "video/mp4",
      fileName: "clip.mp4",
      thumbContentBase64: "iVBORw0KGgo=",
      thumbMimeType: "image/png",
      thumbFileName: "cover.png",
      durationMs: 10_000
    });

    expect(result.path).toBe("/gewe/v2/api/message/postVideo");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      thumbSource: {
        contentBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        fileName: "cover.png"
      },
      videoDuration: 10,
      source: {
        contentBase64: "AAAAIGZ0eXA=",
        mimeType: "video/mp4",
        fileName: "clip.mp4"
      }
    });
  });

  it("将未提供封面和时长的视频发送请求映射为 Hub 可自动补全的 GeWe 视频请求", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "video",
      contentBase64: "AAAAIGZ0eXA=",
      mimeType: "video/mp4",
      fileName: "clip.mp4"
    });

    expect(result.path).toBe("/gewe/v2/api/message/postVideo");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      videoDuration: 1,
      source: {
        contentBase64: "AAAAIGZ0eXA=",
        mimeType: "video/mp4",
        fileName: "clip.mp4"
      }
    });
  });

  it("将公网视频 URL 发送请求映射为 GeWe 可直接访问的 videoUrl", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "video",
      mediaUrl: "https://cdn.example.test/clip.mp4",
      mimeType: "video/mp4",
      fileName: "clip.mp4"
    });

    expect(result.path).toBe("/gewe/v2/api/message/postVideo");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      videoDuration: 1,
      videoUrl: "https://cdn.example.test/clip.mp4"
    });
  });

  it("将链接发送请求映射为 GeWe 链接请求", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "link",
      title: "链接标题",
      desc: "链接描述",
      linkUrl: "https://example.com/article",
      thumbContentBase64: "/9j/",
      thumbMimeType: "image/jpeg",
      thumbFileName: "thumb.jpg"
    });

    expect(result.path).toBe("/gewe/v2/api/message/postLink");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      title: "链接标题",
      desc: "链接描述",
      linkUrl: "https://example.com/article",
      thumbSource: {
        contentBase64: "/9j/",
        mimeType: "image/jpeg",
        fileName: "thumb.jpg"
      }
    });
  });

  it("将 HTML 发送请求映射为 GeWe 链接请求", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "html",
      title: "HTML 标题",
      desc: "HTML 描述",
      linkUrl: "https://gewehub.yunzxu.com/h/html_token",
      thumbUrl: "https://example.com/thumb.jpg"
    });

    expect(result.path).toBe("/gewe/v2/api/message/postLink");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      title: "HTML 标题",
      desc: "HTML 描述",
      linkUrl: "https://gewehub.yunzxu.com/h/html_token",
      thumbUrl: "https://example.com/thumb.jpg"
    });
  });

  it("发送成功后生成本地 hub_send 标准消息", () => {
    const message = buildLocalHubSendMessage({
      accountWxid: "wxid_bot",
      conversationId: "cvs_1",
      conversationWxid: "wxid_target",
      senderWxid: "wxid_bot",
      text: "回复",
      newMsgId: "9154866412345678",
      createTime: "1782932724220"
    });

    expect(message.messageId).toBe("msg_9154866412345678");
    expect(message.source).toBe("hub_send");
    expect(message.payload.content.type).toBe("text");
  });

  it("发送成功后兼容 GeWe 秒级 createTime，避免本地消息被排序到 1970 年", () => {
    const message = buildLocalHubSendMessage({
      accountWxid: "wxid_bot",
      conversationId: "cvs_1",
      conversationWxid: "wxid_target",
      senderWxid: "wxid_bot",
      text: "[图片]",
      newMsgId: "3752114964119400000",
      createTime: "1783476300",
      content: {
        type: "image",
        text: "[图片]",
        media: {
          status: "ready",
          url: "http://localhost:8090/files/outbound/image?exp=1893456000&sig=test",
          mimeType: "image/png",
          fileName: "image.png"
        }
      }
    });

    expect(message.sentAt.toISOString()).toBe("2026-07-08T02:05:00.000Z");
    expect(message.payload.sentAt).toBe("2026-07-08T02:05:00.000Z");
  });

  it("语音发送成功后生成本地 hub_send 语音标准消息，保留可播放 URL", () => {
    const message = buildLocalHubSendMessage({
      accountWxid: "wxid_bot",
      conversationId: "cvs_1",
      conversationWxid: "wxid_target",
      senderWxid: "wxid_bot",
      text: "[语音]",
      newMsgId: "9154866412345678",
      createTime: "1782932724220",
      content: {
        type: "voice",
        text: "[语音]",
        media: {
          status: "ready",
          url: "http://localhost:8090/files/original_voice?exp=1893456000&sig=test",
          mimeType: "audio/webm",
          fileName: "recording.webm",
          durationMs: 2600
        }
      }
    });

    expect(message.type).toBe("voice");
    expect(message.renderedText).toBe("[语音]");
    expect(message.payload.content.type).toBe("voice");
    expect(message.payload.content.media?.url).toContain("/files/original_voice");
  });
});
