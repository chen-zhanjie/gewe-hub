import { describe, expect, it, vi } from "vitest";
import { AccountsController } from "../src/modules/accounts/accounts.controller.js";

describe("AccountsController", () => {
  it("按创建时间倒序列出微信账号", async () => {
    const prisma = {
      wechatAccount: {
        findMany: vi.fn(async () => [])
      }
    };
    const gewe = { checkOnline: vi.fn() };
    const controller = new AccountsController(prisma as never, gewe as never);

    await controller.list();

    expect(prisma.wechatAccount.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" }
    });
  });

  it("手动创建微信账号时写入 manual 来源并刷新在线状态", async () => {
    const prisma = {
      wechatAccount: {
        create: vi.fn(async () => ({ id: "acc_1" }))
      }
    };
    const gewe = {
      checkOnline: vi.fn(async () => ({ ret: 200, data: true })),
      getProfile: vi.fn(async () => ({
        ret: 200,
        data: {
          wxid: "wxid_bot",
          nickName: "GeWe 主号",
          smallHeadImgUrl: "https://avatar.example/small.jpg",
          bigHeadImgUrl: "https://avatar.example/big.jpg",
          country: "CN",
          province: "Guangdong",
          city: "Shenzhen"
        }
      }))
    };
    const controller = new AccountsController(prisma as never, gewe as never);

    await controller.create({
      appId: "wx_app",
      wxid: "wxid_bot",
      nickname: "客服主号",
      platformRemark: "主号"
    });

    expect(prisma.wechatAccount.create).toHaveBeenCalledWith({
      data: {
        appId: "wx_app",
        wxid: "wxid_bot",
        nickname: "GeWe 主号",
        avatarUrl: "https://avatar.example/small.jpg",
        region: "CN Guangdong Shenzhen",
        platformRemark: "主号",
        onlineStatus: "online",
        lastSyncedAt: expect.any(Date),
        source: "manual"
      }
    });
    expect(gewe.getProfile).toHaveBeenCalledWith("wx_app");
    expect(gewe.checkOnline).toHaveBeenCalledWith("wx_app");
  });

  it("新增账号时 GeWe 资料获取失败不阻断保存", async () => {
    const prisma = {
      wechatAccount: {
        create: vi.fn(async () => ({ id: "acc_1" }))
      }
    };
    const gewe = {
      checkOnline: vi.fn(async () => ({ ret: 200, data: false })),
      getProfile: vi.fn(async () => {
        throw new Error("profile failed");
      })
    };
    const controller = new AccountsController(prisma as never, gewe as never);

    await controller.create({
      appId: "wx_app",
      wxid: "wxid_bot",
      nickname: "客服主号",
      platformRemark: "主号"
    });

    expect(prisma.wechatAccount.create).toHaveBeenCalledWith({
      data: {
        appId: "wx_app",
        wxid: "wxid_bot",
        nickname: "客服主号",
        platformRemark: "主号",
        onlineStatus: "offline",
        lastSyncedAt: expect.any(Date),
        source: "manual"
      }
    });
  });

  it("编辑微信账号时只更新传入字段", async () => {
    const prisma = {
      wechatAccount: {
        update: vi.fn(async () => ({ id: "acc_1" }))
      }
    };
    const gewe = { checkOnline: vi.fn(), getProfile: vi.fn() };
    const controller = new AccountsController(prisma as never, gewe as never);

    await controller.update("acc_1", {
      nickname: "客服新名",
      platformRemark: "主控账号"
    });

    expect(prisma.wechatAccount.update).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: {
        nickname: "客服新名",
        platformRemark: "主控账号"
      }
    });
    expect(gewe.checkOnline).not.toHaveBeenCalled();
    expect(gewe.getProfile).not.toHaveBeenCalled();
  });

  it("编辑 appId 时刷新在线状态", async () => {
    const prisma = {
      wechatAccount: {
        update: vi.fn(async () => ({ id: "acc_1" }))
      }
    };
    const gewe = {
      checkOnline: vi.fn(async () => ({ ret: 200, data: false })),
      getProfile: vi.fn()
    };
    const controller = new AccountsController(prisma as never, gewe as never);

    await controller.update("acc_1", {
      appId: "wx_app_new"
    });

    expect(prisma.wechatAccount.update).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: {
        appId: "wx_app_new",
        onlineStatus: "offline"
      }
    });
    expect(gewe.checkOnline).toHaveBeenCalledWith("wx_app_new");
  });

  it("停用微信账号时保留本地审计数据并终止账号同步任务", async () => {
    const tx = {
      group: { findMany: vi.fn(async () => [{ id: "group_1" }, { id: "group_2" }]) },
      outboxTask: { updateMany: vi.fn(async () => ({ count: 0 })) },
      wechatAccount: { update: vi.fn(async () => ({ id: "acc_1", status: "disabled" })) }
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    };
    const gewe = { checkOnline: vi.fn(), getProfile: vi.fn() };
    const controller = new AccountsController(prisma as never, gewe as never);

    await controller.remove("acc_1");

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.group.findMany).toHaveBeenCalledWith({
      where: { accountId: "acc_1" },
      select: { id: true }
    });
    expect(tx.outboxTask.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["pending", "running", "failed"] },
        OR: [
          { taskType: "sync_contacts", refId: "acc_1" },
          {
            taskType: "sync_group_members",
            refId: { in: ["group_1", "group_2"] }
          }
        ]
      },
      data: {
        status: "dead",
        nextRetryAt: null,
        leaseUntil: null,
        lastError: "微信账号已停用"
      }
    });
    expect(tx.wechatAccount.update).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: {
        status: "disabled",
        statusChangedAt: expect.any(Date)
      }
    });
  });

  it("可以按账号 ID 主动同步头像昵称和在线状态", async () => {
    const prisma = {
      wechatAccount: {
        findUnique: vi.fn(async () => ({ id: "acc_1", appId: "wx_app", wxid: "wxid_old" })),
        update: vi.fn(async () => ({ id: "acc_1" }))
      }
    };
    const gewe = {
      checkOnline: vi.fn(async () => ({ ret: 200, data: true })),
      getProfile: vi.fn(async () => ({
        ret: 200,
        data: {
          wxid: "wxid_profile",
          nickName: "新版昵称",
          bigHeadImgUrl: "https://avatar.example/big.jpg",
          smallHeadImgUrl: "https://avatar.example/small.jpg"
        }
      }))
    };
    const controller = new AccountsController(prisma as never, gewe as never);

    await controller.syncProfile("acc_1");

    expect(prisma.wechatAccount.findUnique).toHaveBeenCalledWith({ where: { id: "acc_1" } });
    expect(gewe.getProfile).toHaveBeenCalledWith("wx_app");
    expect(gewe.checkOnline).toHaveBeenCalledWith("wx_app");
    expect(prisma.wechatAccount.update).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: {
        wxid: "wxid_profile",
        nickname: "新版昵称",
        avatarUrl: "https://avatar.example/small.jpg",
        onlineStatus: "online",
        lastSyncedAt: expect.any(Date)
      }
    });
  });
});
