import { describe, expect, it, vi } from "vitest";
import { ContactsController } from "../src/modules/contacts/contacts.controller.js";

describe("ContactsController", () => {
  it("查询联系人 profile 时聚合基础联系人、群内身份、私聊会话和共同群", async () => {
    const groupMemberships = [
      {
        id: "member_1",
        wxid: "wxid_customer",
        displayName: "陈总",
        platformRemark: "群内决策人",
        group: {
          id: "group_1",
          wxid: "48315023241@chatroom",
          name: "客户群 A",
          platformRemark: "VIP 群"
        }
      }
    ];
    const prisma = {
      contact: {
        findUnique: vi.fn(async () => ({
          id: "contact_1",
          accountId: "acc_1",
          wxid: "wxid_customer",
          nickname: "陈可乐"
        }))
      },
      groupMember: {
        findMany: vi.fn(async () => groupMemberships)
      },
      conversation: {
        findFirst: vi.fn(async () => ({
          id: "conv_private",
          accountId: "acc_1",
          peerWxid: "wxid_customer",
          type: "private"
        }))
      }
    };
    const controller = new ContactsController(prisma as never);

    const result = await controller.profile("wxid_customer", "acc_1");

    expect(prisma.contact.findUnique).toHaveBeenCalledWith({
      where: {
        accountId_wxid: {
          accountId: "acc_1",
          wxid: "wxid_customer"
        }
      },
      include: { account: true }
    });
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
      where: {
        wxid: "wxid_customer",
        group: {
          accountId: "acc_1"
        }
      },
      include: { group: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 50
    });
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        accountId: "acc_1",
        peerWxid: "wxid_customer",
        type: "private"
      },
      include: { account: true, app: true }
    });
    expect(result).toEqual({
      accountId: "acc_1",
      wxid: "wxid_customer",
      contact: expect.objectContaining({ id: "contact_1" }),
      groupMemberships,
      privateConversation: expect.objectContaining({ id: "conv_private" }),
      commonGroups: [groupMemberships[0]?.group]
    });
  });

  it("按账号、状态和搜索词查询联系人", async () => {
    const prisma = {
      contact: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new ContactsController(prisma as never);

    await controller.listContacts("acc_1", "active", "陈");

    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: {
        accountId: "acc_1",
        status: "active",
        OR: [
          { wxid: { contains: "陈" } },
          { nickname: { contains: "陈" } },
          { platformRemark: { contains: "陈" } }
        ]
      },
      include: { account: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100
    });
  });

  it("更新联系人平台备注和软状态，不执行删除", async () => {
    const prisma = {
      contact: {
        update: vi.fn(async () => ({ id: "contact_1" }))
      }
    };
    const controller = new ContactsController(prisma as never);

    await controller.updateContact("contact_1", {
      platformRemark: "重点客户",
      status: "deleted"
    });

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: "contact_1" },
      data: {
        platformRemark: "重点客户",
        status: "deleted",
        statusChangedAt: expect.any(Date)
      }
    });
  });

  it("按账号、状态和搜索词查询群", async () => {
    const prisma = {
      group: {
        findMany: vi.fn(async () => [])
      }
    };
    const controller = new ContactsController(prisma as never);

    await controller.listGroups("acc_1", "active", "产品");

    expect(prisma.group.findMany).toHaveBeenCalledWith({
      where: {
        accountId: "acc_1",
        status: "active",
        OR: [
          { wxid: { contains: "产品" } },
          { name: { contains: "产品" } },
          { platformRemark: { contains: "产品" } }
        ]
      },
      include: { account: true, _count: { select: { members: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100
    });
  });

  it("查询群成员时按 take/skip 分页并返回总数与 hasMore", async () => {
    const prisma = {
      groupMember: {
        count: vi.fn(async () => 75),
        findMany: vi.fn(async () => Array.from({ length: 25 }, (_, index) => ({ id: `member_${51 + index}` })))
      }
    };
    const controller = new ContactsController(prisma as never);

    const result = await controller.listGroupMembers("group_1", "removed", "张", "50", "50");

    expect(prisma.groupMember.count).toHaveBeenCalledWith({
      where: {
        groupId: "group_1",
        status: "removed",
        OR: [
          { wxid: { contains: "张" } },
          { nickname: { contains: "张" } },
          { displayName: { contains: "张" } },
          { platformRemark: { contains: "张" } }
        ]
      }
    });

    expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
      where: {
        groupId: "group_1",
        status: "removed",
        OR: [
          { wxid: { contains: "张" } },
          { nickname: { contains: "张" } },
          { displayName: { contains: "张" } },
          { platformRemark: { contains: "张" } }
        ]
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 50,
      skip: 50
    });
    expect(result).toEqual({
      items: Array.from({ length: 25 }, (_, index) => ({ id: `member_${51 + index}` })),
      total: 75,
      take: 50,
      skip: 50,
      nextSkip: 75,
      hasMore: false
    });
  });

  it("更新群成员平台备注和软状态", async () => {
    const prisma = {
      groupMember: {
        update: vi.fn(async () => ({ id: "member_1" }))
      }
    };
    const controller = new ContactsController(prisma as never);

    await controller.updateGroupMember("group_1", "member_1", {
      platformRemark: "群内负责人",
      status: "left"
    });

    expect(prisma.groupMember.update).toHaveBeenCalledWith({
      where: { id: "member_1", groupId: "group_1" },
      data: {
        platformRemark: "群内负责人",
        status: "left",
        statusChangedAt: expect.any(Date)
      }
    });
  });

  it("触发账号通讯录同步时写入 outbox 任务", async () => {
    const prisma = {
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_1" }))
      }
    };
    const controller = new ContactsController(prisma as never);

    await controller.syncContacts({
      accountId: "acc_1",
      mode: "full"
    });

    expect(prisma.outboxTask.create).toHaveBeenCalledWith({
      data: {
        taskType: "sync_contacts",
        refId: "acc_1",
        payload: {
          accountId: "acc_1",
          mode: "full"
        },
        status: "pending"
      }
    });
  });

  it("触发群成员同步时写入 outbox 任务", async () => {
    const prisma = {
      outboxTask: {
        create: vi.fn(async () => ({ id: "task_2" }))
      }
    };
    const controller = new ContactsController(prisma as never);

    await controller.syncGroupMembers("group_1");

    expect(prisma.outboxTask.create).toHaveBeenCalledWith({
      data: {
        taskType: "sync_group_members",
        refId: "group_1",
        payload: {
          groupId: "group_1"
        },
        status: "pending"
      }
    });
  });
});
