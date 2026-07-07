import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ConversationsController } from "../src/modules/conversations/conversations.controller.js";

describe("ConversationsController", () => {
  it("会话列表一次性带齐会话展示身份信息，避免前端 N+1 查询", async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [
        { id: "conv_recent_open" },
        { id: "conv_recent_message" },
      ]),
      conversation: {
        findMany: vi.fn(async () => [
          { id: "conv_recent_message" },
          { id: "conv_recent_open" },
        ])
      }
    };
    const controller = new ConversationsController(prisma as never);

    const rows = await controller.list("acc_1", "产品");

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["conv_recent_open", "conv_recent_message"] },
        }),
        include: expect.objectContaining({
          app: true,
          account: true,
        }),
      }),
    );
    expect(rows.map((row) => row.id)).toEqual(["conv_recent_open", "conv_recent_message"]);
  });

  it("会话列表使用联系人和群聊资料补齐名称与头像", async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ id: "conv_private" }, { id: "conv_group" }]),
      conversation: {
        findMany: vi.fn(async () => [
          {
            id: "conv_private",
            accountId: "acc_1",
            peerWxid: "wxid_friend",
            type: "private",
            name: null,
            avatarUrl: null,
            platformRemark: null,
            app: null,
            account: { id: "acc_1" },
          },
          {
            id: "conv_group",
            accountId: "acc_1",
            peerWxid: "room@chatroom",
            type: "group",
            name: null,
            avatarUrl: null,
            platformRemark: null,
            app: null,
            account: { id: "acc_1" },
          },
        ]),
      },
      contact: {
        findMany: vi.fn(async () => [
          {
            accountId: "acc_1",
            wxid: "wxid_friend",
            nickname: "陈可乐",
            avatarUrl: "https://avatar.example/friend.jpg",
            platformRemark: null,
          },
        ]),
      },
      group: {
        findMany: vi.fn(async () => [
          {
            accountId: "acc_1",
            wxid: "room@chatroom",
            name: "gewe群聊测试",
            avatarUrl: "https://avatar.example/group.jpg",
            platformRemark: null,
          },
        ]),
      },
    };
    const controller = new ConversationsController(prisma as never);

    const rows = await controller.list("acc_1");

    expect(rows).toMatchObject([
      {
        id: "conv_private",
        name: "陈可乐",
        avatarUrl: "https://avatar.example/friend.jpg",
      },
      {
        id: "conv_group",
        name: "gewe群聊测试",
        avatarUrl: "https://avatar.example/group.jpg",
      },
    ]);
  });

  it("会话列表支持显式包含隐藏会话用于管理视图", async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => []),
      conversation: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new ConversationsController(prisma as never);

    await controller.list("acc_1", undefined, "true");

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it("消息列表一次性带齐发送者快照与原始 payload、投递记录", async () => {
    const prisma = {
      message: {
        findUnique: vi.fn(),
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new ConversationsController(prisma as never);

    await controller.messages("conv_1", "50");

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          deliveries: true,
          webhookEvent: expect.objectContaining({
            select: { rawPayload: true }
          }),
          account: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              wxid: true,
              nickname: true,
              avatarUrl: true,
              platformRemark: true,
              onlineStatus: true,
            })
          }),
          conversation: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              accountId: true,
              peerWxid: true,
              type: true,
              name: true,
              avatarUrl: true,
              platformRemark: true,
            })
          }),
        }),
      }),
    );
  });

  it("群成员未同步时从联系人表回退补齐群消息发送者资料", async () => {
    const prisma = {
      message: {
        findUnique: vi.fn(),
        findMany: vi.fn(async () => [
          {
            id: "message_1",
            senderWxid: "wxid_sender",
            account: { wxid: "wxid_bot" },
            conversation: {
              accountId: "acc_1",
              peerWxid: "room@chatroom",
              type: "group",
            },
          },
        ]),
      },
      group: {
        findFirst: vi.fn(async () => ({ members: [] })),
      },
      contact: {
        findMany: vi.fn(async () => [
          {
            wxid: "wxid_sender",
            nickname: "陈可乐",
            platformRemark: null,
            avatarUrl: "https://avatar.example/sender.jpg",
            status: "active",
          },
        ]),
      },
    };
    const controller = new ConversationsController(prisma as never);

    const rows = await controller.messages("conv_1", "50");

    expect(rows[0]).toMatchObject({
      senderProfile: {
        wxid: "wxid_sender",
        nickname: "陈可乐",
        avatarUrl: "https://avatar.example/sender.jpg",
      },
    });
  });

  it("编辑会话备注时只更新 platformRemark 字段", async () => {
    const prisma = {
      conversation: {
        update: vi.fn(async () => ({ id: "conv_1", platformRemark: "重点客户群" }))
      }
    };
    const controller = new ConversationsController(prisma as never);

    await controller.update("conv_1", {
      platformRemark: "重点客户群"
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: {
        platformRemark: "重点客户群"
      }
    });
  });

  it("更新置顶和隐藏状态时映射到 pinnedAt 与 isHidden 字段", async () => {
    const prisma = {
      conversation: {
        update: vi.fn(async () => ({ id: "conv_1", pinnedAt: new Date(), isHidden: true }))
      }
    };
    const controller = new ConversationsController(prisma as never);

    await controller.update("conv_1", {
      pinned: true,
      hidden: true
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: {
        pinnedAt: expect.any(Date),
        isHidden: true
      }
    });
  });

  it("取消置顶时将 pinnedAt 清空", async () => {
    const prisma = {
      conversation: {
        update: vi.fn(async () => ({ id: "conv_1", pinnedAt: null }))
      }
    };
    const controller = new ConversationsController(prisma as never);

    await controller.update("conv_1", {
      pinned: false
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: {
        pinnedAt: null
      }
    });
  });

  it("标为已读时清空未读并更新 lastOpenedAt", async () => {
    const prisma = {
      conversation: {
        update: vi.fn(async () => ({ id: "conv_1", unreadCount: 0 }))
      }
    };
    const controller = new ConversationsController(prisma as never);

    await controller.markRead("conv_1");

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv_1" },
      data: {
        unreadCount: 0,
        lastOpenedAt: expect.any(Date)
      }
    });
  });

  it("改绑到其他应用前必须先解绑，并返回 BadRequestException", async () => {
    const prisma = {
      conversation: {
        findUnique: vi.fn(async () => ({
          id: "conv_1",
          appId: "app_existing"
        })),
        update: vi.fn()
      }
    };
    const controller = new ConversationsController(prisma as never);

    await expect(
      controller.bind("conv_1", {
        appId: "app_next",
        deliveryFilter: "all",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });
});
