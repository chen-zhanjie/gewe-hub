import { describe, expect, it, vi } from "vitest";
import { AppsController } from "../src/modules/apps/apps.controller.js";

describe("AppsController", () => {
  it("列表包含绑定会话和投递计数", async () => {
    const prisma = {
      hubApp: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new AppsController(prisma as never);

    await controller.list();

    expect(prisma.hubApp.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      include: {
        accountRemarks: {
          include: { account: true }
        },
        _count: { select: { conversations: true, deliveries: true } }
      }
    });
  });

  it("编辑应用时只更新传入字段", async () => {
    const prisma = {
      hubApp: {
        update: vi.fn(async () => ({ id: "app_1" }))
      }
    };
    const controller = new AppsController(prisma as never);

    await controller.update("app_1", {
      name: "Hermes 生产应用",
      ownerWxid: "wxid_owner",
      defaultDebounceMs: 2500,
      defaultMaxWaitMs: 9000,
      deliverSelfMessages: true,
      status: "active"
    });

    expect(prisma.hubApp.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: {
        name: "Hermes 生产应用",
        ownerWxid: "wxid_owner",
        defaultDebounceMs: 2500,
        defaultMaxWaitMs: 9000,
        deliverSelfMessages: true,
        status: "active"
      }
    });
  });

  it("编辑应用时批量 upsert 应用级账号备注", async () => {
    const prisma = {
      $transaction: vi.fn(async (operations: unknown[]) => operations),
      hubApp: {
        update: vi.fn(async () => ({ id: "app_1" }))
      },
      appAccountRemark: {
        upsert: vi.fn(async () => ({ id: "remark_1" }))
      }
    };
    const controller = new AppsController(prisma as never);

    await controller.update("app_1", {
      name: "Hermes 生产应用",
      accountRemarks: [
        { accountId: "acc_1", remark: "客服主账号", tags: ["prod"] },
        { accountId: "acc_2", remark: "备用账号" }
      ]
    });

    expect(prisma.hubApp.update).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: {
        name: "Hermes 生产应用"
      }
    });
    expect(prisma.appAccountRemark.upsert).toHaveBeenCalledWith({
      where: {
        appId_accountId: {
          appId: "app_1",
          accountId: "acc_1"
        }
      },
      create: {
        appId: "app_1",
        accountId: "acc_1",
        remark: "客服主账号",
        tags: ["prod"]
      },
      update: {
        remark: "客服主账号",
        tags: ["prod"]
      }
    });
    expect(prisma.appAccountRemark.upsert).toHaveBeenCalledWith({
      where: {
        appId_accountId: {
          appId: "app_1",
          accountId: "acc_2"
        }
      },
      create: {
        appId: "app_1",
        accountId: "acc_2",
        remark: "备用账号",
        tags: []
      },
      update: {
        remark: "备用账号",
        tags: []
      }
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.any(Promise),
      expect.any(Promise),
      expect.any(Promise)
    ]);
  });

  it("查询应用绑定会话列表按最近消息倒序并返回分页结构", async () => {
    const prisma = {
      conversation: {
        count: vi.fn(async () => 75),
        findMany: vi.fn(async () => Array.from({ length: 25 }, (_, index) => ({ id: `conv_${index}` })))
      }
    };
    const controller = new AppsController(prisma as never);

    const result = await controller.conversations("app_1", "25", "50");

    expect(prisma.conversation.count).toHaveBeenCalledWith({
      where: { appId: "app_1" }
    });
    expect(prisma.conversation.findMany).toHaveBeenCalledWith({
      where: { appId: "app_1" },
      include: { account: true },
      orderBy: { lastMessageAt: "desc" },
      take: 25,
      skip: 50
    });
    expect(result).toEqual({
      items: Array.from({ length: 25 }, (_, index) => ({ id: `conv_${index}` })),
      total: 75,
      take: 25,
      skip: 50,
      nextSkip: 75,
      hasMore: false
    });
  });

  it("应用级账号备注按 appId 和 accountId upsert", async () => {
    const prisma = {
      appAccountRemark: {
        upsert: vi.fn(async () => ({ id: "remark_1" }))
      }
    };
    const controller = new AppsController(prisma as never);

    await controller.upsertAccountRemark("app_1", {
      accountId: "acc_1",
      remark: "客服主账号",
      tags: ["owner", "prod"]
    });

    expect(prisma.appAccountRemark.upsert).toHaveBeenCalledWith({
      where: {
        appId_accountId: {
          appId: "app_1",
          accountId: "acc_1"
        }
      },
      create: {
        appId: "app_1",
        accountId: "acc_1",
        remark: "客服主账号",
        tags: ["owner", "prod"]
      },
      update: {
        remark: "客服主账号",
        tags: ["owner", "prod"]
      }
    });
  });
});
