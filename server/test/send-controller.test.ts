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
          status: "pending"
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
      type: "text",
      text: "hello",
      idempotencyKey: "idem_1"
    });

    expect(result).toEqual({ id: "send_existing", status: "pending" });
    expect(prisma.sendRequest.findFirst).toHaveBeenCalledWith({
      where: {
        appId: "app_1",
        conversationId: "conversation_1",
        idempotencyKey: "idem_1"
      },
      orderBy: { createdAt: "desc" }
    });
    expect(prisma.sendRequest.create).not.toHaveBeenCalled();
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
    expect(result).toEqual({
      id: "send_html",
      status: "pending",
      htmlPublicUrl: "https://gewehub.yunzxu.com/h/html_token",
      htmlPageId: "html_1",
      htmlHosted: true
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
    expect(result).toEqual({
      id: "send_html_url",
      status: "pending",
      htmlPublicUrl: "https://example.com/report.html",
      htmlPageId: null,
      htmlHosted: false
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
        type: true,
        status: true,
        errorMessage: true,
        resultMsgId: true,
        resultNewMsgId: true,
        resultCreateTime: true,
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
