import { describe, expect, it } from "vitest";
import { buildLocalHubSendMessage, mapSendRequestToGewe } from "../src/modules/send/send-utils.js";

describe("send 工具", () => {
  it("将文本发送请求映射为 GeWe 文本请求", () => {
    const result = mapSendRequestToGewe({
      appId: "wx_app",
      peerWxid: "wxid_target",
      type: "text",
      text: "你好",
      mentions: ["wxid_a"]
    });

    expect(result.path).toBe("/gewe/v2/api/message/postText");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      content: "你好",
      ats: ["wxid_a"]
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
      thumbUrl: "https://cdn.example/thumb.jpg",
      durationMs: 10_000
    });

    expect(result.path).toBe("/gewe/v2/api/message/postVideo");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      thumbUrl: "https://cdn.example/thumb.jpg",
      videoDuration: 10,
      source: {
        contentBase64: "AAAAIGZ0eXA=",
        mimeType: "video/mp4",
        fileName: "clip.mp4"
      }
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
      thumbUrl: "https://example.com/thumb.jpg"
    });

    expect(result.path).toBe("/gewe/v2/api/message/postLink");
    expect(result.body).toEqual({
      appId: "wx_app",
      toWxid: "wxid_target",
      title: "链接标题",
      desc: "链接描述",
      linkUrl: "https://example.com/article",
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
