import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";

const contactStatusSchema = z.enum(["active", "deleted", "blocked"]);
const groupStatusSchema = z.enum(["active", "disbanded", "quit"]);
const memberStatusSchema = z.enum(["active", "left", "removed"]);

const updateContactSchema = z.object({
  platformRemark: z.string().nullable().optional(),
  status: contactStatusSchema.optional()
});

const updateGroupSchema = z.object({
  platformRemark: z.string().nullable().optional(),
  status: groupStatusSchema.optional()
});

const updateGroupMemberSchema = z.object({
  platformRemark: z.string().nullable().optional(),
  status: memberStatusSchema.optional()
});

const syncContactsSchema = z.object({
  accountId: z.string().min(1),
  mode: z.enum(["full", "cache"]).default("full")
});

@Controller()
export class ContactsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("/api/contacts/:wxid/profile")
  async profile(@Param("wxid") wxid: string, @Query("accountId") accountId?: string) {
    if (!accountId) throw new BadRequestException("联系人 profile 查询必须提供 accountId");

    const [contact, groupMemberships, privateConversation] = await Promise.all([
      this.prisma.contact.findUnique({
        where: {
          accountId_wxid: {
            accountId,
            wxid
          }
        },
        include: { account: true }
      }),
      this.prisma.groupMember.findMany({
        where: {
          wxid,
          group: {
            accountId
          }
        },
        include: { group: true },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 50
      }),
      this.prisma.conversation.findFirst({
        where: {
          accountId,
          peerWxid: wxid,
          type: "private"
        },
        include: { account: true, app: true }
      })
    ]);

    return {
      accountId,
      wxid,
      contact,
      groupMemberships,
      privateConversation,
      commonGroups: groupMemberships.map((membership) => membership.group)
    };
  }

  @Get("/api/contacts")
  async listContacts(
    @Query("accountId") accountId?: string,
    @Query("status") rawStatus?: string,
    @Query("q") q?: string
  ) {
    const status = optionalEnum(contactStatusSchema, rawStatus);
    return this.prisma.contact.findMany({
      where: {
        accountId,
        status,
        OR: buildContactSearch(q)
      },
      include: { account: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100
    });
  }

  @Patch("/api/contacts/:id")
  async updateContact(@Param("id") id: string, @Body() rawBody: unknown) {
    const body = updateContactSchema.parse(rawBody);
    return this.prisma.contact.update({
      where: { id },
      data: withStatusChangedAt(body)
    });
  }

  @Get("/api/groups")
  async listGroups(
    @Query("accountId") accountId?: string,
    @Query("status") rawStatus?: string,
    @Query("q") q?: string
  ) {
    const status = optionalEnum(groupStatusSchema, rawStatus);
    return this.prisma.group.findMany({
      where: {
        accountId,
        status,
        OR: buildGroupSearch(q)
      },
      include: { account: true, _count: { select: { members: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100
    });
  }

  @Patch("/api/groups/:id")
  async updateGroup(@Param("id") id: string, @Body() rawBody: unknown) {
    const body = updateGroupSchema.parse(rawBody);
    return this.prisma.group.update({
      where: { id },
      data: withStatusChangedAt(body)
    });
  }

  @Get("/api/groups/:id/members")
  async listGroupMembers(
    @Param("id") groupId: string,
    @Query("status") rawStatus?: string,
    @Query("q") q?: string,
    @Query("take") rawTake?: string,
    @Query("skip") rawSkip?: string
  ) {
    const status = optionalEnum(memberStatusSchema, rawStatus);
    const take = parsePaginationNumber(rawTake, 50, 1, 100);
    const skip = parsePaginationNumber(rawSkip, 0, 0, Number.MAX_SAFE_INTEGER);
    const where = {
      groupId,
      status,
      OR: buildGroupMemberSearch(q)
    };
    const [total, items] = await Promise.all([
      this.prisma.groupMember.count({ where }),
      this.prisma.groupMember.findMany({
        where,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take,
        skip
      })
    ]);
    const nextSkip = skip + items.length;
    return {
      items,
      total,
      take,
      skip,
      nextSkip,
      hasMore: nextSkip < total
    };
  }

  @Patch("/api/groups/:groupId/members/:id")
  async updateGroupMember(
    @Param("groupId") groupId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown
  ) {
    const body = updateGroupMemberSchema.parse(rawBody);
    return this.prisma.groupMember.update({
      where: { id, groupId },
      data: withStatusChangedAt(body)
    });
  }

  @Post("/api/contacts/sync")
  async syncContacts(@Body() rawBody: unknown) {
    const body = syncContactsSchema.parse(rawBody);
    const account = await this.prisma.wechatAccount.findUnique({
      where: { id: body.accountId },
      select: { id: true, status: true }
    });
    assertActiveAccount(account?.status);
    return this.prisma.outboxTask.create({
      data: {
        taskType: "sync_contacts",
        refId: body.accountId,
        payload: body,
        status: "pending"
      }
    });
  }

  @Post("/api/groups/:id/sync-members")
  async syncGroupMembers(@Param("id") groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        accountId: true,
        account: { select: { status: true } }
      }
    });
    if (!group) throw new BadRequestException("群不存在");
    assertActiveAccount(group.account.status);
    return this.prisma.outboxTask.create({
      data: {
        taskType: "sync_group_members",
        refId: groupId,
        payload: { groupId, accountId: group.accountId },
        status: "pending"
      }
    });
  }
}

function optionalEnum<T extends z.ZodEnum<[string, ...string[]]>>(schema: T, value: string | undefined): z.infer<T> | undefined {
  if (!value) return undefined;
  return schema.parse(value);
}

function assertActiveAccount(status: string | undefined): void {
  if (!status) throw new BadRequestException("账号不存在");
  if (status !== "active") throw new BadRequestException("账号已停用");
}

function withStatusChangedAt<T extends { status?: string }>(body: T): T & { statusChangedAt?: Date } {
  if (!body.status) return body;
  return {
    ...body,
    statusChangedAt: new Date()
  };
}

function parsePaginationNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function buildContactSearch(q: string | undefined) {
  if (!q) return undefined;
  return [
    { wxid: { contains: q } },
    { nickname: { contains: q } },
    { platformRemark: { contains: q } }
  ];
}

function buildGroupSearch(q: string | undefined) {
  if (!q) return undefined;
  return [
    { wxid: { contains: q } },
    { name: { contains: q } },
    { platformRemark: { contains: q } }
  ];
}

function buildGroupMemberSearch(q: string | undefined) {
  if (!q) return undefined;
  return [
    { wxid: { contains: q } },
    { nickname: { contains: q } },
    { displayName: { contains: q } },
    { platformRemark: { contains: q } }
  ];
}
