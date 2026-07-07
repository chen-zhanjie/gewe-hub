import { describe, expect, it, vi } from "vitest";
import { AccountsController } from "../src/modules/accounts/accounts.controller.js";

describe("AccountsController", () => {
  it("按创建时间倒序列出微信账号", async () => {
    const prisma = {
      wechatAccount: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new AccountsController(prisma as never);

    await controller.list();

    expect(prisma.wechatAccount.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" }
    });
  });

  it("手动创建微信账号时写入 manual 来源", async () => {
    const prisma = {
      wechatAccount: {
        create: vi.fn(async () => ({ id: "acc_1" }))
      }
    };
    const controller = new AccountsController(prisma as never);

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
    const controller = new AccountsController(prisma as never);

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
  });
});
