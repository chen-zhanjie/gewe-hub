import { describe, expect, it, vi } from "vitest";
import { GeweRequestTimeoutError } from "../src/modules/gewe/gewe-client.service.js";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";

describe("OutboxService 发送任务", () => {
  it("分发 send 任务：调用 GeWe、记录响应、生成 hub_send 本地消息", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_1",
          taskType: "send",
          refId: "send_1",
          payload: { sendRequestId: "send_1" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_1",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "text",
          requestPayload: {
            conversationId: "conversation_1",
            type: "text",
            text: "hello"
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postText",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              content: "hello",
              ats: []
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345678",
          msgId: "123456",
          createTime: "1782932724220"
        }
      }))
    };
    const delivery = { createForMessage: vi.fn() };
    const service = new OutboxService(
      prisma as never,
      delivery as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      undefined,
      gewe as never
    );

    await service.tick();

    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postText",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        content: "hello"
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_1" },
      create: expect.objectContaining({
        accountId: "account_1",
        conversationId: "conversation_1",
        sendRequestId: "send_1",
        source: "hub_send",
        messageId: "msg_9154866412345678",
        rawMessageId: "9154866412345678",
        type: "text",
        renderedText: "hello"
      }),
      update: expect.objectContaining({
        rawMessageId: "9154866412345678",
        renderedText: "hello"
      })
    });
    expect(prisma.sendRequest.update).toHaveBeenCalledWith({
      where: { id: "send_1" },
      data: expect.objectContaining({
        status: "sent",
        resultNewMsgId: "9154866412345678",
        resultMsgId: "123456",
        resultCreateTime: "1782932724220"
      })
    });
    expect(delivery.createForMessage).not.toHaveBeenCalled();
  });

  it("发送超过 500 字的文本时保留完整 payload 正文，只把 renderedText 作为 500 字摘要入库", async () => {
    const longText = "长".repeat(501);
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_long_text",
          taskType: "send",
          refId: "send_long_text",
          payload: { sendRequestId: "send_long_text" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_long_text",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "text",
          requestPayload: {
            conversationId: "conversation_1",
            type: "text",
            text: longText
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postText",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              content: longText
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: { wxid: "wxid_bot" }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345679",
          msgId: "123457",
          createTime: "1782932724221"
        }
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      undefined,
      gewe as never
    );

    await service.tick();

    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_long_text" },
      create: expect.objectContaining({
        renderedText: longText.slice(0, 500),
        payload: expect.objectContaining({
          content: expect.objectContaining({ text: longText }),
          renderedText: longText
        })
      }),
      update: expect.objectContaining({
        renderedText: longText.slice(0, 500),
        payload: expect.objectContaining({
          content: expect.objectContaining({ text: longText }),
          renderedText: longText
        })
      })
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conversation_1" },
      data: expect.objectContaining({
        lastMessageText: longText.slice(0, 500)
      })
    });
    expect(prisma.sendRequest.update).toHaveBeenCalledWith({
      where: { id: "send_long_text" },
      data: expect.objectContaining({ status: "sent" })
    });
  });

  it("分发文本引用 send 任务：生成带 quote 的 hub_send 本地消息", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_quote",
          taskType: "send",
          refId: "send_quote",
          payload: { sendRequestId: "send_quote" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_quote",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "text",
          requestPayload: {
            conversationId: "conversation_1",
            type: "text",
            text: "这个我看过了",
            replyToMessageId: "msg_478238581151300365",
            quote: {
              messageId: "msg_478238581151300365",
              rawMessageId: "478238581151300365",
              senderWxid: "wxid_sender",
              senderName: "陈可乐",
              sentAt: "2026-07-09T10:11:12.000Z",
              content: {
                type: "file",
                text: "[文件] mapping_app.txt",
                media: {
                  status: "ready",
                  fileName: "mapping_app.txt"
                }
              },
              rawContent: "<msg><appmsg><title>mapping_app.txt</title><type>6</type></appmsg></msg>"
            }
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postAppMsg",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              appmsg: "<appmsg><type>57</type></appmsg>"
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345699",
          msgId: "123499",
          createTime: "1782932724299"
        }
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      undefined,
      gewe as never
    );

    await service.tick();

    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_quote" },
      create: expect.objectContaining({
        type: "text",
        renderedText: "这个我看过了: [文件] mapping_app.txt",
        payload: expect.objectContaining({
          content: { type: "text", text: "这个我看过了" },
          quote: expect.objectContaining({
            type: "file",
            text: "[文件] mapping_app.txt",
            senderName: "陈可乐",
            sourceMessageId: "msg_478238581151300365",
            sentAt: "2026-07-09T10:11:12.000Z"
          })
        })
      }),
      update: expect.objectContaining({
        renderedText: "这个我看过了: [文件] mapping_app.txt"
      })
    });
  });

  it("发送语音前将上传音频转为 Silk，并调用 GeWe postVoice", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_voice",
          taskType: "send",
          refId: "send_voice",
          payload: { sendRequestId: "send_voice" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_voice",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "voice",
          requestPayload: {
            conversationId: "conversation_1",
            type: "voice",
            contentBase64: "UklGRg==",
            mimeType: "audio/webm",
            fileName: "recording.webm",
            durationMs: 2600
          },
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
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345679",
          msgId: "123457",
          createTime: "1782932724221"
        }
      }))
    };
    const media = {
      prepareOutboundVoice: vi.fn(async () => ({
        original: {
          url: "http://localhost:8090/files/original_voice?exp=1893456000&sig=test",
          mimeType: "audio/webm",
          fileName: "recording.webm",
          size: 6,
          durationMs: 2600
        },
        silk: {
          url: "http://localhost:8090/files/silk_voice?exp=1893456000&sig=test",
          mimeType: "audio/silk",
          fileName: "recording.silk",
          size: 12,
          durationMs: 2600
        }
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundVoice).toHaveBeenCalledWith({
      accountId: "account_1",
      conversationId: "conversation_1",
      contentBase64: "UklGRg==",
      mimeType: "audio/webm",
      fileName: "recording.webm",
      durationMs: 2600
    });
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postVoice",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        voiceUrl: "http://localhost:8090/files/silk_voice?exp=1893456000&sig=test",
        voiceDuration: 2600
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_voice" },
      create: expect.objectContaining({
        type: "voice",
        renderedText: "[语音]",
        payload: expect.objectContaining({
          content: expect.objectContaining({
            type: "voice",
            media: expect.objectContaining({
              url: "http://localhost:8090/files/original_voice?exp=1893456000&sig=test",
              mimeType: "audio/webm",
              durationMs: 2600
            })
          })
        })
      }),
      update: expect.objectContaining({
        renderedText: "[语音]"
      })
    });
  });

  it("发送图片前将上传图片发布为签名 URL，并生成本地图片消息", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_image",
          taskType: "send",
          refId: "send_image",
          payload: { sendRequestId: "send_image" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_image",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "image",
          requestPayload: {
            conversationId: "conversation_1",
            type: "image",
            contentBase64: "iVBORw0KGgo=",
            mimeType: "image/png",
            fileName: "screenshot.png"
          },
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
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345680",
          msgId: "123458",
          createTime: "1782932724222"
        }
      }))
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_image?exp=1893456000&sig=test",
        mimeType: "image/png",
        fileName: "screenshot.png",
        size: 8
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundFile).toHaveBeenCalledWith({
      accountId: "account_1",
      conversationId: "conversation_1",
      kind: "image",
      contentBase64: "iVBORw0KGgo=",
      mimeType: "image/png",
      fileName: "screenshot.png"
    });
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postImage",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        imgUrl: "http://localhost:8090/files/outbound/out_image?exp=1893456000&sig=test"
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_image" },
      create: expect.objectContaining({
        type: "image",
        renderedText: "[图片]",
        payload: expect.objectContaining({
          content: expect.objectContaining({
            type: "image",
            media: expect.objectContaining({
              status: "ready",
              url: "http://localhost:8090/files/outbound/out_image?exp=1893456000&sig=test",
              mimeType: "image/png",
              fileName: "screenshot.png"
            })
          })
        })
      }),
      update: expect.objectContaining({
        renderedText: "[图片]"
      })
    });
  });

  it("发送文件前将上传文件发布为签名 URL，并生成本地文件消息", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_file",
          taskType: "send",
          refId: "send_file",
          payload: { sendRequestId: "send_file" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_file",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "file",
          requestPayload: {
            conversationId: "conversation_1",
            type: "file",
            contentBase64: "SGVsbG8=",
            mimeType: "text/plain",
            fileName: "note.txt"
          },
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
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345681",
          msgId: "123459",
          createTime: "1782932724223"
        }
      }))
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_file?exp=1893456000&sig=test",
        mimeType: "text/plain",
        fileName: "note.txt",
        size: 5
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundFile).toHaveBeenCalledWith({
      accountId: "account_1",
      conversationId: "conversation_1",
      kind: "file",
      contentBase64: "SGVsbG8=",
      mimeType: "text/plain",
      fileName: "note.txt"
    });
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postFile",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        fileUrl: "http://localhost:8090/files/outbound/out_file?exp=1893456000&sig=test",
        fileName: "note.txt"
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_file" },
      create: expect.objectContaining({
        type: "file",
        renderedText: "[文件] note.txt",
        payload: expect.objectContaining({
          content: expect.objectContaining({
            type: "file",
            media: expect.objectContaining({
              status: "ready",
              url: "http://localhost:8090/files/outbound/out_file?exp=1893456000&sig=test",
              mimeType: "text/plain",
              fileName: "note.txt",
              size: 5
            })
          })
        })
      }),
      update: expect.objectContaining({
        renderedText: "[文件] note.txt"
      })
    });
  });

  it("发送任务失败后直接终止 outbox，避免有外部副作用的发送被自动重试", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_file_failed",
          taskType: "send",
          refId: "send_file_failed",
          payload: { sendRequestId: "send_file_failed" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_file_failed",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "file",
          requestPayload: {
            conversationId: "conversation_1",
            type: "file",
            contentBase64: "SGVsbG8=",
            mimeType: "text/plain",
            fileName: "note.txt"
          },
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
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_file?exp=1893456000&sig=test",
        mimeType: "text/plain",
        fileName: "note.txt",
        size: 5
      }))
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => {
        throw new Error("GeWe 返回异常但微信可能已收到");
      })
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(prisma.sendRequest.update).toHaveBeenCalledWith({
      where: { id: "send_file_failed" },
      data: {
        status: "failed",
        errorMessage: "GeWe 返回异常但微信可能已收到"
      }
    });
    expect(prisma.outboxTask.update).toHaveBeenLastCalledWith({
      where: { id: "task_file_failed" },
      data: {
        status: "dead",
        retryCount: 1,
        nextRetryAt: null,
        leaseUntil: null,
        lastError: "GeWe 返回异常但微信可能已收到"
      }
    });
  });

  it("发送视频前将上传视频发布为签名 URL，并调用 GeWe postVideo", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_video",
          taskType: "send",
          refId: "send_video",
          payload: { sendRequestId: "send_video" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_video",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "video",
          requestPayload: {
            conversationId: "conversation_1",
            type: "video",
            contentBase64: "AAAAIGZ0eXA=",
            mimeType: "video/mp4",
            fileName: "clip.mp4",
            thumbUrl: "https://cdn.example/thumb.jpg",
            durationMs: 10_000
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postVideo",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              thumbUrl: "https://cdn.example/thumb.jpg",
              videoDuration: 10,
              source: {
                contentBase64: "AAAAIGZ0eXA=",
                mimeType: "video/mp4",
                fileName: "clip.mp4"
              }
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345682",
          msgId: "123460",
          createTime: "1782932724224"
        }
      }))
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_video?exp=1893456000&sig=test",
        mimeType: "video/mp4",
        fileName: "clip.mp4",
        size: 1024
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundFile).toHaveBeenCalledWith({
      accountId: "account_1",
      conversationId: "conversation_1",
      kind: "video",
      contentBase64: "AAAAIGZ0eXA=",
      mimeType: "video/mp4",
      fileName: "clip.mp4"
    });
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postVideo",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        videoUrl: "http://localhost:8090/files/outbound/out_video?exp=1893456000&sig=test",
        thumbUrl: "https://cdn.example/thumb.jpg",
        videoDuration: 10
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_video" },
      create: expect.objectContaining({
        type: "video",
        renderedText: "[视频]",
        payload: expect.objectContaining({
          content: expect.objectContaining({
            type: "video",
            media: expect.objectContaining({
              status: "ready",
              url: "http://localhost:8090/files/outbound/out_video?exp=1893456000&sig=test",
              thumbnailUrl: "https://cdn.example/thumb.jpg",
              mimeType: "video/mp4",
              fileName: "clip.mp4",
              size: 1024,
              durationMs: 10_000
            })
          })
        })
      }),
      update: expect.objectContaining({
        renderedText: "[视频]"
      })
    });
  });

  it("公网视频 URL 发送时直接透传 videoUrl，不重新发布为签名 URL", async () => {
    const publicVideoUrl = "https://cdn.example.test/clip.mp4";
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_video_url",
          taskType: "send",
          refId: "send_video_url",
          payload: { sendRequestId: "send_video_url" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_video_url",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "video",
          requestPayload: {
            conversationId: "conversation_1",
            type: "video",
            fileUrl: publicVideoUrl
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postVideo",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              videoUrl: publicVideoUrl,
              videoDuration: 1
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345683",
          msgId: "123461",
          createTime: "1782932724225"
        }
      }))
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => {
        throw new Error("公网视频 URL 不应该重新进入本地媒体发布流程");
      }),
      prepareOutboundVideoThumbnail: vi.fn(async () => {
        throw new Error("公网视频 URL 没有本地视频文件时不应该自动截封面");
      })
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundFile).not.toHaveBeenCalled();
    expect(media.prepareOutboundVideoThumbnail).not.toHaveBeenCalled();
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postVideo",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        videoUrl: publicVideoUrl,
        thumbUrl: undefined,
        videoDuration: 1
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_video_url" },
      create: expect.objectContaining({
        type: "video",
        renderedText: "[视频]",
        payload: expect.objectContaining({
          content: expect.objectContaining({
            type: "video",
            media: expect.objectContaining({
              status: "ready",
              url: publicVideoUrl,
              thumbnailUrl: undefined,
              mimeType: "video/mp4",
              fileName: "video.mp4",
              size: 0,
              durationMs: 1000
            })
          })
        })
      }),
      update: expect.objectContaining({
        renderedText: "[视频]"
      })
    });
  });

  it("发送视频前将上传封面图发布为签名 URL 后作为 thumbUrl", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_video_thumb",
          taskType: "send",
          refId: "send_video_thumb",
          payload: { sendRequestId: "send_video_thumb" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_video_thumb",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "video",
          requestPayload: {
            conversationId: "conversation_1",
            type: "video",
            contentBase64: "AAAAIGZ0eXA=",
            mimeType: "video/mp4",
            fileName: "clip.mp4",
            thumbContentBase64: "iVBORw0KGgo=",
            thumbMimeType: "image/png",
            thumbFileName: "cover.png",
            durationMs: 10_000
          },
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
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345684",
          msgId: "123462",
          createTime: "1782932724226"
        }
      }))
    };
    const media = {
      prepareOutboundFile: vi.fn(async (input: { kind: string }) =>
        input.kind === "video"
          ? {
              url: "http://localhost:8090/files/outbound/out_video?exp=1893456000&sig=test",
              mimeType: "video/mp4",
              fileName: "clip.mp4",
              size: 1024
            }
          : {
              url: "http://localhost:8090/files/outbound/out_thumb?exp=1893456000&sig=test",
              mimeType: "image/png",
              fileName: "cover.png",
              size: 4
            }
      )
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundFile).toHaveBeenNthCalledWith(1, {
      accountId: "account_1",
      conversationId: "conversation_1",
      kind: "video",
      contentBase64: "AAAAIGZ0eXA=",
      mimeType: "video/mp4",
      fileName: "clip.mp4"
    });
    expect(media.prepareOutboundFile).toHaveBeenNthCalledWith(2, {
      accountId: "account_1",
      conversationId: "conversation_1",
      kind: "image",
      contentBase64: "iVBORw0KGgo=",
      mimeType: "image/png",
      fileName: "cover.png",
      purpose: "thumbnail"
    });
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postVideo",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        videoUrl: "http://localhost:8090/files/outbound/out_video?exp=1893456000&sig=test",
        thumbUrl: "http://localhost:8090/files/outbound/out_thumb?exp=1893456000&sig=test",
        videoDuration: 10
      }
    });
  });

  it("发送视频未传封面和时长时由 Hub 自动生成缩略图并使用默认时长", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_video_auto_thumb",
          taskType: "send",
          refId: "send_video_auto_thumb",
          payload: { sendRequestId: "send_video_auto_thumb" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_video_auto_thumb",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "video",
          requestPayload: {
            conversationId: "conversation_1",
            type: "video",
            contentBase64: "AAAAIGZ0eXA=",
            mimeType: "video/mp4",
            fileName: "clip.mp4"
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postVideo",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              videoDuration: 1,
              source: {
                contentBase64: "AAAAIGZ0eXA=",
                mimeType: "video/mp4",
                fileName: "clip.mp4"
              }
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345685",
          msgId: "123463",
          createTime: "1782932724227"
        }
      }))
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_video?exp=1893456000&sig=test",
        path: "/tmp/out_video.mp4",
        mimeType: "video/mp4",
        fileName: "clip.mp4",
        size: 1024
      })),
      prepareOutboundVideoThumbnail: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_video_thumb?exp=1893456000&sig=test",
        path: "/tmp/out_video_thumb.jpg",
        mimeType: "image/jpeg",
        fileName: "clip.jpg",
        size: 4096
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundVideoThumbnail).toHaveBeenCalledWith({
      accountId: "account_1",
      videoPath: "/tmp/out_video.mp4",
      fileName: "clip.mp4"
    });
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postVideo",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        videoUrl: "http://localhost:8090/files/outbound/out_video?exp=1893456000&sig=test",
        thumbUrl: "http://localhost:8090/files/outbound/out_video_thumb?exp=1893456000&sig=test",
        videoDuration: 1
      }
    });
  });

  it("发送链接时调用 GeWe postLink，并生成本地链接消息", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_link",
          taskType: "send",
          refId: "send_link",
          payload: { sendRequestId: "send_link" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_link",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "link",
          requestPayload: {
            conversationId: "conversation_1",
            type: "link",
            title: "链接标题",
            desc: "链接描述",
            linkUrl: "https://example.com/article",
            thumbUrl: "https://example.com/thumb.jpg"
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postLink",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              title: "链接标题",
              desc: "链接描述",
              linkUrl: "https://example.com/article",
              thumbUrl: "https://example.com/thumb.jpg"
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345683",
          msgId: "123461",
          createTime: "1782932724225"
        }
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      undefined,
      gewe as never
    );

    await service.tick();

    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postLink",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        title: "链接标题",
        desc: "链接描述",
        linkUrl: "https://example.com/article",
        thumbUrl: "https://example.com/thumb.jpg"
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_link" },
      create: expect.objectContaining({
        type: "link",
        renderedText: "[链接] 链接标题",
        payload: expect.objectContaining({
          content: expect.objectContaining({
            type: "link",
            text: "[链接] 链接标题",
            link: {
              title: "链接标题",
              desc: "链接描述",
              url: "https://example.com/article",
              thumbnailUrl: "https://example.com/thumb.jpg"
            }
          })
        })
      }),
      update: expect.objectContaining({
        renderedText: "[链接] 链接标题"
      })
    });
  });

  it("发送 HTML 时调用 GeWe postLink，并补默认缩略图生成本地 HTML 消息", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_html",
          taskType: "send",
          refId: "send_html",
          payload: { sendRequestId: "send_html" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_html",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "html",
          requestPayload: {
            conversationId: "conversation_1",
            type: "html",
            title: "HTML 标题",
            desc: "HTML 描述",
            htmlPublicUrl: "https://gewehub.yunzxu.com/h/html_token",
            htmlPageId: "html_1",
            htmlHosted: true
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postLink",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              title: "HTML 标题",
              desc: "HTML 描述",
              linkUrl: "https://gewehub.yunzxu.com/h/html_token"
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345688",
          msgId: "123468",
          createTime: "1782932724230"
        }
      }))
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_link_thumb?exp=1893456000&sig=test",
        mimeType: "image/png",
        fileName: "link-thumbnail.png",
        size: 1413
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundFile).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account_1",
        conversationId: "conversation_1",
        kind: "image",
        mimeType: "image/jpeg",
        fileName: "link-thumbnail.jpg",
        purpose: "thumbnail"
      })
    );
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postLink",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        title: "HTML 标题",
        desc: "HTML 描述",
        linkUrl: "https://gewehub.yunzxu.com/h/html_token",
        thumbUrl: "http://localhost:8090/files/outbound/out_link_thumb?exp=1893456000&sig=test"
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_html" },
      create: expect.objectContaining({
        type: "html",
        renderedText: "[HTML] HTML 标题",
        payload: expect.objectContaining({
          content: expect.objectContaining({
            type: "html",
            text: "[HTML] HTML 标题",
            link: {
              title: "HTML 标题",
              desc: "HTML 描述",
              url: "https://gewehub.yunzxu.com/h/html_token",
              thumbnailUrl: "http://localhost:8090/files/outbound/out_link_thumb?exp=1893456000&sig=test"
            }
          })
        })
      }),
      update: expect.objectContaining({
        renderedText: "[HTML] HTML 标题"
      })
    });
  });

  it("发送链接缺少标题描述缩略图时补默认值并发布默认缩略图", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_link_default",
          taskType: "send",
          refId: "send_link_default",
          payload: { sendRequestId: "send_link_default" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_link_default",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "link",
          requestPayload: {
            conversationId: "conversation_1",
            type: "link",
            linkUrl: "https://example.com/article"
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postLink",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              linkUrl: "https://example.com/article"
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => ({
        data: {
          newMsgId: "9154866412345685",
          msgId: "123463",
          createTime: "1782932724227"
        }
      }))
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_link_thumb?exp=1893456000&sig=test",
        mimeType: "image/png",
        fileName: "link-thumbnail.png",
        size: 1413
      }))
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(media.prepareOutboundFile).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account_1",
        conversationId: "conversation_1",
        kind: "image",
        mimeType: "image/jpeg",
        fileName: "link-thumbnail.jpg",
        purpose: "thumbnail"
      })
    );
    expect(gewe.sendByMappedRequest).toHaveBeenCalledWith({
      path: "/gewe/v2/api/message/postLink",
      body: {
        appId: "wx_app",
        toWxid: "wxid_target",
        title: "example.com",
        desc: "https://example.com/article",
        linkUrl: "https://example.com/article",
        thumbUrl: "http://localhost:8090/files/outbound/out_link_thumb?exp=1893456000&sig=test"
      }
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { sendRequestId: "send_link_default" },
      create: expect.objectContaining({
        type: "link",
        renderedText: "[链接] example.com",
      }),
      update: expect.objectContaining({
        renderedText: "[链接] example.com"
      })
    });
  });

  it("GeWe 发送业务失败时标记发送请求失败并终止 outbox，避免自动重复发送", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_failed_image",
          taskType: "send",
          refId: "send_failed_image",
          payload: { sendRequestId: "send_failed_image" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_failed_image",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "image",
          requestPayload: {
            conversationId: "conversation_1",
            type: "image",
            contentBase64: "iVBORw0KGgo=",
            mimeType: "image/png",
            fileName: "screenshot.png"
          },
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
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_image?exp=1893456000&sig=test",
        mimeType: "image/png",
        fileName: "screenshot.png",
        size: 8
      }))
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => {
        throw new Error("GeWe 发送失败: 图片格式错误");
      })
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(prisma.message.upsert).not.toHaveBeenCalled();
    expect(prisma.sendRequest.update).toHaveBeenCalledWith({
      where: { id: "send_failed_image" },
      data: {
        geweRequest: {
          path: "/gewe/v2/api/message/postImage",
          body: {
            appId: "wx_app",
            toWxid: "wxid_target",
            imgUrl: "http://localhost:8090/files/outbound/out_image?exp=1893456000&sig=test"
          }
        }
      }
    });
    expect(prisma.sendRequest.update).toHaveBeenCalledWith({
      where: { id: "send_failed_image" },
      data: {
        status: "failed",
        errorMessage: "GeWe 发送失败: 图片格式错误"
      }
    });
    expect(prisma.outboxTask.update).toHaveBeenLastCalledWith({
      where: { id: "task_failed_image" },
      data: expect.objectContaining({
        status: "dead",
        retryCount: 1,
        nextRetryAt: null,
        lastError: "GeWe 发送失败: 图片格式错误"
      })
    });
  });

  it("GeWe 发送超时时标记发送状态未知并停止自动重试，避免重复发送", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_timeout_file",
          taskType: "send",
          refId: "send_timeout_file",
          payload: { sendRequestId: "send_timeout_file" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      sendRequest: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "send_timeout_file",
          accountId: "account_1",
          conversationId: "conversation_1",
          type: "file",
          requestPayload: {
            conversationId: "conversation_1",
            type: "file",
            contentBase64: "JVBERi0=",
            mimeType: "application/pdf",
            fileName: "file.pdf"
          },
          geweRequest: {
            path: "/gewe/v2/api/message/postFile",
            body: {
              appId: "wx_app",
              toWxid: "wxid_target",
              source: {
                contentBase64: "JVBERi0=",
                mimeType: "application/pdf",
                fileName: "file.pdf"
              }
            }
          },
          conversation: {
            id: "conversation_1",
            peerWxid: "wxid_target",
            account: {
              wxid: "wxid_bot"
            }
          }
        })),
        update: vi.fn(async (_args: unknown) => ({}))
      },
      message: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async (_args: unknown) => ({}))
      },
      conversation: {
        update: vi.fn(async () => ({}))
      }
    };
    const media = {
      prepareOutboundFile: vi.fn(async () => ({
        url: "http://localhost:8090/files/outbound/out_file?exp=1893456000&sig=test",
        mimeType: "application/pdf",
        fileName: "file.pdf",
        size: 8
      }))
    };
    const gewe = {
      sendByMappedRequest: vi.fn(async () => {
        throw new GeweRequestTimeoutError("/gewe/v2/api/message/postFile", 120000);
      })
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
      gewe as never
    );

    await service.tick();

    expect(prisma.message.upsert).not.toHaveBeenCalled();
    expect(prisma.sendRequest.update).toHaveBeenCalledWith({
      where: { id: "send_timeout_file" },
      data: {
        status: "unknown",
        errorMessage: "GeWe 请求超时，发送结果未知，已停止自动重试以避免重复发送"
      }
    });
    expect(prisma.outboxTask.update).toHaveBeenLastCalledWith({
      where: { id: "task_timeout_file" },
      data: expect.objectContaining({
        status: "dead",
        retryCount: 1,
        nextRetryAt: null,
        lastError: "GeWe 请求超时，发送结果未知，已停止自动重试以避免重复发送"
      })
    });
  });
});
