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
    const gewe = { checkOnline: vi.fn(async () => ({ ret: 200, data: true })) };
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
        onlineStatus: "online",
        source: "manual"
      }
    });
    expect(gewe.checkOnline).toHaveBeenCalledWith("wx_app");
  });

  it("编辑微信账号时只更新传入字段", async () => {
    const prisma = {
      wechatAccount: {
        update: vi.fn(async () => ({ id: "acc_1" }))
      }
    };
    const gewe = { checkOnline: vi.fn() };
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
  });

  it("编辑 appId 时刷新在线状态", async () => {
    const prisma = {
      wechatAccount: {
        update: vi.fn(async () => ({ id: "acc_1" }))
      }
    };
    const gewe = { checkOnline: vi.fn(async () => ({ ret: 200, data: false })) };
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
});
