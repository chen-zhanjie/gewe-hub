import { Injectable, OnModuleInit } from "@nestjs/common";
import { GeweClientService } from "../gewe/gewe-client.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

interface SyncContactsInput {
  accountId: string;
  mode?: "full" | "cache";
}

interface SyncGroupMembersInput {
  groupId: string;
}

interface SyncContactInput {
  accountId: string;
  appId: string;
  wxid: string;
  deleted?: boolean;
}

interface ContactsListResponse {
  data?: {
    friends?: unknown[];
    chatrooms?: unknown[];
  };
}

interface BriefInfoResponse {
  data?: unknown[];
}

interface ChatroomMemberListResponse {
  data?: {
    chatroomOwner?: unknown;
    memberList?: unknown[];
  };
}

@Injectable()
export class ContactsSyncService implements OnModuleInit {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gewe: GeweClientService
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.enqueueScheduledContactsSync().catch(() => undefined);
    }, 6 * 60 * 60 * 1000);
    this.timer.unref();
  }

  async syncContacts(input: SyncContactsInput) {
    const account = await this.prisma.wechatAccount.findUniqueOrThrow({
      where: { id: input.accountId }
    });
    const response = await this.fetchContacts(account.appId, input.mode ?? "full");
    const friends = toStringArray((response as ContactsListResponse).data?.friends);
    const chatrooms = toStringArray((response as ContactsListResponse).data?.chatrooms);
    const briefInfo = await this.fetchBriefInfo(account.appId, [...friends, ...chatrooms]);
    const infoByWxid = new Map(briefInfo.map((item) => [item.wxid, item]));
    const now = new Date();

    for (const wxid of friends) {
      const info = infoByWxid.get(wxid);
      await this.prisma.contact.upsert({
        where: {
          accountId_wxid: {
            accountId: input.accountId,
            wxid
          }
        },
        create: {
          accountId: input.accountId,
          wxid,
          nickname: info?.nickname,
          avatarUrl: info?.avatarUrl,
          status: "active",
          statusChangedAt: now,
          lastSyncedAt: now
        },
        update: {
          nickname: info?.nickname,
          avatarUrl: info?.avatarUrl,
          status: "active",
          statusChangedAt: now,
          lastSyncedAt: now
        }
      });
    }

    for (const wxid of chatrooms) {
      const info = infoByWxid.get(wxid);
      await this.prisma.group.upsert({
        where: {
          accountId_wxid: {
            accountId: input.accountId,
            wxid
          }
        },
        create: {
          accountId: input.accountId,
          wxid,
          name: info?.nickname,
          avatarUrl: info?.avatarUrl,
          status: "active",
          statusChangedAt: now,
          lastSyncedAt: now
        },
        update: {
          name: info?.nickname,
          avatarUrl: info?.avatarUrl,
          status: "active",
          statusChangedAt: now,
          lastSyncedAt: now
        }
      });
    }

    const markedDeleted = await this.prisma.contact.updateMany({
      where: {
        accountId: input.accountId,
        status: "active",
        wxid: { notIn: friends }
      },
      data: {
        status: "deleted",
        statusChangedAt: now
      }
    });
    await this.prisma.group.updateMany?.({
      where: {
        accountId: input.accountId,
        status: "active",
        wxid: { notIn: chatrooms }
      },
      data: {
        status: "quit",
        statusChangedAt: now
      }
    });
    await this.prisma.wechatAccount.update({
      where: { id: input.accountId },
      data: { lastSyncedAt: now }
    });

    return {
      contacts: friends.length,
      groups: chatrooms.length,
      markedDeleted: markedDeleted.count
    };
  }

  async syncGroupMembers(input: SyncGroupMembersInput) {
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: input.groupId },
      include: { account: true }
    });
    const response = await this.gewe.getChatroomMemberList(group.account.appId, group.wxid);
    const data = (response as ChatroomMemberListResponse).data ?? {};
    const members = toMemberInfo(data.memberList);
    const now = new Date();

    for (const member of members) {
      await this.prisma.groupMember.upsert({
        where: {
          groupId_wxid: {
            groupId: input.groupId,
            wxid: member.wxid
          }
        },
        create: {
          groupId: input.groupId,
          wxid: member.wxid,
          nickname: member.nickname,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
          status: "active",
          statusChangedAt: now,
          lastSyncedAt: now
        },
        update: {
          nickname: member.nickname,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
          status: "active",
          statusChangedAt: now,
          lastSyncedAt: now
        }
      });
    }

    const markedLeft = await this.prisma.groupMember.updateMany({
      where: {
        groupId: input.groupId,
        status: "active",
        wxid: { notIn: members.map((member) => member.wxid) }
      },
      data: {
        status: "left",
        statusChangedAt: now
      }
    });
    await this.prisma.group.update({
      where: { id: input.groupId },
      data: {
        memberCount: members.length,
        ownerWxid: asString(data.chatroomOwner),
        lastSyncedAt: now
      }
    });

    return {
      members: members.length,
      markedLeft: markedLeft.count
    };
  }

  async syncContact(input: SyncContactInput) {
    const now = new Date();
    if (input.deleted) {
      if (input.wxid.endsWith("@chatroom")) {
        await this.prisma.group.updateMany({
          where: {
            accountId: input.accountId,
            wxid: input.wxid
          },
          data: {
            status: "quit",
            statusChangedAt: now
          }
        });
        return { kind: "group" as const, status: "quit" as const };
      }
      await this.prisma.contact.updateMany({
        where: {
          accountId: input.accountId,
          wxid: input.wxid
        },
        data: {
          status: "deleted",
          statusChangedAt: now
        }
      });
      return { kind: "contact" as const, status: "deleted" as const };
    }

    const [info] = await this.fetchBriefInfo(input.appId, [input.wxid]);
    if (input.wxid.endsWith("@chatroom")) {
      await this.prisma.group.upsert({
        where: {
          accountId_wxid: {
            accountId: input.accountId,
            wxid: input.wxid
          }
        },
        create: {
          accountId: input.accountId,
          wxid: input.wxid,
          name: info?.nickname,
          avatarUrl: info?.avatarUrl,
          status: "active",
          statusChangedAt: now,
          lastSyncedAt: now
        },
        update: {
          name: info?.nickname,
          avatarUrl: info?.avatarUrl,
          status: "active",
          statusChangedAt: now,
          lastSyncedAt: now
        }
      });
      return { kind: "group" as const, status: "active" as const };
    }

    await this.prisma.contact.upsert({
      where: {
        accountId_wxid: {
          accountId: input.accountId,
          wxid: input.wxid
        }
      },
      create: {
        accountId: input.accountId,
        wxid: input.wxid,
        nickname: info?.nickname,
        avatarUrl: info?.avatarUrl,
        status: "active",
        statusChangedAt: now,
        lastSyncedAt: now
      },
      update: {
        nickname: info?.nickname,
        avatarUrl: info?.avatarUrl,
        status: "active",
        statusChangedAt: now,
        lastSyncedAt: now
      }
    });
    return { kind: "contact" as const, status: "active" as const };
  }

  async enqueueScheduledContactsSync() {
    const accounts = await this.prisma.wechatAccount.findMany({
      where: { source: { in: ["auto", "manual"] } },
      select: { id: true }
    });
    for (const account of accounts) {
      await this.prisma.outboxTask.create({
        data: {
          taskType: "sync_contacts",
          refId: account.id,
          payload: { accountId: account.id, mode: "full", source: "schedule" },
          status: "pending"
        }
      });
    }
    return { queued: accounts.length };
  }

  private async fetchContacts(appId: string, mode: "full" | "cache") {
    return mode === "cache" ? this.gewe.fetchContactsListCache(appId) : this.gewe.fetchContactsList(appId);
  }

  private async fetchBriefInfo(appId: string, wxids: string[]) {
    if (wxids.length === 0) return [];
    const response = await this.gewe.getBriefInfo(appId, wxids);
    return toBriefInfo((response as BriefInfoResponse).data);
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
}

function toBriefInfo(value: unknown): Array<{ wxid: string; nickname?: string; avatarUrl?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const wxid = asString(record?.userName ?? record?.wxid);
    if (!wxid) return [];
    return [{
      wxid,
      nickname: asString(record?.nickName ?? record?.nickname),
      avatarUrl: asString(record?.smallHeadImgUrl ?? record?.bigHeadImgUrl ?? record?.avatarUrl)
    }];
  });
}

function toMemberInfo(value: unknown): Array<{ wxid: string; nickname?: string; displayName?: string; avatarUrl?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const wxid = asString(record?.wxid ?? record?.userName);
    if (!wxid) return [];
    return [{
      wxid,
      nickname: asString(record?.nickName ?? record?.nickname),
      displayName: asString(record?.displayName),
      avatarUrl: asString(record?.smallHeadImgUrl ?? record?.bigHeadImgUrl ?? record?.avatarUrl)
    }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}
