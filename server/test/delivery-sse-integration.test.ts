import { EventEmitter } from "node:events";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryController } from "../src/modules/delivery/delivery.controller.js";
import { DeliveryStreamService } from "../src/modules/delivery/delivery-stream.service.js";
import { DeliveryService } from "../src/modules/delivery/delivery.service.js";

describe("Delivery SSE/ACK 集成闭环", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("SSE 收到含备注和防抖 metadata 的事件，ACK 后不再补发，Last-Event-ID 重连只收到断线期间事件", async () => {
    const deliveries = [
      deliveryRow("row_1", "del_1", "queued", "conversation_1", {
        sentAt: "2026-07-06T00:00:01.000Z",
        payload: messagePayload("msg_1"),
      }),
      deliveryRow("row_2", "del_2", "queued", "conversation_1", {
        sentAt: "2026-07-06T00:00:02.000Z",
        payload: messagePayload("msg_2"),
      }),
    ];
    const prisma = prismaForIntegration(deliveries);
    const controller = new DeliveryController(
      prisma as never,
      new DeliveryStreamService(prisma as never, new FakeDeliveryLock() as never),
      new DeliveryService(prisma as never),
    );

    await new DeliveryService(prisma as never).createForMessage(messageForCreateDelivery() as never);
    const createdDelivery = deliveries.find((item) => item.eventId === "del_msg_created_app_1_created");
    expect(createdDelivery?.payload).toMatchObject({
      account: { remark: "应用备注-客服号" },
      conversation: { remark: "平台备注-客户会话" },
      sender: { remark: "平台备注-张三" },
      metadata: { debounceMs: 200, maxWaitMs: 1000 },
    });

    const firstReply = fakeReply();
    await controller.events("Bearer token_1", undefined, undefined, firstReply as never);
    const createdEventId = createdDelivery?.eventId ?? "";
    const firstEvent = parseSseEvents(firstReply.raw.body())[0];

    expect(firstEvent).toMatchObject({
      id: createdEventId,
      event: "message.created",
      data: {
        eventId: createdEventId,
        eventType: "message.created",
        payload: expect.objectContaining({
          messageId: "msg_created",
          account: expect.objectContaining({ remark: "应用备注-客服号" }),
          conversation: expect.objectContaining({ remark: "平台备注-客户会话" }),
          sender: expect.objectContaining({ remark: "平台备注-张三" }),
          metadata: expect.objectContaining({ debounceMs: 200, maxWaitMs: 1000 }),
        }),
      },
    });
    expect(firstReply.raw.body()).not.toContain("id: del_1\n");

    await controller.ack("Bearer token_1", { eventIds: [createdEventId] });
    expect(deliveries.find((item) => item.eventId === createdEventId)?.status).toBe("acked");

    const afterAckReply = fakeReply();
    await controller.events("Bearer token_1", undefined, undefined, afterAckReply as never);
    expect(afterAckReply.raw.body()).not.toContain(`id: ${createdEventId}\n`);
    expect(afterAckReply.raw.body()).toContain("id: del_1\n");
    await controller.ack("Bearer token_1", { eventIds: ["del_1"] });

    const reconnectReply = fakeReply();
    await controller.events("Bearer token_1", "del_1", undefined, reconnectReply as never);

    expect(reconnectReply.raw.body()).not.toContain(`id: ${createdEventId}\n`);
    expect(reconnectReply.raw.body()).not.toContain("id: del_1\n");
    expect(reconnectReply.raw.body()).toContain("id: del_2\n");
  });
});

function prismaForIntegration(deliveries: ReturnType<typeof deliveryRow>[]) {
  return {
    hubApp: {
      findUnique: vi.fn(async ({ where }: { where: { token: string } }) =>
        where.token === "token_1" ? { id: "app_1", status: "active" } : null,
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { token: string } }) => {
        if (where.token !== "token_1") throw new Error("not found");
        return { id: "app_1", status: "active" };
      }),
    },
    appAccountRemark: {
      findUnique: vi.fn(async () => ({ remark: "应用备注-客服号" })),
    },
    wechatAccount: {
      findUnique: vi.fn(async () => ({ platformRemark: "平台备注-客服号" })),
    },
    contact: {
      findUnique: vi.fn(async () => ({ platformRemark: "平台备注-张三" })),
    },
    groupMember: {
      findFirst: vi.fn(async () => null),
    },
    delivery: {
      findMany: vi.fn(async ({ where }: { where: { appId: string; status: { not: string } } }) =>
        deliveries.filter((delivery) => delivery.appId === where.appId && delivery.status !== where.status.not),
      ),
      findUnique: vi.fn(async ({ where }: { where: { eventId: string } }) =>
        deliveries.find((delivery) => delivery.eventId === where.eventId) ?? null,
      ),
      count: vi.fn(
        async ({
          where,
        }: {
          where: {
            appId: string;
            status: { notIn: string[] };
            message: { conversationId: string; sentAt: { lt: Date } };
          };
        }) =>
          deliveries.filter(
            (delivery) =>
              delivery.appId === where.appId &&
              !where.status.notIn.includes(delivery.status) &&
              delivery.message.conversationId === where.message.conversationId &&
              delivery.message.sentAt < where.message.sentAt.lt,
          ).length,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const delivery = deliveries.find((item) => item.id === where.id);
        if (!delivery) throw new Error(`delivery ${where.id} not found`);
        Object.assign(delivery, materializeUpdate(data));
        return delivery;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: DeliveryUpdateManyWhere; data: Record<string, unknown> }) => {
        let count = 0;
        for (const delivery of deliveries) {
          if (matchesDeliveryWhere(delivery, where)) {
            Object.assign(delivery, materializeUpdate(data));
            count += 1;
          }
        }
        return { count };
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { eventId: string }; create: ReturnType<typeof deliveryRow>; update: Record<string, unknown> }) => {
        const existing = deliveries.find((delivery) => delivery.eventId === where.eventId);
        if (existing) {
          Object.assign(existing, materializeUpdate(update));
          return existing;
        }
        const created = {
          ...create,
          id: create.id ?? `row_${deliveries.length + 1}`,
          createdAt: new Date("2026-07-06T00:00:00.000Z"),
          status: create.status ?? "queued",
          attempts: 0,
          message: {
            conversationId: "conversation_1",
            sentAt: new Date("2026-07-06T00:00:00.000Z"),
          },
        };
        deliveries.push(created as ReturnType<typeof deliveryRow>);
        return created;
      }),
    },
  };
}

type IntegrationDelivery = ReturnType<typeof deliveryRow>;

type DeliveryUpdateManyWhere =
  | {
      appId: string;
      eventId: { in: string[] };
      status: { in: string[] };
    }
  | {
      id: string;
      status: { not: string };
    };

function matchesDeliveryWhere(delivery: IntegrationDelivery, where: DeliveryUpdateManyWhere): boolean {
  if ("id" in where) {
    return delivery.id === where.id && delivery.status !== where.status.not;
  }
  return (
    delivery.appId === where.appId &&
    where.eventId.in.includes(delivery.eventId) &&
    where.status.in.includes(delivery.status)
  );
}

function messageForCreateDelivery() {
  return {
    id: "message_row_created",
    accountId: "account_1",
    messageId: "msg_created",
    senderWxid: "wxid_sender",
    isSelf: false,
    isAtMe: true,
    payload: messagePayload("msg_created"),
    conversation: {
      id: "conversation_1",
      appId: "app_1",
      peerWxid: "wxid_sender",
      type: "private",
      platformRemark: "平台备注-客户会话",
      deliveryFilter: "all",
      debounceMs: 200,
      maxWaitMs: 1000,
      app: {
        id: "app_1",
        status: "active",
        deliverSelfMessages: false,
        defaultDebounceMs: 300,
        defaultMaxWaitMs: 1200,
      },
    },
  };
}

function deliveryRow(
  id: string,
  eventId: string,
  status: string,
  conversationId = "conversation_1",
  options: { createdAt?: string; sentAt?: string; payload?: ReturnType<typeof messagePayload> } = {},
) {
  return {
    id,
    appId: "app_1",
    messageId: `message_${eventId}`,
    eventId,
    eventType: "message_created",
    payload: options.payload ?? messagePayload(`msg_${eventId}`),
    status,
    attempts: 0,
    createdAt: new Date(options.createdAt ?? "2026-07-06T00:00:00.000Z"),
    message: {
      conversationId,
      sentAt: new Date(options.sentAt ?? "2026-07-06T00:00:00.000Z"),
    },
  };
}

function messagePayload(messageId: string) {
  return {
    schemaVersion: 1,
    eventType: "message.created",
    messageId,
    status: "normal",
    isSelf: false,
    isAtMe: true,
    account: { wxid: "wxid_bot" },
    conversation: { id: "conversation_1", type: "private", wxid: "wxid_sender" },
    sender: { wxid: "wxid_sender", isOwner: false },
    mentions: [],
    content: { type: "text", text: "hello" },
    quote: null,
    renderedText: "hello",
    sentAt: "2026-07-06T00:00:00.000Z",
  };
}

function parseSseEvents(raw: string) {
  return raw
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .filter((chunk) => chunk.split("\n").some((line) => line.startsWith("id: ")))
    .map((chunk) => {
      const lines = chunk.split("\n");
      return {
        id: lines.find((line) => line.startsWith("id: "))?.slice(4),
        event: lines.find((line) => line.startsWith("event: "))?.slice(7),
        data: JSON.parse(lines.find((line) => line.startsWith("data: "))?.slice(6) ?? "{}"),
      };
    });
}

function materializeUpdate(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      isIncrement(value) ? value.increment : value,
    ]),
  );
}

function isIncrement(value: unknown): value is { increment: number } {
  return typeof value === "object" && value !== null && "increment" in value;
}

function fakeReply() {
  const raw = new FakeRawReply();
  return { raw };
}

class FakeRawReply extends EventEmitter {
  ended = false;
  private chunks: string[] = [];

  writeHead() {}

  write(chunk: string) {
    this.chunks.push(chunk);
  }

  end() {
    this.ended = true;
    this.emit("close");
  }

  body() {
    return this.chunks.join("");
  }
}

class FakeDeliveryLock {
  async takeoverStream() {
    return { key: "stream", ownerToken: "owner", ttlSeconds: 45 };
  }

  async acquireConversation() {
    return { key: "conversation", ownerToken: "owner", ttlSeconds: 10 };
  }

  async renew() {
    return true;
  }

  async release() {}
}
