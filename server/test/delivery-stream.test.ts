import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryStreamService } from "../src/modules/delivery/delivery-stream.service.js";

describe("DeliveryStreamService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("连接后补发未 acked 事件并保持长连接等待后续事件", async () => {
    const prisma = prismaWithDeliveries([
      deliveryRow("row_1", "del_1", "queued"),
    ]);
    const stream = new DeliveryStreamService(prisma as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: reply as never,
    });

    expect(reply.raw.ended).toBe(false);
    expect(reply.raw.body()).toContain("id: del_1\n");
    expect(prisma.delivery.update).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: {
        status: "delivered",
        deliveredAt: expect.any(Date),
        attempts: { increment: 1 },
      },
    });

    prisma.delivery.findMany.mockResolvedValueOnce([
      deliveryRow("row_2", "del_2", "queued"),
    ]);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(reply.raw.body()).toContain("id: del_2\n");
    expect(reply.raw.ended).toBe(false);
  });

  it("心跳每 15 秒发送一次注释帧", async () => {
    const prisma = prismaWithDeliveries([]);
    const stream = new DeliveryStreamService(prisma as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: reply as never,
    });

    await vi.advanceTimersByTimeAsync(15_000);

    expect(reply.raw.body()).toContain(": heartbeat\n\n");
    expect(reply.raw.ended).toBe(false);
  });

  it("Last-Event-ID 只补发游标之后的事件", async () => {
    const prisma = prismaWithDeliveries([
      deliveryRow("row_1", "del_1", "delivered", "conversation_1"),
      deliveryRow("row_2", "del_2", "queued", "conversation_1"),
    ]);
    const stream = new DeliveryStreamService(prisma as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: "del_1",
      reply: reply as never,
    });

    expect(reply.raw.body()).not.toContain("id: del_1\n");
    expect(reply.raw.body()).toContain("id: del_2\n");
  });

  it("Last-Event-ID 已 ack 不在未 ack 队列时，仍只补发 cursor 之后的断线事件", async () => {
    const prisma = prismaWithDeliveries([
      deliveryRow("row_old", "del_old", "delivered", "conversation_1", {
        sentAt: "2026-07-06T00:00:01.000Z",
      }),
      deliveryRow("row_new", "del_new", "queued", "conversation_1", {
        sentAt: "2026-07-06T00:00:03.000Z",
      }),
    ]);
    prisma.delivery.findUnique.mockResolvedValueOnce(
      deliveryRow("row_cursor", "del_cursor", "acked", "conversation_1", {
        sentAt: "2026-07-06T00:00:02.000Z",
      }),
    );
    const stream = new DeliveryStreamService(prisma as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: "del_cursor",
      reply: reply as never,
    });

    expect(reply.raw.body()).not.toContain("id: del_old\n");
    expect(reply.raw.body()).toContain("id: del_new\n");
  });

  it("Last-Event-ID 未知时按当前未 ack 队列补发，避免沉默丢消息", async () => {
    const prisma = prismaWithDeliveries([
      deliveryRow("row_1", "del_1", "queued", "conversation_1"),
    ]);
    prisma.delivery.findUnique.mockResolvedValueOnce(null);
    const stream = new DeliveryStreamService(prisma as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: "missing_cursor",
      reply: reply as never,
    });

    expect(reply.raw.body()).toContain("id: del_1\n");
  });

  it("同一会话一次 flush 只推进一条 delivery，其他会话仍可推送", async () => {
    const prisma = prismaWithDeliveries([
      deliveryRow("row_1", "del_1", "queued", "conversation_1"),
      deliveryRow("row_2", "del_2", "queued", "conversation_1"),
      deliveryRow("row_3", "del_3", "queued", "conversation_2"),
    ]);
    const stream = new DeliveryStreamService(prisma as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: reply as never,
    });

    expect(reply.raw.body()).toContain("id: del_1\n");
    expect(reply.raw.body()).not.toContain("id: del_2\n");
    expect(reply.raw.body()).toContain("id: del_3\n");
    expect(prisma.delivery.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "row_2" },
      }),
    );
    expect(prisma.delivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "row_3" },
      }),
    );
  });

  it("同一会话按消息 sentAt 顺序推进，而不是按 delivery 创建时间", async () => {
    const prisma = prismaWithDeliveries([
      deliveryRow("row_late", "del_late", "queued", "conversation_1", {
        createdAt: "2026-07-06T00:00:01.000Z",
        sentAt: "2026-07-06T00:00:10.000Z",
      }),
      deliveryRow("row_early", "del_early", "queued", "conversation_1", {
        createdAt: "2026-07-06T00:00:02.000Z",
        sentAt: "2026-07-06T00:00:05.000Z",
      }),
    ]);
    const stream = new DeliveryStreamService(prisma as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: reply as never,
    });

    expect(reply.raw.body()).toContain("id: del_early\n");
    expect(reply.raw.body()).not.toContain("id: del_late\n");
    expect(prisma.delivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "row_early" },
      }),
    );
    expect(prisma.delivery.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "row_late" },
      }),
    );
  });

  it("数据库中存在同会话更早未送达 delivery 时，不发送后续 delivery", async () => {
    const prisma = prismaWithDeliveries([
      deliveryRow("row_late", "del_late", "queued", "conversation_1", {
        createdAt: "2026-07-06T00:00:02.000Z",
        sentAt: "2026-07-06T00:00:02.000Z",
      }),
    ]);
    prisma.delivery.count.mockResolvedValueOnce(1);
    const stream = new DeliveryStreamService(prisma as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: reply as never,
    });

    expect(reply.raw.body()).not.toContain("id: del_late\n");
    expect(prisma.delivery.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "row_late" },
      }),
    );
    expect(prisma.delivery.count).toHaveBeenCalledWith({
      where: {
        appId: "app_1",
        status: { notIn: ["delivered", "acked"] },
        message: {
          conversationId: "conversation_1",
          sentAt: {
            lt: new Date("2026-07-06T00:00:02.000Z"),
          },
        },
      },
    });
  });

  it("同一应用新连接会顶掉旧连接", async () => {
    const prisma = prismaWithDeliveries([]);
    const stream = new DeliveryStreamService(prisma as never);
    const first = fakeReply();
    const second = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: first as never,
    });
    await stream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: second as never,
    });

    expect(first.raw.ended).toBe(true);
    expect(second.raw.ended).toBe(false);
  });

  it("共享 Redis stream lock 时，新实例会顶掉旧实例并让旧实例退出", async () => {
    const lock = new FakeDeliveryLock();
    const firstStream = new DeliveryStreamService(prismaWithDeliveries([]) as never, lock as never);
    const secondStream = new DeliveryStreamService(prismaWithDeliveries([]) as never, lock as never);
    const first = fakeReply();
    const second = fakeReply();

    await firstStream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: first as never,
    });
    await secondStream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: second as never,
    });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(first.raw.ended).toBe(true);
    expect(second.raw.ended).toBe(false);
  });

  it("stream lock 所有权丢失后，旧实例不能继续写事件", async () => {
    const lock = new FakeDeliveryLock();
    const prisma = prismaWithDeliveries([]);
    const stream = new DeliveryStreamService(prisma as never, lock as never);
    const reply = fakeReply();

    await stream.open({
      appId: "app_1",
      lastEventId: undefined,
      reply: reply as never,
    });
    lock.stealStream("app_1");
    prisma.delivery.findMany.mockResolvedValueOnce([
      deliveryRow("row_lost", "del_lost", "queued"),
    ]);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(reply.raw.body()).not.toContain("id: del_lost\n");
    expect(reply.raw.ended).toBe(true);
  });
});

function deliveryRow(
  id: string,
  eventId: string,
  status: string,
  conversationId = "conversation_1",
  options: { createdAt?: string; sentAt?: string } = {},
) {
  return {
    id,
    appId: "app_1",
    eventId,
    eventType: "message_created",
    payload: {
      schemaVersion: 1,
      eventType: "message.created",
      messageId: `msg_${eventId}`,
    },
    status,
    createdAt: new Date(options.createdAt ?? `2026-07-06T00:00:0${eventId.at(-1)}.000Z`),
    message: {
      conversationId,
      sentAt: new Date(options.sentAt ?? `2026-07-06T00:00:0${eventId.at(-1)}.000Z`),
    },
  };
}

function prismaWithDeliveries(initialRows: ReturnType<typeof deliveryRow>[]) {
  return {
    delivery: {
      findMany: vi.fn(async () => initialRows),
      findUnique: vi.fn<() => Promise<ReturnType<typeof deliveryRow> | null>>(async () => null),
      count: vi.fn(async () => 0),
      update: vi.fn(async () => ({})),
    },
  };
}

function fakeReply() {
  const raw = new FakeRawReply();
  return { raw };
}

class FakeRawReply extends EventEmitter {
  ended = false;
  private chunks: string[] = [];
  headers: [number, Record<string, string>][] = [];

  writeHead(statusCode: number, headers: Record<string, string>) {
    this.headers.push([statusCode, headers]);
  }

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
  private readonly owners = new Map<string, string>();

  async takeoverStream(appId: string) {
    const lease = this.createLease(`stream:${appId}`);
    this.owners.set(lease.key, lease.ownerToken);
    return lease;
  }

  async acquireConversation(appId: string, conversationId: string) {
    const key = `conversation:${appId}:${conversationId}`;
    if (this.owners.has(key)) return null;
    const lease = this.createLease(key);
    this.owners.set(key, lease.ownerToken);
    return lease;
  }

  async renew(lease: { key: string; ownerToken: string }) {
    return this.owners.get(lease.key) === lease.ownerToken;
  }

  async release(lease: { key: string; ownerToken: string }) {
    if (this.owners.get(lease.key) === lease.ownerToken) {
      this.owners.delete(lease.key);
    }
  }

  stealStream(appId: string) {
    this.owners.set(`stream:${appId}`, "stolen");
  }

  private createLease(key: string) {
    return {
      key,
      ownerToken: `${key}:${Math.random()}`,
    };
  }
}
