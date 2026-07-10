import { UnauthorizedException } from "@nestjs/common";
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendController } from "../src/modules/send/send.controller.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn()
}));

function mockLookupAll(addresses: LookupAddress[]) {
  vi.mocked(lookup).mockResolvedValue(addresses as never);
}

describe("SendController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("带无效应用 Bearer token 的发送请求必须拒绝", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      conversation: {
        findUniqueOrThrow: vi.fn()
      },
      sendRequest: {
        create: vi.fn()
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await expect(
      controller.send("Bearer invalid-token", {
        conversationId: "conversation_1",
        executionMode: "async",
        type: "text",
        text: "hello"
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.conversation.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.sendRequest.create).not.toHaveBeenCalled();
  });

  it("创建发送请求后排入 send outbox，不在 HTTP 请求内直接调用 GeWe", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn()
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        create: vi.fn(async () => ({
          id: "send_1",
          status: "pending"
        }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_1" }))
      }
    };
    const gewe = {
      sendText: vi.fn()
    };
    const controller = new SendController(prisma as never, {} as never);

    const result = await controller.send(undefined, {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "text",
      text: "hello"
    });

    expect(result).toMatchObject({ success: true, accepted: true });
    expect(gewe.sendText).not.toHaveBeenCalled();
    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: "account_1",
        conversationId: "conversation_1",
        deliveryMode: "immediate",
        executionMode: "async",
        type: "text",
        status: "pending",
        geweRequest: {
          path: "/gewe/v2/api/message/postText",
          body: {
            appId: "wx_app",
            toWxid: "wxid_target",
            content: "hello"
          }
        }
      })
    });
    expect(prisma.outboxTask.create).toHaveBeenCalledWith({
      data: {
        taskType: "send",
        refId: "send_1",
        payload: { sendRequestId: "send_1" },
        status: "pending",
        priority: 40
      }
    });
  });


  it("默认同步等待发送完成并返回稳定 messageId", async () => {
    const prisma = {
      hubApp: { findUnique: vi.fn() },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1", accountId: "account_1", peerWxid: "wxid_target",
          account: { appId: "wx_app", wxid: "wxid_bot" }
        })),
        update: vi.fn(async () => ({}))
      },
      sendRequest: { create: vi.fn(async () => ({ id: "send_sync", status: "pending" })) },
      message: { create: vi.fn(async () => ({})) },
      outboxTask: { create: vi.fn(async () => ({})) }
    };
    Object.assign(prisma, { $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)) });
    const outbox = { waitForSend: vi.fn(async () => ({})), wake: vi.fn() };
    const controller = new SendController(prisma as never, {} as never, undefined, undefined, outbox as never);

    const result = await controller.send(undefined, { conversationId: "conversation_1", type: "text", text: "同步" });

    expect(result).toMatchObject({ success: true, messageId: expect.stringMatching(/^msg_[A-Za-z0-9_-]{22}$/) });
    expect(result).not.toHaveProperty("accepted");
    expect(outbox.waitForSend).toHaveBeenCalledWith("send_sync", 60_000);
  });
  it("deliveryMode=discard 与 confirm 当前都创建 held，但保留原始策略", async () => {
    for (const deliveryMode of ["discard", "confirm"] as const) {
      const prisma = {
        hubApp: { findUnique: vi.fn() },
        conversation: {
          findUniqueOrThrow: vi.fn(async () => ({ id: "conversation_1", accountId: "account_1", peerWxid: "wxid_target", account: { appId: "wx_app", wxid: "wxid_bot" } })),
          update: vi.fn(async () => ({}))
        },
        sendRequest: { create: vi.fn(async () => ({ id: `send_${deliveryMode}`, status: "held", deliveryMode })) },
        message: { create: vi.fn(async ({ data }) => data) },
        outboxTask: { create: vi.fn() }
      };
      Object.assign(prisma, { $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)) });
      const controller = new SendController(prisma as never, {} as never);

      const result = await controller.send(undefined, { conversationId: "conversation_1", type: "text", text: deliveryMode, deliveryMode });

      expect(result).toMatchObject({ success: true, messageId: expect.stringMatching(/^msg_/) });
      expect(prisma.sendRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ deliveryMode, status: "held" }) });
      expect(prisma.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isSent: false }) });
      expect(prisma.outboxTask.create).not.toHaveBeenCalled();
    }
  });

  it("人工发送 held 请求时原子切换为 pending 并只创建一条 outbox", async () => {
    const prisma = {
      sendRequest: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: vi.fn()
          .mockResolvedValueOnce({ status: "held", deliveryMode: "confirm" })
          .mockResolvedValueOnce({ id: "send_held", status: "pending", deliveryMode: "confirm", message: { messageId: "msg_stable" } }),
        update: vi.fn()
      },
      outboxTask: { create: vi.fn(async () => ({ id: "task_held" })) }
    };
    Object.assign(prisma, { $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)) });
    const controller = new SendController(prisma as never, {} as never);

    const result = await controller.dispatch("send_held");

    expect(result).toEqual({ success: true, messageId: "msg_stable", accepted: true });
    expect(prisma.sendRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "send_held", status: "held", deliveryMode: "confirm" },
      data: { status: "pending", errorMessage: null }
    });
    expect(prisma.outboxTask.create).toHaveBeenCalledTimes(1);
  });

  it("支持使用标准消息里的 cvs 会话 ID 创建发送请求", async () => {
    const notFound = Object.assign(new Error("conversation not found"), { code: "P2025" });
    const prisma = {
      hubApp: {
        findUnique: vi.fn(async () => ({ id: "app_1", status: "active" }))
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => {
          throw notFound;
        }),
        findUnique: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_lnop8pc2ivre22",
          account: {
            appId: "wx_app",
            wxid: "wxid_mngndogkpyms22"
          }
        }))
      },
      wechatAccount: {
        findMany: vi.fn(async () => [{ id: "account_1", wxid: "wxid_mngndogkpyms22" }])
      },
      sendRequest: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "send_1",
          status: "pending"
        }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_1" }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    const result = await controller.send("Bearer app_token", {
      conversationId: "cvs_wxid_mngndogkpyms22_wxid_lnop8pc2ivre22",
      executionMode: "async",
      type: "text",
      text: "hello"
    });

    expect(result).toMatchObject({ success: true, accepted: true, messageId: expect.stringMatching(/^msg_/) });
    expect(prisma.wechatAccount.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        wxid: true
      }
    });
    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: {
        accountId_peerWxid: {
          accountId: "account_1",
          peerWxid: "wxid_lnop8pc2ivre22"
        }
      },
      include: { account: true }
    });
    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: "account_1",
        conversationId: "conversation_1",
        type: "text",
        geweRequest: {
          path: "/gewe/v2/api/message/postText",
          body: {
            appId: "wx_app",
            toWxid: "wxid_lnop8pc2ivre22",
            content: "hello"
          }
        }
      })
    });
  });

  it("创建文本引用发送请求时查同会话原消息并生成 GeWe appmsg", async () => {
    const rawContent = "<msg><appmsg><title>mapping_app.txt</title><type>6</type></appmsg></msg>";
    const prisma = {
      hubApp: {
        findUnique: vi.fn()
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      message: {
        findFirst: vi.fn(async () => ({
          messageId: "msg_478238581151300365",
          platformNewMsgId: "478238581151300365",
          senderWxid: "wxid_sender",
          sentAt: new Date("2026-07-09T10:11:12.000Z"),
          payload: {
            sender: { wxid: "wxid_sender", name: "陈可乐" },
            content: {
              type: "file",
              text: "[文件] mapping_app.txt",
              media: { status: "ready", fileName: "mapping_app.txt" }
            }
          },
          webhookEvent: {
            rawPayload: {
              Data: {
                Content: rawContent
              }
            }
          }
        }))
      },
      sendRequest: {
        create: vi.fn(async () => ({
          id: "send_quote",
          status: "pending"
        }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_quote" }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.send(undefined, {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "text",
      text: "这个我看过了",
      replyToMessageId: "msg_478238581151300365"
    });

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: "conversation_1",
        messageId: "msg_478238581151300365"
      },
      include: {
        webhookEvent: {
          select: { rawPayload: true }
        }
      }
    });
    expect(prisma.sendRequest.create).toHaveBeenCalled();
    const createArg = (prisma.sendRequest.create.mock.calls as unknown as Array<[{
      data: {
        requestPayload: unknown;
        geweRequest: { path: string; body: { appmsg: string } };
      };
    }]>)[0][0];
    expect(createArg.data.requestPayload).toMatchObject({
      replyToMessageId: "msg_478238581151300365",
      quote: {
        messageId: "msg_478238581151300365",
        platformNewMsgId: "478238581151300365",
        senderName: "陈可乐",
        rawContent
      }
    });
    expect(createArg.data.geweRequest.path).toBe("/gewe/v2/api/message/postAppMsg");
    expect(createArg.data.geweRequest.body.appmsg).toContain("&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;mapping_app.txt");
  });


  it("重复的同步幂等请求仍等待原发送完成，不把 pending 当成功", async () => {
    const prisma = {
      hubApp: { findUnique: vi.fn(async () => ({ id: "app_1", status: "active" })) },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1", accountId: "account_1", peerWxid: "wxid_target",
          account: { appId: "wx_app", wxid: "wxid_bot" }
        }))
      },
      sendRequest: {
        findFirst: vi.fn(async () => ({
          id: "send_existing_sync", status: "pending", deliveryMode: "immediate", executionMode: "sync",
          message: { messageId: "msg_existing_sync", payload: {} }
        })),
        create: vi.fn()
      }
    };
    const outbox = { waitForSend: vi.fn(async () => ({ url: "https://cdn.example/result" })), wake: vi.fn() };
    const controller = new SendController(prisma as never, {} as never, undefined, undefined, outbox as never);

    const result = await controller.send("Bearer app_token", {
      conversationId: "conversation_1", type: "text", text: "hello", idempotencyKey: "idem_sync"
    });

    expect(outbox.waitForSend).toHaveBeenCalledWith("send_existing_sync", 60_000);
    expect(result).toEqual({ success: true, messageId: "msg_existing_sync", url: "https://cdn.example/result" });
    expect(prisma.sendRequest.create).not.toHaveBeenCalled();
  });
  it("应用发送请求携带幂等键时复用已有发送记录，不重复排入 outbox", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn(async () => ({ id: "app_1", status: "active" }))
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        findFirst: vi.fn(async () => ({
          id: "send_existing",
          status: "pending",
          executionMode: "async",
          message: { messageId: "msg_existing" }
        })),
        create: vi.fn()
      },
      outboxTask: {
        create: vi.fn()
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    const result = await controller.send("Bearer app_token", {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "text",
      text: "hello",
      idempotencyKey: "idem_1"
    });

    expect(result).toEqual({ success: true, messageId: "msg_existing", accepted: true });
    expect(prisma.sendRequest.findFirst).toHaveBeenCalledWith({
      where: {
        appId: "app_1",
        conversationId: "conversation_1",
        idempotencyKey: "idem_1"
      },
      orderBy: { createdAt: "desc" },
      include: { message: { select: { messageId: true } } }
    });
    expect(prisma.sendRequest.create).not.toHaveBeenCalled();
    expect(prisma.outboxTask.create).not.toHaveBeenCalled();
  });

  it("重复的 held 幂等请求返回稳定占位消息 ID，不重复创建消息", async () => {
    const prisma = {
      hubApp: { findUnique: vi.fn(async () => ({ id: "app_1", status: "active" })) },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({ id: "conversation_1", accountId: "account_1", peerWxid: "wxid_target", account: { appId: "wx_app", wxid: "wxid_bot" } }))
      },
      sendRequest: {
        findFirst: vi.fn(async () => ({ id: "send_existing_held", status: "held", executionMode: "sync", message: { messageId: "msg_existing_held" } })),
        create: vi.fn()
      },
      message: { create: vi.fn() },
      outboxTask: { create: vi.fn() }
    };
    const controller = new SendController(prisma as never, {} as never);

    const result = await controller.send("Bearer app_token", {
      conversationId: "conversation_1", type: "text", text: "稍后发送", deliveryMode: "confirm", idempotencyKey: "held_1"
    });

    expect(result).toEqual({ success: true, messageId: "msg_existing_held" });
    expect(prisma.sendRequest.create).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.outboxTask.create).not.toHaveBeenCalled();
  });

  it("应用发送请求携带新幂等键时写入普通列供唯一约束保护", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn(async () => ({ id: "app_1", status: "active" }))
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "send_new", status: "pending" }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_send_new" }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.send("Bearer app_token", {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "text",
      text: "hello",
      requestId: "req_1"
    });

    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appId: "app_1",
        conversationId: "conversation_1",
        idempotencyKey: "req_1",
        requestPayload: expect.objectContaining({
          requestId: "req_1",
          idempotencyKey: "req_1"
        })
      })
    });
    expect(prisma.outboxTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskType: "send",
        refId: "send_new"
      })
    });
  });

  it("创建语音发送请求时保留上传音频字段，供 outbox 转 Silk 后发送", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn()
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        create: vi.fn(async () => ({
          id: "send_voice",
          status: "pending"
        }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_voice" }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.send(undefined, {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "voice",
      contentBase64: "UklGRg==",
      mimeType: "audio/webm",
      fileName: "recording.webm",
      durationMs: 2600
    });

    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "voice",
        requestPayload: expect.objectContaining({
          contentBase64: "UklGRg==",
          mimeType: "audio/webm",
          fileName: "recording.webm",
          durationMs: 2600
        }),
        geweRequest: {
          path: "/gewe/v2/api/message/postVoice",
          body: {
            appId: "wx_app",
            toWxid: "wxid_target",
            voiceDuration: 2600,
            source: {
              contentBase64: "UklGRg==",
              mimeType: "audio/webm",
              fileName: "recording.webm"
            }
          }
        }
      })
    });
  });

  it("创建图片发送请求时保留上传图片字段，供 outbox 发布为 GeWe 可访问 URL", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn()
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        create: vi.fn(async () => ({
          id: "send_image",
          status: "pending"
        }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_image" }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.send(undefined, {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "image",
      contentBase64: "iVBORw0KGgo=",
      mimeType: "image/png",
      fileName: "screenshot.png"
    });

    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "image",
        requestPayload: expect.objectContaining({
          contentBase64: "iVBORw0KGgo=",
          mimeType: "image/png",
          fileName: "screenshot.png"
        }),
        geweRequest: {
          path: "/gewe/v2/api/message/postImage",
          body: {
            appId: "wx_app",
            toWxid: "wxid_target",
            source: {
              contentBase64: "iVBORw0KGgo=",
              mimeType: "image/png",
              fileName: "screenshot.png"
            }
          }
        }
      })
    });
  });

  it("创建视频发送请求时保留上传视频和封面字段，供 outbox 发布为 GeWe 可访问 URL", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn()
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        create: vi.fn(async () => ({
          id: "send_video",
          status: "pending"
        }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_video" }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.send(undefined, {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "video",
      contentBase64: "AAAAIGZ0eXA=",
      mimeType: "video/mp4",
      fileName: "clip.mp4",
      thumbContentBase64: "iVBORw0KGgo=",
      thumbMimeType: "image/png",
      thumbFileName: "cover.png",
      durationMs: 10_000
    });

    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "video",
        requestPayload: expect.objectContaining({
          contentBase64: "AAAAIGZ0eXA=",
          thumbContentBase64: "iVBORw0KGgo=",
          thumbMimeType: "image/png",
          thumbFileName: "cover.png"
        }),
        geweRequest: {
          path: "/gewe/v2/api/message/postVideo",
          body: {
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
          }
        }
      })
    });
  });

  it("创建文件发送请求时保留上传文件字段，供 outbox 发布为 GeWe 可访问 URL", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn()
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        create: vi.fn(async () => ({
          id: "send_file",
          status: "pending"
        }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_file" }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.send(undefined, {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "file",
      contentBase64: "SGVsbG8=",
      mimeType: "text/plain",
      fileName: "note.txt"
    });

    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "file",
        requestPayload: expect.objectContaining({
          contentBase64: "SGVsbG8=",
          mimeType: "text/plain",
          fileName: "note.txt"
        }),
        geweRequest: {
          path: "/gewe/v2/api/message/postFile",
          body: {
            appId: "wx_app",
            toWxid: "wxid_target",
            source: {
              contentBase64: "SGVsbG8=",
              mimeType: "text/plain",
              fileName: "note.txt"
            }
          }
        }
      })
    });
  });

  it("创建 HTML 内容发送请求时先托管页面，并在响应里返回公网访问链接", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn(async () => ({ id: "app_1", status: "active" }))
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "send_html",
          status: "pending"
        }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_html" }))
      }
    };
    const htmlPages = {
      resolveForSend: vi.fn(async () => ({
        htmlPublicUrl: "https://gewehub.yunzxu.com/h/html_token",
        htmlPageId: "html_1",
        htmlHosted: true
      })),
      bindSendRequest: vi.fn(async () => undefined)
    };
    const controller = new SendController(prisma as never, {} as never, htmlPages as never);

    const result = await controller.send("Bearer app_token", {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "html",
      title: "日报",
      desc: "今日 AI 日报",
      htmlContent: "<!doctype html><html>report</html>",
      htmlFileName: "report.html",
      idempotencyKey: "html_idem_1"
    });

    expect(htmlPages.resolveForSend).toHaveBeenCalledWith({
      accountId: "account_1",
      conversationId: "conversation_1",
      appId: "app_1",
      title: "日报",
      desc: "今日 AI 日报",
      htmlContent: "<!doctype html><html>report</html>",
      htmlContentBase64: undefined,
      htmlFileName: "report.html",
      linkUrl: undefined
    });
    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "html",
        requestPayload: {
          conversationId: "conversation_1",
          type: "html",
          title: "日报",
          desc: "今日 AI 日报",
          htmlFileName: "report.html",
          idempotencyKey: "html_idem_1",
          htmlPublicUrl: "https://gewehub.yunzxu.com/h/html_token",
          htmlPageId: "html_1",
          htmlHosted: true
        },
        geweRequest: {
          path: "/gewe/v2/api/message/postLink",
          body: {
            appId: "wx_app",
            toWxid: "wxid_target",
            title: "日报",
            desc: "今日 AI 日报",
            linkUrl: "https://gewehub.yunzxu.com/h/html_token"
          }
        }
      })
    });
    expect(htmlPages.bindSendRequest).toHaveBeenCalledWith("html_1", "send_html");
    expect(result).toMatchObject({
      success: true,
      accepted: true,
      messageId: expect.stringMatching(/^msg_/),
      url: "https://gewehub.yunzxu.com/h/html_token"
    });
  });

  it("创建 HTML URL 发送请求时不托管页面，响应返回原始 URL", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn()
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        create: vi.fn(async () => ({ id: "send_html_url", status: "pending" }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_html_url" }))
      }
    };
    const htmlPages = {
      resolveForSend: vi.fn(async () => ({
        htmlPublicUrl: "https://example.com/report.html",
        htmlPageId: null,
        htmlHosted: false
      }))
    };
    const controller = new SendController(prisma as never, {} as never, htmlPages as never);

    const result = await controller.send(undefined, {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "html",
      title: "外部报告",
      desc: "外部页面",
      linkUrl: "https://example.com/report.html"
    });

    expect(htmlPages.resolveForSend).toHaveBeenCalledWith({
      accountId: "account_1",
      conversationId: "conversation_1",
      appId: null,
      title: "外部报告",
      desc: "外部页面",
      htmlContent: undefined,
      htmlContentBase64: undefined,
      htmlFileName: undefined,
      linkUrl: "https://example.com/report.html"
    });
    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "html",
        requestPayload: expect.objectContaining({
          htmlPublicUrl: "https://example.com/report.html",
          htmlPageId: null,
          htmlHosted: false
        })
      })
    });
    expect(result).toMatchObject({
      success: true,
      accepted: true,
      messageId: expect.stringMatching(/^msg_/),
      url: "https://example.com/report.html"
    });
  });

  it("创建 HTML 发送请求缺少标题描述时补默认 link 标题和描述", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn()
      },
      conversation: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "conversation_1",
          accountId: "account_1",
          peerWxid: "wxid_target",
          account: {
            appId: "wx_app",
            wxid: "wxid_bot"
          }
        }))
      },
      sendRequest: {
        create: vi.fn(async () => ({ id: "send_html_defaults", status: "pending" }))
      },
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_html_defaults" }))
      }
    };
    const htmlPages = {
      resolveForSend: vi.fn(async () => ({
        htmlPublicUrl: "https://gewehub.yunzxu.com/h/html_default",
        htmlPageId: "html_default",
        htmlHosted: true
      })),
      bindSendRequest: vi.fn(async () => undefined)
    };
    const controller = new SendController(prisma as never, {} as never, htmlPages as never);

    await controller.send(undefined, {
      conversationId: "conversation_1",
      executionMode: "async",
      type: "html",
      htmlContent: "<html>default</html>"
    });

    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestPayload: expect.objectContaining({
          title: "HTML 页面",
          desc: "https://gewehub.yunzxu.com/h/html_default"
        }),
        geweRequest: expect.objectContaining({
          body: expect.objectContaining({
            title: "HTML 页面",
            desc: "https://gewehub.yunzxu.com/h/html_default"
          })
        })
      })
    });
  });

  it("查询发送记录支持 status、take 和 skip，并只返回列表摘要字段", async () => {
    const prisma = {
      sendRequest: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.list("failed", "50", "20");

    expect(prisma.sendRequest.findMany).toHaveBeenCalledWith({
      where: {
        status: "failed"
      },
      select: {
        id: true,
        appId: true,
        accountId: true,
        conversationId: true,
        idempotencyKey: true,
        deliveryMode: true,
        type: true,
        status: true,
        errorMessage: true,
        executionMode: true,
        createdAt: true,
        updatedAt: true,
        conversation: {
          select: {
            id: true,
            peerWxid: true,
            type: true,
            name: true,
            avatarUrl: true,
            platformRemark: true
          }
        },
        message: {
          select: { messageId: true }
        },
        app: {
          select: {
            id: true,
            name: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50,
      skip: 20
    });
  });

  it("按 ID 查询单条发送记录用于聊天页同步发送结果", async () => {
    const prisma = {
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_failed_file",
          status: "failed",
          errorMessage: "GeWe 文件发送失败"
        }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    const result = await controller.detail("send_failed_file");

    expect(result).toMatchObject({
      id: "send_failed_file",
      status: "failed",
      errorMessage: "GeWe 文件发送失败"
    });
    expect(prisma.sendRequest.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "send_failed_file" },
      include: {
        conversation: true,
        app: true
      }
    });
  });

  it("按 ID 查询单条发送记录包含完整请求和响应 JSON", async () => {
    const prisma = {
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_detail",
          requestPayload: { contentBase64: "large-payload" },
          geweRequest: { path: "/gewe/v2/api/message/postImage" },
          geweResponse: { ret: 200 }
        }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    const result = await controller.detail("send_detail");

    expect(result).toMatchObject({
      id: "send_detail",
      requestPayload: { contentBase64: "large-payload" },
      geweRequest: { path: "/gewe/v2/api/message/postImage" },
      geweResponse: { ret: 200 }
    });
    expect(prisma.sendRequest.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "send_detail" },
      include: {
        conversation: true,
        app: true
      }
    });
  });

  it("解析链接时读取网页标题描述和 og:image", async () => {
    mockLookupAll([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          `
          <html>
            <head>
              <title>页面标题</title>
              <meta name="description" content="页面摘要">
              <meta property="og:image" content="/cover.jpg">
            </head>
          </html>
          `,
          {
            status: 200,
            headers: { "Content-Type": "text/html" }
          }
        )
      )
    );
    const controller = new SendController({} as never, {} as never);

    await expect(controller.linkPreview("https://example.com/article")).resolves.toEqual({
      linkUrl: "https://example.com/article",
      title: "页面标题",
      desc: "页面摘要",
      thumbUrl: "https://example.com/cover.jpg"
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/article",
      expect.objectContaining({
        headers: {
          "User-Agent": "GeWeHub/0.1 link-preview"
        }
      })
    );
  });

  it("解析链接时拒绝 localhost 和内网地址，避免服务端请求伪造", async () => {
    mockLookupAll([{ address: "127.0.0.1", family: 4 }]);
    vi.stubGlobal("fetch", vi.fn());
    const controller = new SendController({} as never, {} as never);

    await expect(controller.linkPreview("https://localhost/admin")).rejects.toThrow("不允许解析内网或本机链接");
    await expect(controller.linkPreview("https://example.com/private")).rejects.toThrow("不允许解析内网或本机链接");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("解析链接只接受 HTML 且限制读取大小", async () => {
    mockLookupAll([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
        .mockResolvedValueOnce(
          new Response("<html><head><title>oversized</title></head></html>", {
            status: 200,
            headers: { "Content-Type": "text/html", "Content-Length": String(2 * 1024 * 1024) }
          })
        )
    );
    const controller = new SendController({} as never, {} as never);

    await expect(controller.linkPreview("https://example.com/api")).rejects.toThrow("链接解析仅支持 HTML 页面");
    await expect(controller.linkPreview("https://example.com/big")).rejects.toThrow("链接页面过大");
  });

  it("取消发送请求时终止关联 send outbox，避免继续自动重试", async () => {
    const prisma = {
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({ status: "failed" })),
        update: vi.fn(async () => ({
          id: "send_cancel",
          status: "failed",
          errorMessage: "用户已取消后续发送重试"
        }))
      },
      outboxTask: {
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    const result = await controller.cancel("send_cancel");

    expect(result).toMatchObject({
      id: "send_cancel",
      status: "failed",
      errorMessage: "用户已取消后续发送重试"
    });
    expect(prisma.sendRequest.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "send_cancel" },
      select: { status: true }
    });
    expect(prisma.outboxTask.updateMany).toHaveBeenCalledWith({
      where: {
        taskType: "send",
        refId: "send_cancel",
        status: { in: ["pending", "running", "failed"] }
      },
      data: {
        status: "dead",
        nextRetryAt: null,
        leaseUntil: null,
        lastError: "用户已取消后续发送重试"
      }
    });
    expect(prisma.sendRequest.update).toHaveBeenCalledWith({
      where: { id: "send_cancel" },
      data: {
        status: "failed",
        errorMessage: "用户已取消后续发送重试"
      }
    });
  });

  it.each([
    ["success", "sent"],
    ["in_progress", "pending"],
    ["sent", "sent"],
    ["pending", "pending"]
  ])("查询发送记录时将状态分面 %s 映射为 Prisma status 条件", async (status, expectedStatus) => {
    const prisma = {
      sendRequest: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.list(status, undefined, undefined);

    expect(prisma.sendRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: expectedStatus
        }
      })
    );
  });

  it("查询发送记录 take 上限为 200", async () => {
    const prisma = {
      sendRequest: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new SendController(prisma as never, {} as never);

    await controller.list(undefined, "999", undefined);

    expect(prisma.sendRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200
      })
    );
  });
});
