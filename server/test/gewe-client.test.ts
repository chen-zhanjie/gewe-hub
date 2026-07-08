import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeweClientService, GeweRequestTimeoutError } from "../src/modules/gewe/gewe-client.service.js";

describe("GeweClientService", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379/0");
    vi.stubEnv("GEWE_BASE_URL", "http://api.geweapi.com");
    vi.stubEnv("GEWE_TOKEN", "test-gewe-token");
    vi.stubEnv("WEBHOOK_SECRET", "replace-with-random-secret");
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "replace-with-bcrypt-hash");
    vi.stubEnv("SESSION_SECRET", "replace-with-long-random-secret");
    vi.stubEnv("FILE_STORAGE_DIR", "./storage/files");
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
  });

  it("设置回调时同时在 header 和 body 传递 GeWe token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ret: 200, msg: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new GeweClientService().setCallback("http://callback.example/webhook/gewe/secret");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.geweapi.com/gewe/v2/api/login/setCallback",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-GEWE-TOKEN": "test-gewe-token"
        }),
        body: JSON.stringify({
          token: "test-gewe-token",
          callbackUrl: "http://callback.example/webhook/gewe/secret"
        })
      })
    );
  });

  it("封装通讯录和群成员同步所需的 GeWe API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ret: 200, msg: "ok", data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    await client.fetchContactsList("wx_app");
    await client.fetchContactsListCache("wx_app");
    await client.getBriefInfo("wx_app", ["wxid_a", "10000@chatroom"]);
    await client.getDetailInfo("wx_app", ["wxid_a"]);
    await client.getChatroomMemberList("wx_app", "10000@chatroom");
    await client.getChatroomMemberDetail("wx_app", "10000@chatroom", ["wxid_a"]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://api.geweapi.com/gewe/v2/api/contacts/fetchContactsList",
      expect.objectContaining({ body: JSON.stringify({ appId: "wx_app" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://api.geweapi.com/gewe/v2/api/contacts/fetchContactsListCache",
      expect.objectContaining({ body: JSON.stringify({ appId: "wx_app" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://api.geweapi.com/gewe/v2/api/contacts/getBriefInfo",
      expect.objectContaining({ body: JSON.stringify({ appId: "wx_app", wxids: ["wxid_a", "10000@chatroom"] }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://api.geweapi.com/gewe/v2/api/contacts/getDetailInfo",
      expect.objectContaining({ body: JSON.stringify({ appId: "wx_app", wxids: ["wxid_a"] }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "http://api.geweapi.com/gewe/v2/api/group/getChatroomMemberList",
      expect.objectContaining({ body: JSON.stringify({ appId: "wx_app", chatroomId: "10000@chatroom" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "http://api.geweapi.com/gewe/v2/api/group/getChatroomMemberDetail",
      expect.objectContaining({ body: JSON.stringify({ appId: "wx_app", chatroomId: "10000@chatroom", memberWxids: ["wxid_a"] }) })
    );
  });

  it("封装获取当前微信账号个人资料的 GeWe API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ret: 200, msg: "ok", data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    await client.getProfile("wx_app");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.geweapi.com/gewe/v2/api/personal/getProfile",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-GEWE-TOKEN": "test-gewe-token"
        }),
        body: JSON.stringify({ appId: "wx_app" })
      })
    );
  });

  it("按媒体类型调用 GeWe 下载接口并提取临时文件 URL", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ret: 200,
      msg: "ok",
      data: { fileUrl: "https://download.example/file.jpg" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    const result = await client.downloadMedia({
      appId: "wx_app",
      kind: "image",
      rawContent: "<msg><img /></msg>",
      msgId: "123"
    });

    expect(result).toEqual({ fileUrl: "https://download.example/file.jpg" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.geweapi.com/gewe/v2/api/message/downloadImage",
      expect.objectContaining({
        body: JSON.stringify({
          appId: "wx_app",
          xml: "<msg><img /></msg>",
          type: 2
        })
      })
    );
  });

  it("调用 GeWe 撤回消息接口时使用发送结果三件套", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ret: 200, msg: "操作成功" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    await client.revokeMessage({
      appId: "wx_app",
      toWxid: "wxid_target",
      msgId: "769533801",
      newMsgId: "5271007655758710001",
      createTime: "1704163145"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.geweapi.com/gewe/v2/api/message/revokeMsg",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-GEWE-TOKEN": "test-gewe-token"
        }),
        body: JSON.stringify({
          appId: "wx_app",
          toWxid: "wxid_target",
          msgId: "769533801",
          newMsgId: "5271007655758710001",
          createTime: "1704163145"
        })
      })
    );
  });

  it("撤回接口返回业务失败时抛出 GeWe 错误，不按 HTTP 200 当成功", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ret: 500, msg: "消息已超过可撤回时间" }), { status: 200 })),
    );
    const client = new GeweClientService();

    await expect(
      client.revokeMessage({
        appId: "wx_app",
        toWxid: "wxid_target",
        msgId: "769533801",
        newMsgId: "5271007655758710001",
        createTime: "1704163145"
      }),
    ).rejects.toThrow("GeWe 撤回失败: 消息已超过可撤回时间");
  });

  it("发送接口返回业务失败时抛出 GeWe 错误，不按 HTTP 200 当成功", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ret: 500,
              msg: "发送图片失败",
              data: {
                msg: "图片格式错误",
                detail: "{\"ret\":-1,\"msg\":\"fail\",\"msg_err\":\"图片格式错误\"}",
              },
            }),
            { status: 200 },
          ),
      ),
    );
    const client = new GeweClientService();

    await expect(
      client.sendByMappedRequest({
        path: "/gewe/v2/api/message/postImage",
        body: {
          appId: "wx_app",
          toWxid: "wxid_target",
          imgUrl: "http://example.com/image.jpg",
        },
      }),
    ).rejects.toThrow("GeWe 发送失败: 图片格式错误");
  });

  it("发送接口响应中的超大 newMsgId 必须按原始字符串保留，供撤回参数复用", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            '{"ret":200,"msg":"ok","data":{"msgId":769533801,"newMsgId":5271007655758710001,"createTime":1704163145}}',
            { status: 200 },
          ),
      ),
    );
    const client = new GeweClientService();

    const result = await client.sendByMappedRequest({
      path: "/gewe/v2/api/message/postImage",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        imgUrl: "http://example.com/image.jpg",
      },
    });

    expect(result).toMatchObject({
      data: {
        msgId: 769533801,
        newMsgId: "5271007655758710001",
        createTime: 1704163145,
      },
    });
  });

  it("发送消息使用独立长超时，避免文件类发送在 GeWe 拉取文件时过早中断", async () => {
    vi.stubEnv("GEWE_SEND_TIMEOUT_MS", "120000");
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ret: 200, msg: "ok", data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    await client.sendByMappedRequest({
      path: "/gewe/v2/api/message/postFile",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        fileUrl: "http://example.com/file.pdf",
        fileName: "file.pdf",
      },
    });

    expect(timeoutSpy).toHaveBeenCalledWith(120000);
    timeoutSpy.mockRestore();
  });

  it("GeWe 请求超时时抛出可识别的超时错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );
    const client = new GeweClientService();

    await expect(
      client.sendByMappedRequest({
        path: "/gewe/v2/api/message/postFile",
        body: {
          appId: "wx_app",
          toWxid: "wxid_target",
          fileUrl: "http://example.com/file.pdf",
          fileName: "file.pdf",
        },
      }),
    ).rejects.toBeInstanceOf(GeweRequestTimeoutError);
  });

  it("紧凑表情引用内容按第四段 md5 调用 GeWe 下载接口", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ret: 200,
      msg: "ok",
      data: { fileUrl: "https://download.example/emoji.gif" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    const result = await client.downloadMedia({
      appId: "wx_app",
      kind: "emoji",
      rawContent: "wxid_lnop8pc2ivre22:1783318038718:0:fc2e00714e7497246500f1ab9358deea::0\n",
      msgId: "123"
    });

    expect(result).toEqual({ fileUrl: "https://download.example/emoji.gif" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.geweapi.com/gewe/v2/api/message/downloadEmojiMd5",
      expect.objectContaining({
        body: JSON.stringify({
          appId: "wx_app",
          emojiMd5: "fc2e00714e7497246500f1ab9358deea"
        })
      })
    );
  });

  it("转发聊天记录图片条目按 downloadCdn type=1 下载", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ret: 200,
      msg: "ok",
      data: { fileUrl: "https://download.example/forwarded.jpg" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    const result = await client.downloadMedia({
      appId: "wx_app",
      kind: "image",
      msgId: "123",
      rawContent: "<msg><img /></msg>",
      method: "forwarded_cdn",
      aesKey: "data_key",
      fileId: "cdn_data",
      type: "1",
      totalSize: "88",
      suffix: "jpg"
    });

    expect(result).toEqual({ fileUrl: "https://download.example/forwarded.jpg" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.geweapi.com/gewe/v2/api/message/downloadCdn",
      expect.objectContaining({
        body: JSON.stringify({
          appId: "wx_app",
          aesKey: "data_key",
          fileId: "cdn_data",
          type: "1",
          totalSize: "88",
          suffix: "jpg"
        })
      })
    );
  });

  it("普通图片下载响应缺少 fileUrl 时按 XML CDN 字段 fallback 到 downloadCdn type=1", async () => {
    const imageXml = '<msg><img cdnmidimgurl="cdn_data" aeskey="data_key" length="88" /></msg>';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ret: 200, msg: "ok", data: {} }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: { fileUrl: "https://download.example/fallback.jpg" },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    const result = await client.downloadMedia({
      appId: "wx_app",
      kind: "image",
      rawContent: imageXml,
      msgId: "123"
    });

    expect(result).toEqual({ fileUrl: "https://download.example/fallback.jpg" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://api.geweapi.com/gewe/v2/api/message/downloadImage",
      expect.objectContaining({
        body: JSON.stringify({
          appId: "wx_app",
          xml: imageXml,
          type: 2
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://api.geweapi.com/gewe/v2/api/message/downloadCdn",
      expect.objectContaining({
        body: JSON.stringify({
          appId: "wx_app",
          aesKey: "data_key",
          fileId: "cdn_data",
          type: "1",
          totalSize: "88",
          suffix: "jpg"
        })
      })
    );
  });

  it("普通图片下载业务失败时也按 XML CDN 字段 fallback 到 downloadCdn type=1", async () => {
    const imageXml = '<msg><img cdnmidimgurl="cdn_data" aeskey="data_key" length="88" /></msg>';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ret: 500,
            msg: "下载图片失败",
            data: { msg: "下载图片失败" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: { fileUrl: "https://download.example/fallback.jpg" },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeweClientService();

    const result = await client.downloadMedia({
      appId: "wx_app",
      kind: "image",
      rawContent: imageXml,
      msgId: "123"
    });

    expect(result).toEqual({ fileUrl: "https://download.example/fallback.jpg" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://api.geweapi.com/gewe/v2/api/message/downloadCdn",
      expect.objectContaining({
        body: JSON.stringify({
          appId: "wx_app",
          aesKey: "data_key",
          fileId: "cdn_data",
          type: "1",
          totalSize: "88",
          suffix: "jpg"
        })
      })
    );
  });

  it("下载接口返回业务失败时保留 GeWe 错误信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ret: 500,
              msg: "下载图片失败",
              data: { code: 500, msg: "下载图片失败" },
            }),
            { status: 200 },
          ),
      ),
    );
    const client = new GeweClientService();

    await expect(
      client.downloadMedia({
        appId: "wx_app",
        kind: "image",
        rawContent: "<msg><img /></msg>",
        msgId: "123",
      }),
    ).rejects.toThrow("GeWe image 下载失败: 下载图片失败");
  });
});
