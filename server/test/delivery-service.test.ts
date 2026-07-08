import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DeliveryService } from "../src/modules/delivery/delivery.service.js";

describe("DeliveryService", () => {
  it("创建投递时注入应用视角账号备注、会话备注和私聊联系人备注", async () => {
    const prisma = prismaForCreateForMessage({
      appAccountRemark: { remark: "应用备注-客服号" },
      account: { platformRemark: "平台备注-客服号" },
      contact: { platformRemark: "平台备注-张三" },
    });
    const service = new DeliveryService(prisma as never);

    await service.createForMessage(messageForDelivery({
      conversation: {
        type: "private",
        platformRemark: "平台备注-客户会话",
      },
    }) as never);

    expect(prisma.delivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({
            account: expect.objectContaining({ remark: "应用备注-客服号" }),
            conversation: expect.objectContaining({ remark: "平台备注-客户会话" }),
            sender: expect.objectContaining({ remark: "平台备注-张三" }),
            metadata: expect.objectContaining({
              debounceMs: 200,
              maxWaitMs: 1000,
            }),
          }),
        }),
      }),
    );
  });

  it("创建投递时账号备注在没有应用级备注时回落平台备注", async () => {
    const prisma = prismaForCreateForMessage({
      appAccountRemark: null,
      account: { platformRemark: "平台备注-客服号" },
      contact: { platformRemark: null },
    });
    const service = new DeliveryService(prisma as never);

    await service.createForMessage(messageForDelivery() as never);

    expect(prisma.delivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({
            account: expect.objectContaining({ remark: "平台备注-客服号" }),
          }),
        }),
      }),
    );
  });

  it("投递给 Hermes 的 conversation.id 使用数据库会话主键，便于回复回写 /api/send", async () => {
    const prisma = prismaForCreateForMessage();
    const service = new DeliveryService(prisma as never);

    await service.createForMessage(messageForDelivery({
      payloadConversationId: "cvs_wxid_bot_wxid_sender",
      conversation: {
        id: "conversation_db_1",
      },
    }) as never);

    expect(prisma.delivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({
            conversation: expect.objectContaining({
              id: "conversation_db_1",
            }),
          }),
        }),
      }),
    );
  });

  it("创建群聊投递时 sender.remark 来自群成员平台备注", async () => {
    const prisma = prismaForCreateForMessage({
      groupMember: { platformRemark: "平台备注-群成员张三" },
    });
    const service = new DeliveryService(prisma as never);

    await service.createForMessage(messageForDelivery({
      conversation: {
        type: "group",
        peerWxid: "12345@chatroom",
      },
    }) as never);

    expect(prisma.delivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({
            sender: expect.objectContaining({ remark: "平台备注-群成员张三" }),
          }),
        }),
      }),
    );
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
  });

  it("会话配置 at_only 时，非 @ 我的消息不生成投递", async () => {
    const prisma = prismaForCreateForMessage();
    const service = new DeliveryService(prisma as never);

    const result = await service.createForMessage(messageForDelivery({
      isAtMe: false,
      conversation: {
        deliveryFilter: "at_only",
      },
    }) as never);

    expect(result).toBeNull();
    expect(prisma.delivery.upsert).not.toHaveBeenCalled();
  });

  it("应用未开启 deliverSelfMessages 时，自发消息不生成投递，避免下游自回复循环", async () => {
    const prisma = prismaForCreateForMessage();
    const service = new DeliveryService(prisma as never);

    const result = await service.createForMessage(messageForDelivery({
      isSelf: true,
      conversation: {
        deliverSelfMessages: false,
      },
    }) as never);

    expect(result).toBeNull();
    expect(prisma.delivery.upsert).not.toHaveBeenCalled();
  });

  it("ACK 只确认当前 active app 已 delivered 的事件", async () => {
    const prisma = {
      hubApp: {
        findUniqueOrThrow: vi.fn(async () => ({ id: "app_1", status: "active" })),
      },
      delivery: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = new DeliveryService(prisma as never);

    const result = await service.ack("token_1", ["delivered_1", "queued_1", "other_app_1"]);

    expect(result).toEqual({ ok: true, acked: 1 });
    expect(prisma.delivery.updateMany).toHaveBeenCalledWith({
      where: {
        appId: "app_1",
        eventId: { in: ["delivered_1", "queued_1", "other_app_1"] },
        status: "delivered",
      },
      data: {
        status: "acked",
        ackedAt: expect.any(Date),
      },
    });
  });

  it("disabled app token 不能 ACK 事件", async () => {
    const prisma = {
      hubApp: {
        findUniqueOrThrow: vi.fn(async () => ({ id: "app_1", status: "disabled" })),
      },
      delivery: {
        updateMany: vi.fn(),
      },
    };
    const service = new DeliveryService(prisma as never);

    await expect(service.ack("token_1", ["del_1"])).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
  });
});

function messageForDelivery(overrides: {
  isAtMe?: boolean;
  isSelf?: boolean;
  payloadConversationId?: string;
  conversation?: Partial<{
    id: string;
    type: "private" | "group";
    peerWxid: string;
    platformRemark: string | null;
    debounceMs: number | null;
    maxWaitMs: number | null;
    deliveryFilter: "all" | "at_only";
    deliverSelfMessages: boolean;
  }>;
} = {}) {
  const isAtMe = overrides.isAtMe ?? true;
  const isSelf = overrides.isSelf ?? false;
  return {
    id: "message_row_1",
    accountId: "account_1",
    messageId: "msg_1",
    senderWxid: "wxid_sender",
    isSelf,
    isAtMe,
    payload: {
      schemaVersion: 1,
      eventType: "message.created",
      messageId: "msg_1",
      status: "normal",
      isSelf,
      isAtMe,
      account: { wxid: "wxid_bot" },
      conversation: {
        id: overrides.payloadConversationId ?? "conversation_1",
        type: overrides.conversation?.type ?? "private",
        wxid: overrides.conversation?.peerWxid ?? "wxid_sender",
      },
      sender: { wxid: "wxid_sender", isOwner: false },
      mentions: [],
      content: { type: "text", text: "hello" },
      quote: null,
      renderedText: "hello",
      sentAt: "2026-07-06T00:00:00.000Z",
    },
    conversation: {
      id: overrides.conversation?.id ?? "conversation_1",
      appId: "app_1",
      peerWxid: overrides.conversation?.peerWxid ?? "wxid_sender",
      type: overrides.conversation?.type ?? "private",
      platformRemark: overrides.conversation?.platformRemark ?? null,
      deliveryFilter: overrides.conversation?.deliveryFilter ?? "all",
      debounceMs: overrides.conversation?.debounceMs ?? 200,
      maxWaitMs: overrides.conversation?.maxWaitMs ?? 1000,
      app: {
        id: "app_1",
        status: "active",
        deliverSelfMessages: overrides.conversation?.deliverSelfMessages ?? false,
        defaultDebounceMs: 300,
        defaultMaxWaitMs: 1200,
      },
    },
  };
}

function prismaForCreateForMessage(options: {
  appAccountRemark?: { remark: string | null } | null;
  account?: { platformRemark: string | null } | null;
  contact?: { platformRemark: string | null } | null;
  groupMember?: { platformRemark: string | null } | null;
} = {}) {
  return {
    appAccountRemark: {
      findUnique: vi.fn(async () => options.appAccountRemark ?? null),
    },
    wechatAccount: {
      findUnique: vi.fn(async () => options.account ?? null),
    },
    contact: {
      findUnique: vi.fn(async () => options.contact ?? null),
    },
    groupMember: {
      findFirst: vi.fn(async () => options.groupMember ?? null),
    },
    delivery: {
      upsert: vi.fn(async (args: unknown) => args),
      updateMany: vi.fn(),
    },
  };
}
