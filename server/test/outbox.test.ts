import { describe, expect, it, vi } from "vitest";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";
import { computeNextRetryAt, transitionAfterFailure } from "../src/modules/outbox/outbox-state.js";

describe("outbox 状态机", () => {
  it("失败后按指数退避进入 pending", () => {
    const now = new Date("2026-07-06T00:00:00.000Z");
    const next = transitionAfterFailure(
      {
        retryCount: 1,
        maxRetry: 5
      },
      new Error("boom"),
      now
    );

    expect(next.status).toBe("pending");
    expect(next.retryCount).toBe(2);
    expect(next.nextRetryAt?.getTime()).toBe(computeNextRetryAt(2, now).getTime());
  });

  it("超过 maxRetry 后进入 dead", () => {
    const next = transitionAfterFailure(
      {
        retryCount: 5,
        maxRetry: 5
      },
      new Error("boom"),
      new Date("2026-07-06T00:00:00.000Z")
    );

    expect(next.status).toBe("dead");
    expect(next.lastError).toBe("boom");
  });

  it("任务已被其他 worker 抢占时不执行 handler，也不覆盖任务状态", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_race",
          taskType: "process_webhook",
          refId: "event_race",
          payload: { webhookEventId: "event_race" },
          status: "pending",
          retryCount: 0,
          maxRetry: 5,
        })),
        updateMany: vi.fn(async () => ({ count: 0 })),
        update: vi.fn(async () => ({})),
      },
      webhookEvent: {
        update: vi.fn(async () => ({ id: "event_race" })),
      },
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
    );

    await service.tick();

    expect(prisma.outboxTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "task_race",
          status: "pending",
        }),
      }),
    );
    expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
    expect(prisma.outboxTask.update).not.toHaveBeenCalled();
  });

  it("回调新消息入库时非自己消息增加未读并自动取消隐藏", async () => {
    const { prisma, service } = buildIncomingMessageOutbox({ isSelf: false });

    await service.tick();

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: {
        lastMessageAt: expect.any(Date),
        lastMessageText: "hello",
        messageCount: { increment: 1 },
        unreadCount: { increment: 1 },
        isHidden: false,
      },
    });
  });

  it("回调新消息是自己发送时不增加未读但仍自动取消隐藏", async () => {
    const { prisma, service } = buildIncomingMessageOutbox({ isSelf: true });

    await service.tick();

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: {
        lastMessageAt: expect.any(Date),
        lastMessageText: "hello",
        messageCount: { increment: 1 },
        isHidden: false,
      },
    });
    expect(prisma.conversation.update).not.toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: expect.objectContaining({
        unreadCount: expect.anything(),
      }),
    });
  });

  it("重复处理同一回调消息时不重复增加未读和 messageCount", async () => {
    const { prisma, service } = buildIncomingMessageOutbox({
      isSelf: false,
      existingMessage: true,
    });

    await service.tick();

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: {
        lastMessageText: "hello",
      },
    });
    expect(prisma.conversation.update).not.toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: expect.objectContaining({
        messageCount: expect.anything(),
        unreadCount: expect.anything(),
      }),
    });
    expect(prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          isHidden: false,
        }),
      }),
    );
  });

  it("重复处理同一回调消息时会刷新标准消息字段", async () => {
    const { prisma, service } = buildIncomingMessageOutbox({
      isSelf: false,
      existingMessage: true,
      msgSource: "<msgsource><atuserlist>wxid_bot</atuserlist></msgsource>",
    });

    await service.tick();

    expect(prisma.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          type: "text",
          status: "normal",
          senderWxid: "wxid_sender",
          isSelf: false,
          isAtMe: true,
          payloadVersion: 1,
        }),
      }),
    );
  });

  it("会话 upsert 只负责确保会话存在，不在重试前置阶段增加计数", async () => {
    const { prisma, service } = buildIncomingMessageOutbox({ isSelf: false });

    await service.tick();

    expect(prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.not.objectContaining({
          unreadCount: expect.anything(),
          messageCount: expect.anything(),
        }),
        update: expect.not.objectContaining({
          unreadCount: expect.anything(),
          messageCount: expect.anything(),
        }),
      }),
    );
    expect(prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          isHidden: false,
        }),
        update: expect.not.objectContaining({
          isHidden: expect.anything(),
        }),
      }),
    );
  });

  it("回调新消息创建会话时使用本地联系人资料补齐名称和头像", async () => {
    const { prisma, service } = buildIncomingMessageOutbox({ isSelf: false });

    await service.tick();

    expect(prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          name: "陈可乐",
          avatarUrl: "https://avatar.example/friend.jpg",
        }),
        update: expect.objectContaining({
          name: "陈可乐",
          avatarUrl: "https://avatar.example/friend.jpg",
        }),
      }),
    );
  });

  it("原消息尚未送达应用时收到撤回，不投递 revoked 并取消未送达 created", async () => {
    const { prisma, delivery } = buildRevokeOutboxPrisma([{ appId: "app_1", status: "queued" }]);
    const service = new OutboxService(
      prisma as never,
      delivery as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
    );

    await service.tick();

    expect(delivery.createForMessage).not.toHaveBeenCalled();
    expect(prisma.delivery.updateMany).toHaveBeenCalledWith({
      where: {
        messageId: "message_1",
        eventType: "message_created",
        status: { in: ["queued", "delivering"] },
      },
      data: {
        status: "acked",
        ackedAt: expect.any(Date),
      },
    });
    expect(prisma.webhookEvent.update).toHaveBeenLastCalledWith({
      where: { id: "event_revoke" },
      data: { processStatus: "processed" },
    });
  });

  it("原消息已送达应用时收到撤回，继续投递 message.revoked", async () => {
    const { prisma, delivery } = buildRevokeOutboxPrisma([{ appId: "app_1", status: "delivered" }]);
    const service = new OutboxService(
      prisma as never,
      delivery as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
    );

    await service.tick();

    expect(prisma.delivery.upsert).toHaveBeenCalledWith({
      where: { eventId: "del_msg_7704921809887032008_app_1_revoked" },
      create: expect.objectContaining({
        appId: "app_1",
        messageId: "message_1",
        eventId: "del_msg_7704921809887032008_app_1_revoked",
        eventType: "message_revoked",
        status: "queued",
      }),
      update: expect.objectContaining({
        payload: expect.objectContaining({
          eventType: "message.revoked",
          status: "revoked",
        }),
      }),
    });
    expect(delivery.createForMessage).not.toHaveBeenCalled();
    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
  });

  it("原消息已投给 app A 后会话改绑 app B，撤回只投给已收到的 app A", async () => {
    const { prisma, delivery } = buildRevokeOutboxPrisma(
      [{ appId: "app_a", status: "acked" }],
      "app_b",
    );
    const service = new OutboxService(
      prisma as never,
      delivery as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
    );

    await service.tick();

    expect(prisma.delivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "del_msg_7704921809887032008_app_a_revoked" },
        create: expect.objectContaining({
          appId: "app_a",
          eventId: "del_msg_7704921809887032008_app_a_revoked",
        }),
      }),
    );
    expect(prisma.delivery.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          appId: "app_b",
        }),
      }),
    );
    expect(delivery.createForMessage).not.toHaveBeenCalled();
  });
});

function buildRevokeOutboxPrisma(
  createdDeliveries: Array<{ appId: string; status: "queued" | "delivering" | "delivered" | "acked" }>,
  currentAppId = "app_1",
) {
  const targetMessage = {
    id: "message_1",
    messageId: "msg_7704921809887032008",
    payload: {
      schemaVersion: 1,
      eventType: "message.created",
      messageId: "msg_7704921809887032008",
      status: "normal",
    },
    conversation: {
      appId: currentAppId,
      deliveryFilter: "all",
      debounceMs: null,
      maxWaitMs: null,
      app: {
        id: currentAppId,
        status: "active",
        deliverSelfMessages: false,
        defaultDebounceMs: null,
        defaultMaxWaitMs: null,
      },
    },
  };
  return {
    prisma: {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_revoke",
          taskType: "process_webhook",
          refId: "event_revoke",
          payload: { webhookEventId: "event_revoke" },
          retryCount: 0,
          maxRetry: 5,
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({})),
      },
      webhookEvent: {
        update: vi.fn(async (args) => {
          if (args.data.processStatus === "processing") {
            return {
              id: "event_revoke",
              eventKind: "message",
              rawPayload: revokePayload(),
            };
          }
          return { id: "event_revoke", ...args.data };
        }),
      },
      message: {
        findUnique: vi.fn(async () => targetMessage),
        findFirst: vi.fn(),
        update: vi.fn(async () => targetMessage),
      },
      delivery: {
        findMany: vi.fn(async () =>
          createdDeliveries.map((delivery, index) => ({
            id: `delivery_created_${index}`,
            eventId: `del_created_${index}`,
            status: delivery.status,
            appId: delivery.appId,
            payload: {
              schemaVersion: 1,
              eventType: "message.created",
              messageId: "msg_7704921809887032008",
              metadata: { debounceMs: 200, maxWaitMs: 1000 },
            },
          })),
        ),
        updateMany: vi.fn(async () => ({ count: createdDeliveries.filter((delivery) => delivery.status === "queued" || delivery.status === "delivering").length })),
        upsert: vi.fn(async () => ({ id: "delivery_revoked" })),
      },
    },
    delivery: {
      createForMessage: vi.fn(async () => ({ id: "delivery_revoked" })),
    },
  };
}

function buildIncomingMessageOutbox({
  isSelf,
  existingMessage = false,
  msgSource,
}: {
  isSelf: boolean;
  existingMessage?: boolean;
  msgSource?: string;
}) {
  const newMsgId = isSelf ? "5004026754542011001" : "5004026754542011000";
  const rawPayload = {
    TypeName: "AddMsg",
    Appid: "wx_app",
    Wxid: "wxid_bot",
    Data: {
      MsgId: newMsgId,
      MsgType: 1,
      NewMsgId: newMsgId,
      CreateTime: 1783308565,
      FromUserName: { string: isSelf ? "wxid_bot" : "wxid_sender" },
      ToUserName: { string: isSelf ? "wxid_target" : "wxid_bot" },
      PushContent: "陈可乐 : hello",
      Content: { string: "hello" },
      ...(msgSource ? { MsgSource: msgSource } : {}),
      IsSelf: isSelf ? 1 : 0,
    },
  };
  const prisma = {
    outboxTask: {
      findFirst: vi.fn(async () => ({
        id: `task_${newMsgId}`,
        taskType: "process_webhook",
        refId: `event_${newMsgId}`,
        payload: { webhookEventId: `event_${newMsgId}` },
        retryCount: 0,
        maxRetry: 5,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    webhookEvent: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (data.processStatus === "processing") {
          return {
            id: where.id,
            eventKind: "message",
            dedupeKey: `wx_app:${newMsgId}`,
            rawPayload,
          };
        }
        return { id: where.id, ...data };
      }),
    },
    wechatAccount: {
      upsert: vi.fn(async () => ({ id: "acc_1", wxid: "wxid_bot" })),
    },
    conversation: {
      upsert: vi.fn(async () => ({ id: "conv_1", app: null })),
      update: vi.fn(async () => ({})),
    },
    contact: {
      findUnique: vi.fn(async () => ({
        wxid: "wxid_sender",
        nickname: "陈可乐",
        avatarUrl: "https://avatar.example/friend.jpg",
        platformRemark: null,
      })),
    },
    group: {
      findUnique: vi.fn(),
    },
    message: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ("dedupeKey" in where && existingMessage) {
          return {
            id: "message_1",
            dedupeKey: where.dedupeKey,
          };
        }
        return null;
      }),
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
        id: "message_1",
        ...(existingMessage ? update : create),
        conversationId: "conv_1",
        messageId: `msg_${newMsgId}`,
        conversation: { app: null },
      })),
    },
  };
  const service = new OutboxService(
    prisma as never,
    { createForMessage: vi.fn() } as never,
    { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
  );
  return { prisma, service };
}

function revokePayload() {
  return {
    TypeName: "AddMsg",
    Data: {
      MsgType: 10002,
      Appid: "wx_app",
      NewMsgId: "revoke_event_1",
      Content: {
        string:
          '<sysmsg type="revokemsg"><revokemsg><msgid>130881346</msgid><newmsgid>7704921809887032008</newmsgid></revokemsg></sysmsg>',
      },
    },
  };
}
