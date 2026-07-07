import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageEnvelope } from "@gewehub/contracts";
import { MediaService } from "../src/modules/media/media.service.js";

const env = {
  DATABASE_URL: "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub",
  REDIS_URL: "redis://127.0.0.1:6379/0",
  GEWE_BASE_URL: "http://api.geweapi.com",
  GEWE_TOKEN: "test-gewe-token",
  WEBHOOK_SECRET: "replace-with-random-secret",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "replace-with-bcrypt-hash",
  SESSION_SECRET: "replace-with-long-random-secret",
  PUBLIC_BASE_URL: "http://localhost:3000",
};

function imageEnvelope(): MessageEnvelope {
  return {
    schemaVersion: 1,
    eventType: "message.created",
    messageId: "msg_1",
    status: "normal",
    isSelf: false,
    isAtMe: false,
    account: { wxid: "wxid_bot" },
    conversation: { id: "cvs_1", type: "private", wxid: "wxid_sender" },
    sender: { wxid: "wxid_sender", isOwner: false },
    mentions: [],
    content: {
      type: "image",
      text: "[图片]",
      media: { status: "pending", url: null, size: 12, md5: "md5-image" },
    },
    quote: null,
    renderedText: "[图片]",
    sentAt: "2026-07-06T01:00:00.000Z",
  };
}

function fileEnvelope(): MessageEnvelope {
  return {
    ...imageEnvelope(),
    messageId: "msg_file",
    content: {
      type: "file",
      text: "[文件] mapping_app.txt",
      media: {
        status: "pending",
        url: null,
        fileName: "mapping_app.txt",
        size: 2732,
      },
    },
    renderedText: "[文件] mapping_app.txt",
  };
}

function chatRecordWithItemMediaEnvelope(): MessageEnvelope {
  return {
    ...imageEnvelope(),
    messageId: "msg_chat_record",
    content: {
      type: "chat_record",
      text: "群聊的聊天记录",
      items: [
        {
          type: "image",
          text: "[图片]",
          media: {
            status: "pending",
            url: null,
            size: 88,
            width: 120,
            height: 90,
          },
        },
        {
          type: "text",
          text: "后续文本",
        },
      ],
    },
    renderedText: "[聊天记录] 群聊的聊天记录",
  };
}

function nestedChatRecordWithItemMediaEnvelope(): MessageEnvelope {
  return {
    ...imageEnvelope(),
    messageId: "msg_nested_chat_record",
    content: {
      type: "chat_record",
      text: "外层聊天记录",
      items: [
        {
          type: "chat_record",
          text: "内层聊天记录",
          items: [
            {
              type: "image",
              text: "[图片]",
              media: {
                status: "pending",
                url: null,
                size: 77,
                width: 180,
                height: 110,
              },
            },
          ],
        },
      ],
    },
    renderedText: "[聊天记录] 外层聊天记录",
  };
}

const chatRecordRawContent =
  '<msg><appmsg><title>群聊的聊天记录</title><type>19</type><recorditem><![CDATA[<recordinfo><datalist><dataitem datatype="2"><datadesc>[图片]</datadesc><cdndataurl>cdn_data</cdndataurl><cdndatakey>data_key</cdndatakey><cdnthumburl>cdn_thumb</cdnthumburl><cdnthumbkey>thumb_key</cdnthumbkey><fullmd5>full_md5</fullmd5><datasize>88</datasize><thumbwidth>120</thumbwidth><thumbheight>90</thumbheight></dataitem></datalist></recordinfo>]]></recorditem></appmsg></msg>';
const chatRecordItemImageXml =
  '<msg><img cdnmidimgurl="cdn_data" aeskey="data_key" cdnthumburl="cdn_thumb" cdnthumbaeskey="thumb_key" length="88" cdnthumbwidth="120" cdnthumbheight="90" md5="full_md5" /></msg>';
const nestedChatRecordRawContent =
  '<msg><appmsg><title>外层聊天记录</title><type>19</type><recorditem><![CDATA[<recordinfo><datalist><dataitem datatype="17"><datatitle>内层聊天记录</datatitle><recordxml><recordinfo><datalist><dataitem datatype="2"><datadesc>[图片]</datadesc><cdndataurl>nested_cdn_data</cdndataurl><cdndatakey>nested_data_key</cdndatakey><cdnthumburl>nested_thumb</cdnthumburl><cdnthumbkey>nested_thumb_key</cdnthumbkey><fullmd5>nested_md5</fullmd5><datasize>77</datasize><thumbwidth>180</thumbwidth><thumbheight>110</thumbheight></dataitem></datalist></recordinfo></recordxml></dataitem></datalist></recordinfo>]]></recorditem></appmsg></msg>';
const nestedChatRecordItemImageXml =
  '<msg><img cdnmidimgurl="nested_cdn_data" aeskey="nested_data_key" cdnthumburl="nested_thumb" cdnthumbaeskey="nested_thumb_key" length="77" cdnthumbwidth="180" cdnthumbheight="110" md5="nested_md5" /></msg>';
const chatRecordItemQuoteImageRawContent =
  '<msg><appmsg><title>群聊的聊天记录</title><type>19</type><recorditem><![CDATA[<recordinfo><datalist><dataitem datatype="1"><datadesc>free</datadesc><refermsgitem><type>3</type><svrid>621692926160286035</svrid><displayname>Devin</displayname><content><msg><img cdnmidimgurl="quote_cdn_data" aeskey="quote_data_key" cdnthumburl="quote_thumb" cdnthumbaeskey="quote_thumb_key" length="66" cdnthumbwidth="180" cdnthumbheight="102" md5="quote_md5" /></msg></content></refermsgitem></dataitem></datalist></recordinfo>]]></recorditem></appmsg></msg>';
const chatRecordItemQuoteImageXml =
  '<msg><img cdnmidimgurl="quote_cdn_data" aeskey="quote_data_key" cdnthumburl="quote_thumb" cdnthumbaeskey="quote_thumb_key" length="66" cdnthumbwidth="180" cdnthumbheight="102" md5="quote_md5"></img></msg>';

describe("MediaService", () => {
  let storageDir: string;

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), "gewehub-media-"));
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("FILE_STORAGE_DIR", storageDir);
  });

  afterEach(() => {
    rmSync(storageDir, { force: true, recursive: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("为消息里的顶层媒体节点创建资产和 download_media 任务", async () => {
    const prisma = {
      mediaAsset: {
        upsert: vi.fn(async () => ({ id: "asset_1" })),
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_1" })),
      },
    };
    const service = new MediaService(prisma as never, {} as never);

    const count = await service.enqueueMessageMedia({
      appId: "wx_app",
      message: {
        id: "message_row_1",
        accountId: "account_1",
        payload: imageEnvelope(),
      },
      rawContent: "<msg><img /></msg>",
      rawMsgId: "123",
    });

    expect(count).toBe(1);
    expect(prisma.mediaAsset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messageId_nodePath: {
            messageId: "message_row_1",
            nodePath: "content.media",
          },
        },
        create: expect.objectContaining({
          accountId: "account_1",
          messageId: "message_row_1",
          kind: "image",
          status: "pending",
          sourcePayload: {
            appId: "wx_app",
            kind: "image",
            msgId: "123",
            rawContent: "<msg><img /></msg>",
          },
        }),
      }),
    );
    expect(prisma.outboxTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskType: "download_media",
        refId: "asset_1",
        maxRetry: 3,
      }),
    });
  });

  it("为 chat_record 条目里的媒体节点递归创建资产和 download_media 任务", async () => {
    const prisma = {
      mediaAsset: {
        upsert: vi.fn(
          async (args: {
            where: { messageId_nodePath: { nodePath: string } };
          }) => ({
            id:
              args.where.messageId_nodePath.nodePath ===
              "content.items[0].media"
                ? "asset_item_0"
                : "asset_other",
          }),
        ),
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_1" })),
      },
    };
    const service = new MediaService(prisma as never, {} as never);

    const count = await service.enqueueMessageMedia({
      appId: "wx_app",
      message: {
        id: "message_row_1",
        accountId: "account_1",
        payload: chatRecordWithItemMediaEnvelope(),
      },
      rawContent: chatRecordRawContent,
      rawMsgId: "123",
    });

    expect(count).toBe(1);
    expect(prisma.mediaAsset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messageId_nodePath: {
            messageId: "message_row_1",
            nodePath: "content.items[0].media",
          },
        },
        create: expect.objectContaining({
          accountId: "account_1",
          messageId: "message_row_1",
          nodePath: "content.items[0].media",
          kind: "image",
          status: "pending",
          sourcePayload: {
            appId: "wx_app",
            kind: "image",
            msgId: "123",
            method: "forwarded_cdn",
            rawContent: chatRecordItemImageXml,
            aesKey: "data_key",
            fileId: "cdn_data",
            type: "1",
            totalSize: "88",
            suffix: "jpg",
          },
        }),
      }),
    );
    expect(prisma.outboxTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskType: "download_media",
        refId: "asset_item_0",
        maxRetry: 3,
      }),
    });
  });

  it("为嵌套 chat_record 条目里的媒体节点创建条目级下载源", async () => {
    const prisma = {
      mediaAsset: {
        upsert: vi.fn(
          async (args: {
            where: { messageId_nodePath: { nodePath: string } };
          }) => ({
            id:
              args.where.messageId_nodePath.nodePath ===
              "content.items[0].items[0].media"
                ? "asset_nested_item_0"
                : "asset_other",
          }),
        ),
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_1" })),
      },
    };
    const service = new MediaService(prisma as never, {} as never);

    const count = await service.enqueueMessageMedia({
      appId: "wx_app",
      message: {
        id: "message_row_1",
        accountId: "account_1",
        payload: nestedChatRecordWithItemMediaEnvelope(),
      },
      rawContent: nestedChatRecordRawContent,
      rawMsgId: "123",
    });

    expect(count).toBe(1);
    expect(prisma.mediaAsset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messageId_nodePath: {
            messageId: "message_row_1",
            nodePath: "content.items[0].items[0].media",
          },
        },
        create: expect.objectContaining({
          nodePath: "content.items[0].items[0].media",
          sourcePayload: {
            aesKey: "nested_data_key",
            appId: "wx_app",
            fileId: "nested_cdn_data",
            kind: "image",
            method: "forwarded_cdn",
            msgId: "123",
            rawContent: nestedChatRecordItemImageXml,
            suffix: "jpg",
            totalSize: "77",
            type: "1",
          },
        }),
      }),
    );
    expect(prisma.outboxTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskType: "download_media",
        refId: "asset_nested_item_0",
        maxRetry: 3,
      }),
    });
  });

  it("为 chat_record 条目引用里的媒体节点保留对象形态 refermsgitem.content 下载 XML", async () => {
    const prisma = {
      mediaAsset: {
        upsert: vi.fn(async (args: { where: { messageId_nodePath: { nodePath: string } } }) => ({
          id: args.where.messageId_nodePath.nodePath === "content.items[0].quote.media" ? "asset_quote_item_0" : "asset_other",
        })),
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_1" })),
      },
    };
    const service = new MediaService(prisma as never, {} as never);

    const count = await service.enqueueMessageMedia({
      appId: "wx_app",
      message: {
        id: "message_row_1",
        accountId: "account_1",
        payload: {
          ...imageEnvelope(),
          content: {
            type: "chat_record",
            text: "群聊的聊天记录",
            items: [
              {
                type: "text",
                text: "free",
                quote: {
                  type: "image",
                  text: "[图片]",
                  media: { status: "pending", url: null },
                },
              },
            ],
          },
        },
      },
      rawContent: chatRecordItemQuoteImageRawContent,
      rawMsgId: "123",
    });

    expect(count).toBe(1);
    expect(prisma.mediaAsset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messageId_nodePath: {
            messageId: "message_row_1",
            nodePath: "content.items[0].quote.media",
          },
        },
        create: expect.objectContaining({
          nodePath: "content.items[0].quote.media",
          sourcePayload: {
            appId: "wx_app",
            kind: "image",
            msgId: "123",
            rawContent: chatRecordItemQuoteImageXml,
          },
        }),
      }),
    );
  });

  it("下载 GeWe 临时 URL，落盘后把消息 media 回写成 Hub 签名 URL", async () => {
    const payload = imageEnvelope();
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_1",
          accountId: "account_1",
          messageId: "message_row_1",
          nodePath: "content.media",
          kind: "image",
          sourcePayload: {
            appId: "wx_app",
            kind: "image",
            msgId: "123",
            rawContent: "<msg><img /></msg>",
          },
          message: {
            id: "message_row_1",
            conversationId: "conv_1",
            messageId: "msg_1",
            payload,
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
      },
      message: {
        update: vi.fn(async (_args: unknown) => ({})),
      },
    };
    const gewe = {
      downloadMedia: vi.fn(async () => ({
        fileUrl: "https://download.example/image.jpg",
      })),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
            status: 200,
          }),
      ),
    );
    const adminEvents = {
      publishMessageChanged: vi.fn(),
    };
    const service = new MediaService(prisma as never, gewe as never, undefined, undefined, adminEvents as never);

    await service.downloadMediaAsset("asset_1");

    expect(gewe.downloadMedia).toHaveBeenCalledWith({
      appId: "wx_app",
      kind: "image",
      msgId: "123",
      rawContent: "<msg><img /></msg>",
    });
    expect(prisma.mediaAsset.update.mock.calls.length).toBeGreaterThan(0);
    const assetUpdate = prisma.mediaAsset.update.mock.calls.at(-1)![0] as {
      data: { localPath: string };
    };
    expect(assetUpdate).toEqual({
      where: { id: "asset_1" },
      data: expect.objectContaining({
        status: "ready",
        mimeType: "image/jpeg",
        publicUrl: expect.stringMatching(
          /^http:\/\/localhost:3000\/files\/asset_1\?exp=\d+&sig=/,
        ),
      }),
    });
    const localPath = assetUpdate.data.localPath as string;
    expect(readFileSync(localPath)).toEqual(Buffer.from([1, 2, 3]));
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "message_row_1" },
      data: expect.objectContaining({
        payload: expect.objectContaining({
          content: expect.objectContaining({
            media: expect.objectContaining({
              status: "ready",
              url: expect.stringMatching(
                /^http:\/\/localhost:3000\/files\/asset_1\?exp=\d+&sig=/,
              ),
              mimeType: "image/jpeg",
            }),
          }),
        }),
        renderedText: "[图片]",
      }),
    });
    expect(adminEvents.publishMessageChanged).toHaveBeenCalledWith({
      eventType: "message.updated",
      conversationId: "conv_1",
      messageId: "msg_1",
    });
  });

  it("GeWe 下载响应头为错误 octst-stream 时按 URL 纠正图片 MIME", async () => {
    const payload = imageEnvelope();
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_1",
          accountId: "account_1",
          messageId: "message_row_1",
          nodePath: "content.media",
          kind: "image",
          sourcePayload: {
            appId: "wx_app",
            kind: "image",
            msgId: "123",
            rawContent: "<msg><img /></msg>",
          },
          message: {
            id: "message_row_1",
            conversationId: "conv_1",
            messageId: "msg_1",
            payload,
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
      },
      message: {
        update: vi.fn(async (_args: unknown) => ({})),
      },
    };
    const gewe = {
      downloadMedia: vi.fn(async () => ({
        fileUrl: "https://download.example/image.jpg?token=1",
      })),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "application/octst-stream" },
            status: 200,
          }),
      ),
    );
    const service = new MediaService(prisma as never, gewe as never);

    await service.downloadMediaAsset("asset_1");

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: "asset_1" },
      data: expect.objectContaining({
        mimeType: "image/jpeg",
      }),
    });
  });

  it("语音媒体下载后先转成 MP3 再落盘并回写 audio/mpeg", async () => {
    const payload: MessageEnvelope = {
      ...imageEnvelope(),
      content: {
        type: "voice",
        text: "[语音]",
        media: { status: "pending", url: null, durationMs: 3200 },
      },
    };
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_voice",
          accountId: "account_1",
          messageId: "message_row_1",
          nodePath: "content.media",
          kind: "voice",
          sourcePayload: {
            appId: "wx_app",
            kind: "voice",
            msgId: "123",
            rawContent: "<msg><voicemsg /></msg>",
          },
          message: {
            id: "message_row_1",
            conversationId: "conv_1",
            messageId: "msg_1",
            payload,
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
      },
      message: {
        update: vi.fn(async (_args: unknown) => ({})),
      },
    };
    const gewe = {
      downloadMedia: vi.fn(async () => ({
        fileUrl: "https://download.example/voice.silk",
      })),
    };
    const audioTranscode = {
      transcodeVoiceToMp3: vi.fn(async (bytes: Buffer) => Buffer.from([...bytes, 9])),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "application/octet-stream" },
            status: 200,
          }),
      ),
    );
    const service = new MediaService(
      prisma as never,
      gewe as never,
      undefined,
      audioTranscode as never,
    );

    await service.downloadMediaAsset("asset_voice");

    expect(audioTranscode.transcodeVoiceToMp3).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.objectContaining({
        sourceMimeType: "audio/silk",
        sourceFileName: undefined,
      }),
    );
    const assetUpdate = prisma.mediaAsset.update.mock.calls.at(-1)![0] as {
      data: { localPath: string };
    };
    expect(assetUpdate).toEqual({
      where: { id: "asset_voice" },
      data: expect.objectContaining({
        status: "ready",
        mimeType: "audio/mpeg",
        size: 4,
      }),
    });
    expect(assetUpdate.data.localPath.endsWith(".mp3")).toBe(true);
    expect(readFileSync(assetUpdate.data.localPath)).toEqual(Buffer.from([1, 2, 3, 9]));
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "message_row_1" },
      data: expect.objectContaining({
        payload: expect.objectContaining({
          content: expect.objectContaining({
            media: expect.objectContaining({
              status: "ready",
              mimeType: "audio/mpeg",
              size: 4,
            }),
          }),
        }),
        renderedText: "[语音]",
      }),
    });
  });

  it("语音下载响应缺少 MIME 和扩展名时按 GeWe Silk 源处理", async () => {
    const payload: MessageEnvelope = {
      ...imageEnvelope(),
      content: {
        type: "voice",
        text: "[语音]",
        media: { status: "pending", url: null, durationMs: 1800 },
      },
    };
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_voice_no_ext",
          accountId: "account_1",
          messageId: "message_row_1",
          nodePath: "content.media",
          kind: "voice",
          sourcePayload: {
            appId: "wx_app",
            kind: "voice",
            msgId: "123",
            rawContent: "<msg><voicemsg /></msg>",
          },
          message: {
            id: "message_row_1",
            payload,
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
      },
      message: {
        update: vi.fn(async (_args: unknown) => ({})),
      },
    };
    const gewe = {
      downloadMedia: vi.fn(async () => ({
        fileUrl: "https://download.example/temporary-voice",
      })),
    };
    const audioTranscode = {
      transcodeVoiceToMp3: vi.fn(async (bytes: Buffer) => Buffer.from([...bytes, 9])),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "application/octet-stream" },
            status: 200,
          }),
      ),
    );
    const service = new MediaService(
      prisma as never,
      gewe as never,
      undefined,
      audioTranscode as never,
    );

    await service.downloadMediaAsset("asset_voice_no_ext");

    expect(audioTranscode.transcodeVoiceToMp3).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.objectContaining({
        sourceMimeType: "audio/silk",
      }),
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: "asset_voice_no_ext" },
      data: expect.objectContaining({
        mimeType: "audio/mpeg",
        status: "ready",
      }),
    });
  });

  it("下载完成后按 nodePath 回写 chat_record 条目媒体", async () => {
    const payload = chatRecordWithItemMediaEnvelope();
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_item_0",
          accountId: "account_1",
          messageId: "message_row_1",
          nodePath: "content.items[0].media",
          kind: "image",
          sourcePayload: {
            appId: "wx_app",
            kind: "image",
            msgId: "123",
            rawContent: "<msg><appmsg><recorditem /></appmsg></msg>",
          },
          message: {
            id: "message_row_1",
            payload,
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
      },
      message: {
        update: vi.fn(async (_args: unknown) => ({})),
      },
    };
    const gewe = {
      downloadMedia: vi.fn(async () => ({
        fileUrl: "https://download.example/item-image.png",
      })),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([4, 5, 6, 7]), {
            headers: { "content-type": "image/png" },
            status: 200,
          }),
      ),
    );
    const service = new MediaService(prisma as never, gewe as never);

    await service.downloadMediaAsset("asset_item_0");

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "message_row_1" },
      data: expect.objectContaining({
        payload: expect.objectContaining({
          content: expect.objectContaining({
            items: [
              expect.objectContaining({
                media: expect.objectContaining({
                  status: "ready",
                  url: expect.stringMatching(
                    /^http:\/\/localhost:3000\/files\/asset_item_0\?exp=\d+&sig=/,
                  ),
                  mimeType: "image/png",
                  size: 4,
                }),
              }),
              { type: "text", text: "后续文本" },
            ],
          }),
        }),
        renderedText: "[聊天记录] 群聊的聊天记录",
      }),
    });
  });

  it("同一消息仍有 pending 媒体时不会提前投递", async () => {
    const payload = chatRecordWithItemMediaEnvelope();
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_item_0",
          accountId: "account_1",
          messageId: "message_row_1",
          nodePath: "content.items[0].media",
          kind: "image",
          sourcePayload: {
            appId: "wx_app",
            kind: "image",
            msgId: "123",
            rawContent: "<msg><appmsg><recorditem /></appmsg></msg>",
          },
          message: {
            id: "message_row_1",
            payload,
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
        count: vi.fn(async () => 1),
      },
      message: {
        update: vi.fn(async (_args: unknown) => ({})),
        findUnique: vi.fn(async () => ({
          id: "message_row_1",
          conversation: { app: null },
        })),
      },
    };
    const gewe = {
      downloadMedia: vi.fn(async () => ({
        fileUrl: "https://download.example/item-image.png",
      })),
    };
    const delivery = {
      createForMessage: vi.fn(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([4, 5, 6, 7]), {
            headers: { "content-type": "image/png" },
            status: 200,
          }),
      ),
    );
    const service = new MediaService(
      prisma as never,
      gewe as never,
      delivery as never,
    );

    await service.downloadMediaAsset("asset_item_0");

    expect(prisma.mediaAsset.count).toHaveBeenCalledWith({
      where: {
        messageId: "message_row_1",
        status: "pending",
      },
    });
    expect(delivery.createForMessage).not.toHaveBeenCalled();
  });

  it("下载重试耗尽后按 nodePath 把 chat_record 条目媒体标记 failed 并继续投递", async () => {
    const payload = chatRecordWithItemMediaEnvelope();
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_item_0",
          messageId: "message_row_1",
          nodePath: "content.items[0].media",
          message: {
            id: "message_row_1",
            conversationId: "conv_1",
            messageId: "msg_1",
            payload,
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
        count: vi.fn(async () => 0),
      },
      message: {
        update: vi.fn(async (_args: unknown) => ({})),
        findUnique: vi.fn(async () => ({
          id: "message_file",
          conversation: { app: null },
        })),
      },
    };
    const adminEvents = {
      publishMessageChanged: vi.fn(),
    };
    const service = new MediaService(
      prisma as never,
      {} as never,
      { createForMessage: vi.fn() } as never,
      undefined,
      adminEvents as never,
    );

    await service.markMediaAssetFailedAndDeliver(
      "asset_item_0",
      "download failed",
    );

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "message_row_1" },
      data: expect.objectContaining({
        payload: expect.objectContaining({
          content: expect.objectContaining({
            items: [
              expect.objectContaining({
                media: expect.objectContaining({
                  status: "failed",
                  url: null,
                }),
              }),
              { type: "text", text: "后续文本" },
            ],
          }),
        }),
        renderedText: "[聊天记录] 群聊的聊天记录",
      }),
    });
    expect(adminEvents.publishMessageChanged).toHaveBeenCalledWith({
      eventType: "message.updated",
      conversationId: "conv_1",
      messageId: "msg_1",
    });
  });

  it("下载重试耗尽后把顶层文件消息摘要改为下载失败并继续投递", async () => {
    const payload = fileEnvelope();
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_file",
          messageId: "message_file",
          nodePath: "content.media",
          message: {
            id: "message_file",
            payload,
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
        count: vi.fn(async () => 0),
      },
      message: {
        update: vi.fn(async (_args: unknown) => ({})),
        findUnique: vi.fn(async () => ({
          id: "message_file",
          conversation: { app: null },
        })),
      },
    };
    const delivery = { createForMessage: vi.fn() };
    const service = new MediaService(
      prisma as never,
      {} as never,
      delivery as never,
    );

    await service.markMediaAssetFailedAndDeliver(
      "asset_file",
      "download failed",
    );

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "message_file" },
      data: {
        payload: expect.objectContaining({
          content: expect.objectContaining({
            text: "[文件: mapping_app.txt] 下载失败",
            media: expect.objectContaining({
              status: "failed",
              url: null,
            }),
          }),
          renderedText: "[文件: mapping_app.txt] 下载失败",
        }),
        renderedText: "[文件: mapping_app.txt] 下载失败",
      },
    });
    expect(delivery.createForMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message_file" }),
    );
  });

  it("人工重试旧的 chat_record 条目图片资产时重新解析 forwarded_cdn 下载源", async () => {
    const payload = chatRecordWithItemMediaEnvelope();
    const rawPayload = {
      Appid: "wx_app",
      Data: {
        MsgId: "123",
        NewMsgId: "456",
        Content: { string: chatRecordRawContent },
      },
    };
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({
          id: "asset_item_0",
          accountId: "account_1",
          messageId: "message_row_1",
          nodePath: "content.items[0].media",
          kind: "image",
          sourcePayload: {
            appId: "wx_app",
            kind: "image",
            msgId: "123",
            rawContent: chatRecordItemImageXml,
          },
          message: {
            id: "message_row_1",
            rawMessageId: "123",
            payload,
            webhookEvent: {
              rawPayload,
            },
          },
        })),
        update: vi.fn(async (_args: unknown) => ({})),
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_retry" })),
      },
    };
    const service = new MediaService(prisma as never, {} as never);

    await service.retryDownload("asset_item_0");

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: "asset_item_0" },
      data: {
        status: "pending",
        errorMessage: null,
        sourcePayload: {
          appId: "wx_app",
          kind: "image",
          msgId: "123",
          method: "forwarded_cdn",
          rawContent: chatRecordItemImageXml,
          aesKey: "data_key",
          fileId: "cdn_data",
          type: "1",
          totalSize: "88",
          suffix: "jpg",
        },
      },
    });
    expect(prisma.outboxTask.create).toHaveBeenCalledWith({
      data: {
        taskType: "download_media",
        refId: "asset_item_0",
        payload: { mediaAssetId: "asset_item_0", manualRetry: true },
        maxRetry: 3,
        priority: 30,
      },
    });
  });

  it("发送前将上传图片写入 outbound 存储并生成签名 URL", async () => {
    const service = new MediaService({} as never, {} as never);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAABAAAAAQBPJcTWAAAADElEQVR4nGP8x8AAAAMCAQBFsWYPAAAAAElFTkSuQmCC",
      "base64",
    );

    const prepared = await service.prepareOutboundFile({
      accountId: "account_1",
      conversationId: "conversation_1",
      kind: "image",
      contentBase64: bytes.toString("base64"),
      mimeType: "image/png",
      fileName: "screenshot.png",
    });

    expect(prepared.url).toContain("http://localhost:3000/files/outbound/out_");
    expect(prepared.mimeType).toBe("image/png");
    expect(prepared.fileName).toBe("screenshot.png");
    expect(prepared.size).toBeGreaterThan(0);
    expect(readFileSync(prepared.path).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    await expect(service.getOutboundFile(prepared.id)).resolves.toEqual(
      expect.objectContaining({
        mimeType: "image/png",
        fileName: "screenshot.png",
        size: prepared.size,
      }),
    );
  });

  it("发送前会把 JPEG 图片标准化，移除 JUMBF/C2PA 元数据", async () => {
    const service = new MediaService({} as never, {} as never);
    const bytes = Buffer.from(
      "/9j/6wAcanVtYgAAAB5qdW1kYzJwYQB0ZXN0LWMycGH/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABgcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAIAAgDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCLAE1/f//Z",
      "base64",
    );

    const prepared = await service.prepareOutboundFile({
      accountId: "account_1",
      conversationId: "conversation_1",
      kind: "image",
      contentBase64: bytes.toString("base64"),
      mimeType: "image/jpeg",
      fileName: "generated.jpg",
    });
    const written = readFileSync(prepared.path);

    expect(prepared.mimeType).toBe("image/jpeg");
    expect(prepared.fileName).toBe("generated.jpg");
    expect(written.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(written.includes(Buffer.from("jumb"))).toBe(false);
    expect(written.includes(Buffer.from("c2pa"))).toBe(false);
  });

  it("服务重启后仍可按 outbound 文件 ID 从磁盘读取出站文件", async () => {
    const service = new MediaService({} as never, {} as never);
    const bytes = Buffer.from("hello outbound");
    const prepared = await service.prepareOutboundFile({
      accountId: "account_1",
      conversationId: "conversation_1",
      kind: "file",
      contentBase64: bytes.toString("base64"),
      mimeType: "text/plain",
      fileName: "note.txt",
    });
    vi.resetModules();
    const { MediaService: FreshMediaService } = await import("../src/modules/media/media.service.js");
    const restartedService = new FreshMediaService({} as never, {} as never);

    await expect(restartedService.getOutboundFile(prepared.id)).resolves.toEqual(
      expect.objectContaining({
        path: prepared.path,
        mimeType: "text/plain",
        fileName: "note.txt",
        size: bytes.byteLength,
      }),
    );
  });
});
