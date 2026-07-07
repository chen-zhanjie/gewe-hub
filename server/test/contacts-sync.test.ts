import { describe, expect, it, vi } from "vitest";
import { ContactsSyncService } from "../src/modules/contacts/contacts-sync.service.js";

describe("ContactsSyncService", () => {
  it("同步通讯录时 upsert 联系人和群，并软标记缺失联系人", async () => {
    const prisma = {
      wechatAccount: {
        findUniqueOrThrow: vi.fn(async () => ({ id: "acc_1", appId: "wx_app" })),
        update: vi.fn(async () => ({}))
      },
      contact: {
        findMany: vi.fn(async () => [{ wxid: "wxid_old", status: "active", statusChangedAt: null }]),
        upsert: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      group: {
        upsert: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      fetchContactsList: vi.fn(async () => ({
        data: {
          friends: ["wxid_a"],
          chatrooms: ["10000@chatroom"]
        }
      })),
      getBriefInfo: vi.fn(async () => ({
        data: [
          { userName: "wxid_a", nickName: "Alice", smallHeadImgUrl: "https://avatar/a.jpg" },
          { userName: "10000@chatroom", nickName: "产品群", smallHeadImgUrl: "https://avatar/g.jpg" }
        ]
      }))
    };
    const service = new ContactsSyncService(prisma as never, gewe as never);

    const result = await service.syncContacts({ accountId: "acc_1", mode: "full" });

    expect(result).toEqual({ contacts: 1, groups: 1, markedDeleted: 1 });
    expect(gewe.fetchContactsList).toHaveBeenCalledWith("wx_app");
    expect(gewe.getBriefInfo).toHaveBeenCalledWith("wx_app", ["wxid_a", "10000@chatroom"]);
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_wxid: { accountId: "acc_1", wxid: "wxid_a" } },
        create: expect.objectContaining({
          accountId: "acc_1",
          wxid: "wxid_a",
          nickname: "Alice",
          avatarUrl: "https://avatar/a.jpg",
          status: "active"
        }),
        update: expect.objectContaining({
          nickname: "Alice",
          avatarUrl: "https://avatar/a.jpg",
          status: "active"
        })
      })
    );
    expect(prisma.group.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_wxid: { accountId: "acc_1", wxid: "10000@chatroom" } },
        create: expect.objectContaining({
          accountId: "acc_1",
          wxid: "10000@chatroom",
          name: "产品群",
          avatarUrl: "https://avatar/g.jpg",
          status: "active"
        })
      })
    );
    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: {
        accountId: "acc_1",
        status: "active",
        wxid: { notIn: ["wxid_a"] }
      },
      data: {
        status: "deleted",
        statusChangedAt: expect.any(Date)
      }
    });
  });

  it("同步群成员时 upsert 当前成员，并软标记缺失成员为 left", async () => {
    const prisma = {
      group: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "group_1",
          wxid: "10000@chatroom",
          account: { appId: "wx_app" }
        })),
        update: vi.fn(async () => ({}))
      },
      groupMember: {
        findMany: vi.fn(async () => [{ wxid: "wxid_old", status: "active", statusChangedAt: null }]),
        upsert: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };
    const gewe = {
      getChatroomMemberList: vi.fn(async () => ({
        data: {
          chatroomOwner: "wxid_a",
          memberList: [
            {
              wxid: "wxid_a",
              nickName: "Alice",
              displayName: "A",
              smallHeadImgUrl: "https://avatar/a.jpg"
            }
          ]
        }
      }))
    };
    const service = new ContactsSyncService(prisma as never, gewe as never);

    const result = await service.syncGroupMembers({ groupId: "group_1" });

    expect(result).toEqual({ members: 1, markedLeft: 1 });
    expect(gewe.getChatroomMemberList).toHaveBeenCalledWith("wx_app", "10000@chatroom");
    expect(prisma.groupMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId_wxid: { groupId: "group_1", wxid: "wxid_a" } },
        create: expect.objectContaining({
          groupId: "group_1",
          wxid: "wxid_a",
          nickname: "Alice",
          displayName: "A",
          avatarUrl: "https://avatar/a.jpg",
          status: "active"
        })
      })
    );
    expect(prisma.groupMember.updateMany).toHaveBeenCalledWith({
      where: {
        groupId: "group_1",
        status: "active",
        wxid: { notIn: ["wxid_a"] }
      },
      data: {
        status: "left",
        statusChangedAt: expect.any(Date)
      }
    });
    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: "group_1" },
      data: {
        memberCount: 1,
        ownerWxid: "wxid_a",
        lastSyncedAt: expect.any(Date)
      }
    });
  });

  it("联系人变更回调触发单点同步，不扫描全量通讯录", async () => {
    const prisma = {
      contact: {
        upsert: vi.fn(async () => ({}))
      },
      group: {
        upsert: vi.fn(async () => ({}))
      }
    };
    const gewe = {
      getBriefInfo: vi.fn(async () => ({
        data: [
          { userName: "filehelper", nickName: "文件传输助手", smallHeadImgUrl: "https://avatar/filehelper.jpg" }
        ]
      }))
    };
    const service = new ContactsSyncService(prisma as never, gewe as never);

    const result = await service.syncContact({
      accountId: "acc_1",
      appId: "wx_app",
      wxid: "filehelper",
      deleted: false
    });

    expect(result).toEqual({ kind: "contact", status: "active" });
    expect(gewe.getBriefInfo).toHaveBeenCalledWith("wx_app", ["filehelper"]);
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_wxid: { accountId: "acc_1", wxid: "filehelper" } },
        create: expect.objectContaining({
          accountId: "acc_1",
          wxid: "filehelper",
          nickname: "文件传输助手",
          avatarUrl: "https://avatar/filehelper.jpg",
          status: "active"
        })
      })
    );
    expect(prisma.group.upsert).not.toHaveBeenCalled();
  });

  it("联系人删除回调只做软删除", async () => {
    const prisma = {
      contact: {
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      group: {
        updateMany: vi.fn(async () => ({ count: 0 }))
      }
    };
    const gewe = {
      getBriefInfo: vi.fn()
    };
    const service = new ContactsSyncService(prisma as never, gewe as never);

    const result = await service.syncContact({
      accountId: "acc_1",
      appId: "wx_app",
      wxid: "wxid_deleted",
      deleted: true
    });

    expect(result).toEqual({ kind: "contact", status: "deleted" });
    expect(gewe.getBriefInfo).not.toHaveBeenCalled();
    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: {
        accountId: "acc_1",
        wxid: "wxid_deleted"
      },
      data: {
        status: "deleted",
        statusChangedAt: expect.any(Date)
      }
    });
  });

  it("周期同步把所有账号写入 sync_contacts 任务", async () => {
    const prisma = {
      wechatAccount: {
        findMany: vi.fn(async () => [
          { id: "acc_1" },
          { id: "acc_2" }
        ])
      },
      outboxTask: {
        create: vi.fn(async () => ({}))
      }
    };
    const service = new ContactsSyncService(prisma as never, {} as never);

    const result = await service.enqueueScheduledContactsSync();

    expect(result).toEqual({ queued: 2 });
    expect(prisma.outboxTask.create).toHaveBeenCalledTimes(2);
    expect(prisma.outboxTask.create).toHaveBeenNthCalledWith(1, {
      data: {
        taskType: "sync_contacts",
        refId: "acc_1",
        payload: { accountId: "acc_1", mode: "full", source: "schedule" },
        status: "pending"
      }
    });
  });
});
