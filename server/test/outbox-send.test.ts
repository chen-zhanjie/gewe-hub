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
        content: "hello",
        ats: []
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

  it("GeWe 发送业务失败时标记发送请求失败并保留 outbox 重试错误", async () => {
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
        status: "failed",
        errorMessage: "GeWe 发送失败: 图片格式错误"
      }
    });
    expect(prisma.outboxTask.update).toHaveBeenLastCalledWith({
      where: { id: "task_failed_image" },
      data: expect.objectContaining({
        status: "pending",
        retryCount: 1,
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
