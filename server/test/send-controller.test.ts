import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SendController } from "../src/modules/send/send.controller.js";

describe("SendController", () => {
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
      type: "text",
      text: "hello"
    });

    expect(result).toEqual({ id: "send_1", status: "pending" });
    expect(gewe.sendText).not.toHaveBeenCalled();
    expect(prisma.sendRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: "account_1",
        conversationId: "conversation_1",
        type: "text",
        status: "pending",
        geweRequest: {
          path: "/gewe/v2/api/message/postText",
          body: {
            appId: "wx_app",
            toWxid: "wxid_target",
            content: "hello",
            ats: []
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

  it("撤回已发送消息时用三件套调用 GeWe，并把本地 hub_send 消息标记为已撤回", async () => {
    const prisma = {
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_1",
          status: "sent",
          resultMsgId: "769533801",
          resultNewMsgId: "5271007655758710001",
          resultCreateTime: "1704163145",
          geweResponse: { ret: 200, msg: "发送成功" },
          conversation: {
            peerWxid: "wxid_target",
            account: {
              appId: "wx_app"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({
          id: "send_1",
          status: "sent"
        }))
      },
      message: {
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };
    const gewe = {
      revokeMessage: vi.fn(async () => ({ ret: 200, msg: "操作成功" }))
    };
    const controller = new SendController(prisma as never, gewe as never);

    await controller.revoke("send_1");

    expect(gewe.revokeMessage).toHaveBeenCalledWith({
      appId: "wx_app",
      toWxid: "wxid_target",
      msgId: "769533801",
      newMsgId: "5271007655758710001",
      createTime: "1704163145"
    });
    expect(prisma.sendRequest.update).toHaveBeenCalledWith({
      where: { id: "send_1" },
      data: expect.objectContaining({
        geweResponse: {
          ret: 200,
          msg: "发送成功",
          revoke: { ret: 200, msg: "操作成功" }
        }
      })
    });
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { sendRequestId: "send_1" },
      data: expect.objectContaining({
        status: "revoked",
        revokedAt: expect.any(Date)
      })
    });
  });

  it("查询发送记录支持 status、take 和 skip，并包含会话和应用", async () => {
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
      include: {
        conversation: true,
        app: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50,
      skip: 20
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
