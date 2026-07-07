import { describe, expect, it, vi } from "vitest";
import { DeliveryAdminController } from "../src/modules/delivery/delivery-admin.controller.js";

describe("DeliveryAdminController", () => {
  it("查询 deliveries 时包含 app 和 message.conversation，并按创建时间倒序返回", async () => {
    const prisma = {
      delivery: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new DeliveryAdminController(prisma as never);

    await controller.listDeliveries(undefined, undefined, undefined, undefined, undefined, undefined);

    expect(prisma.delivery.findMany).toHaveBeenCalledWith({
      where: {},
      include: {
        app: true,
        message: {
          include: {
            conversation: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100,
      skip: 0
    });
  });

  it("支持按 status、appId 和 conversationId 过滤", async () => {
    const prisma = {
      delivery: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new DeliveryAdminController(prisma as never);

    await controller.listDeliveries("failed", "app_1", "conversation_1", undefined, "50", "20");

    expect(prisma.delivery.findMany).toHaveBeenCalledWith({
      where: {
        status: "failed",
        appId: "app_1",
        message: {
          conversationId: "conversation_1"
        }
      },
      include: {
        app: true,
        message: {
          include: {
            conversation: true
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

  it.each([
    ["success", { in: ["delivered", "acked"] }],
    ["in_progress", { in: ["queued", "delivering"] }],
    ["queued", "queued"],
    ["delivering", "delivering"],
    ["delivered", "delivered"],
    ["acked", "acked"]
  ])("查询 deliveries 时将状态分面 %s 映射为 Prisma status 条件", async (status, expectedStatus) => {
    const prisma = {
      delivery: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new DeliveryAdminController(prisma as never);

    await controller.listDeliveries(status, undefined, undefined, undefined, undefined, undefined);

    expect(prisma.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: expectedStatus
        }
      })
    );
  });

  it("支持按公开 messageId 过滤 delivery，并可与会话过滤组合", async () => {
    const prisma = {
      delivery: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new DeliveryAdminController(prisma as never);

    await controller.listDeliveries("failed", "app_1", "conversation_1", "msg_public_1", "50", "20");

    expect(prisma.delivery.findMany).toHaveBeenCalledWith({
      where: {
        status: "failed",
        appId: "app_1",
        message: {
          conversationId: "conversation_1",
          messageId: "msg_public_1"
        }
      },
      include: {
        app: true,
        message: {
          include: {
            conversation: true
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

  it("take 上限为 200", async () => {
    const prisma = {
      delivery: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new DeliveryAdminController(prisma as never);

    await controller.listDeliveries(undefined, undefined, undefined, undefined, "999", undefined);

    expect(prisma.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200
      })
    );
  });

  it("支持按 eventId 重投失败 delivery", async () => {
    const prisma = {
      delivery: {
        update: vi.fn(async () => ({
          eventId: "del_retry_1",
          status: "queued"
        }))
      }
    };
    const controller = new DeliveryAdminController(prisma as never);

    await controller.retryDelivery("del_retry_1");

    expect(prisma.delivery.update).toHaveBeenCalledWith({
      where: { eventId: "del_retry_1" },
      data: {
        status: "queued",
        attempts: 0,
        lastError: null,
        deliveredAt: null,
        ackedAt: null
      }
    });
  });
});
