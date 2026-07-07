import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  firstText,
  loadConversationIdentityProfiles,
  mergeConversationIdentity,
} from "./conversation-identity.js";
import { PrismaService } from "../prisma/prisma.service.js";

const bindSchema = z.object({
  appId: z.string(),
  deliveryFilter: z.enum(["all", "at_only"]).default("all"),
  debounceMs: z.number().int().nonnegative().nullable().optional(),
  maxWaitMs: z.number().int().nonnegative().nullable().optional()
});

const updateConversationSchema = z.object({
  platformRemark: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  hidden: z.boolean().optional()
});

const openConversationSchema = z.object({
  accountId: z.string().min(1),
  peerWxid: z.string().min(1),
  type: z.enum(["private", "group"])
});

@Controller("/api/conversations")
export class ConversationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query("accountId") accountId?: string,
    @Query("q") q?: string,
    @Query("includeHidden") includeHidden?: string
  ) {
    const orderedIds = await this.findOrderedConversationIds({ accountId, q, includeHidden });
    if (orderedIds.length === 0) return [];

    const rows = await this.prisma.conversation.findMany({
      where: {
        id: { in: orderedIds }
      },
      include: { app: true, account: true }
    });
    const identityProfiles = await loadConversationIdentityProfiles(
      this.prisma,
      rows
        .filter((row) => row.accountId && row.peerWxid && row.type)
        .map((row) => ({
          accountId: row.accountId,
          peerWxid: row.peerWxid,
          type: row.type,
        })),
    );
    const byId = new Map(rows.map((row) => [row.id, mergeConversationIdentity(row, identityProfiles)]));
    return orderedIds.map((id) => byId.get(id)).filter((row): row is (typeof rows)[number] => Boolean(row));
  }

  @Get(":id/messages")
  async messages(@Param("id") id: string, @Query("take") take?: string, @Query("before") before?: string) {
    const cursorMessage = before
      ? await this.prisma.message.findUnique({ where: { messageId: before } })
      : null;
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        sentAt: cursorMessage ? { lt: cursorMessage.sentAt } : undefined
      },
      orderBy: { sentAt: "desc" },
      take: Math.min(Number(take ?? 30), 100),
      include: {
        deliveries: true,
        webhookEvent: { select: { rawPayload: true } },
        account: {
          select: {
            id: true,
            wxid: true,
            nickname: true,
            avatarUrl: true,
            platformRemark: true,
            onlineStatus: true
          }
        },
        conversation: {
          select: {
            id: true,
            accountId: true,
            peerWxid: true,
            type: true,
            name: true,
            avatarUrl: true,
            platformRemark: true
          }
        }
      }
    });
    return this.attachSenderProfiles(messages);
  }

  @Post("open")
  async open(@Body() rawBody: unknown) {
    const body = openConversationSchema.parse(rawBody);
    const account = await this.prisma.wechatAccount.findUnique({
      where: { id: body.accountId },
      select: { id: true }
    });
    if (!account) throw new BadRequestException("账号不存在");

    const profile = body.type === "private"
      ? await this.loadOpenContactProfile(body.accountId, body.peerWxid)
      : await this.loadOpenGroupProfile(body.accountId, body.peerWxid);

    const conversation = await this.prisma.conversation.upsert({
      where: {
        accountId_peerWxid: {
          accountId: body.accountId,
          peerWxid: body.peerWxid
        }
      },
      create: {
        accountId: body.accountId,
        peerWxid: body.peerWxid,
        type: body.type,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        platformRemark: profile.platformRemark,
        status: "active"
      },
      update: {
        type: body.type,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        platformRemark: profile.platformRemark,
        isHidden: false,
        status: "active"
      },
      include: { app: true, account: true }
    });
    return body.type === "group" ? { ...conversation, memberCount: profile.memberCount ?? null } : conversation;
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() rawBody: unknown) {
    const body = updateConversationSchema.parse(rawBody);
    const data = buildConversationUpdateData(body);
    return this.prisma.conversation.update({
      where: { id },
      data
    });
  }

  @Post(":id/read")
  async markRead(@Param("id") id: string) {
    return this.prisma.conversation.update({
      where: { id },
      data: {
        unreadCount: 0,
        lastOpenedAt: new Date()
      }
    });
  }

  @Post(":id/bind")
  async bind(@Param("id") id: string, @Body() rawBody: unknown) {
    const body = bindSchema.parse(rawBody);
    const existing = await this.prisma.conversation.findUnique({ where: { id } });
    if (existing?.appId && existing.appId !== body.appId) {
      throw new BadRequestException("会话已绑定应用，改绑前必须先解绑");
    }
    return this.prisma.conversation.update({
      where: { id },
      data: {
        appId: body.appId,
        deliveryFilter: body.deliveryFilter,
        debounceMs: body.debounceMs,
        maxWaitMs: body.maxWaitMs
      }
    });
  }

  @Post(":id/unbind")
  async unbind(@Param("id") id: string) {
    return this.prisma.conversation.update({
      where: { id },
      data: {
        appId: null,
        deliveryFilter: "all",
        debounceMs: null,
        maxWaitMs: null
      }
    });
  }

  private async attachSenderProfiles<T extends MessageWithIdentityContext>(messages: T[]) {
    if (messages.length === 0) return messages;
    const firstConversation = messages[0]?.conversation;
    if (!firstConversation) return messages;
    const senderWxids = Array.from(new Set(messages.map((message) => message.senderWxid).filter(Boolean)));
    if (senderWxids.length === 0) return messages;

    const profiles = new Map<string, SenderProfile>();
    if (firstConversation.type === "group") {
      const group = await this.prisma.group.findFirst({
        where: {
          accountId: firstConversation.accountId,
          wxid: firstConversation.peerWxid
        },
        include: {
          members: {
            where: { wxid: { in: senderWxids } }
          }
        }
      });
      for (const member of group?.members ?? []) {
        profiles.set(member.wxid, {
          wxid: member.wxid,
          nickname: member.nickname,
          displayName: member.displayName,
          platformRemark: member.platformRemark,
          avatarUrl: member.avatarUrl,
          status: member.status
        });
      }
      const missingSenderWxids = senderWxids.filter((wxid) => !profiles.has(wxid));
      if (missingSenderWxids.length > 0) {
        const contacts = await this.prisma.contact.findMany({
          where: {
            accountId: firstConversation.accountId,
            wxid: { in: missingSenderWxids }
          }
        });
        for (const contact of contacts) {
          profiles.set(contact.wxid, {
            wxid: contact.wxid,
            nickname: contact.nickname,
            platformRemark: contact.platformRemark,
            avatarUrl: contact.avatarUrl,
            status: contact.status
          });
        }
      }
    } else {
      const contacts = await this.prisma.contact.findMany({
        where: {
          accountId: firstConversation.accountId,
          wxid: { in: senderWxids }
        }
      });
      for (const contact of contacts) {
        profiles.set(contact.wxid, {
          wxid: contact.wxid,
          nickname: contact.nickname,
          platformRemark: contact.platformRemark,
          avatarUrl: contact.avatarUrl,
          status: contact.status
        });
      }
    }

    return messages.map((message) => ({
      ...message,
      senderProfile: profiles.get(message.senderWxid) ?? fallbackSenderProfile(message)
    }));
  }

  private async findOrderedConversationIds(input: { accountId?: string; q?: string; includeHidden?: string }) {
    const conditions: Prisma.Sql[] = [];
    if (input.accountId) conditions.push(Prisma.sql`c.account_id = ${input.accountId}`);
    if (input.includeHidden !== "true") conditions.push(Prisma.sql`c.is_hidden = false`);
    const query = input.q?.trim();
    if (query) {
      const like = `%${query}%`;
      conditions.push(Prisma.sql`(
        c.peer_wxid LIKE ${like}
        OR c.name LIKE ${like}
        OR c.platform_remark LIKE ${like}
        OR contact.nickname LIKE ${like}
        OR contact.platform_remark LIKE ${like}
        OR grp.name LIKE ${like}
        OR grp.platform_remark LIKE ${like}
      )`);
    }
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT c.id
      FROM conversations c
      LEFT JOIN contacts contact
        ON contact.account_id = c.account_id
        AND contact.wxid = c.peer_wxid
        AND c.type = 'private'
      LEFT JOIN ${Prisma.raw("`groups`")} grp
        ON grp.account_id = c.account_id
        AND grp.wxid = c.peer_wxid
        AND c.type = 'group'
      ${where}
      ORDER BY
        c.pinned_at IS NULL ASC,
        GREATEST(
          COALESCE(c.last_message_at, CAST('1970-01-01 00:00:00' AS DATETIME)),
          COALESCE(c.last_opened_at, CAST('1970-01-01 00:00:00' AS DATETIME))
        ) DESC,
        c.updated_at DESC
      LIMIT 100
    `);
    return rows.map((row) => row.id);
  }

  private async loadOpenContactProfile(accountId: string, peerWxid: string): Promise<OpenConversationProfile> {
    const contact = await this.prisma.contact.findUnique({
      where: {
        accountId_wxid: {
          accountId,
          wxid: peerWxid
        }
      }
    });
    if (!contact) throw new BadRequestException("联系人不存在或尚未同步");
    if (contact.status !== "active") throw new BadRequestException("联系人状态不可用");
    return {
      name: firstText(contact.nickname, contact.wxid) ?? contact.wxid,
      avatarUrl: firstText(contact.avatarUrl) ?? null,
      platformRemark: firstText(contact.platformRemark) ?? null
    };
  }

  private async loadOpenGroupProfile(accountId: string, peerWxid: string): Promise<OpenConversationProfile> {
    const group = await this.prisma.group.findUnique({
      where: {
        accountId_wxid: {
          accountId,
          wxid: peerWxid
        }
      }
    });
    if (!group) throw new BadRequestException("群聊不存在或尚未同步");
    if (group.status !== "active") throw new BadRequestException("群聊状态不可用");
    return {
      name: firstText(group.name, group.wxid) ?? group.wxid,
      avatarUrl: firstText(group.avatarUrl) ?? null,
      platformRemark: firstText(group.platformRemark) ?? null,
      memberCount: group.memberCount ?? null
    };
  }
}

function buildConversationUpdateData(body: z.infer<typeof updateConversationSchema>) {
  const data: {
    platformRemark?: string | null;
    pinnedAt?: Date | null;
    isHidden?: boolean;
  } = {};
  if ("platformRemark" in body) data.platformRemark = body.platformRemark;
  if (body.pinned === true) data.pinnedAt = new Date();
  if (body.pinned === false) data.pinnedAt = null;
  if (body.hidden !== undefined) data.isHidden = body.hidden;
  return data;
}

interface SenderProfile {
  wxid: string;
  nickname?: string | null;
  displayName?: string | null;
  platformRemark?: string | null;
  avatarUrl?: string | null;
  status?: string;
}

interface OpenConversationProfile {
  name: string | null;
  avatarUrl: string | null;
  platformRemark: string | null;
  memberCount?: number | null;
}

interface MessageWithIdentityContext {
  senderWxid: string;
  account?: {
    wxid: string;
    nickname?: string | null;
    avatarUrl?: string | null;
    platformRemark?: string | null;
    onlineStatus?: string;
  } | null;
  conversation?: {
    accountId: string;
    peerWxid: string;
    type: "private" | "group";
  } | null;
}

function fallbackSenderProfile(message: MessageWithIdentityContext): SenderProfile {
  if (message.account?.wxid === message.senderWxid) {
    return {
      wxid: message.account.wxid,
      nickname: message.account.nickname,
      platformRemark: message.account.platformRemark,
      avatarUrl: message.account.avatarUrl,
      status: message.account.onlineStatus
    };
  }
  return { wxid: message.senderWxid, status: "unknown" };
}
