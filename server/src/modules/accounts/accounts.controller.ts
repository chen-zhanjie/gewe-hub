import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { GeweClientService } from "../gewe/gewe-client.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const createAccountSchema = z.object({
  appId: z.string().min(1),
  wxid: z.string().min(1),
  nickname: z.string().optional(),
  platformRemark: z.string().optional()
});

const updateAccountSchema = createAccountSchema.partial();

interface AccountProfileSnapshot {
  wxid?: string;
  nickname?: string;
  avatarUrl?: string;
  region?: string;
}

@Controller("/api/accounts")
export class AccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gewe: GeweClientService
  ) {}

  @Get()
  async list() {
    return this.prisma.wechatAccount.findMany({
      orderBy: { createdAt: "desc" }
    });
  }

  @Post()
  async create(@Body() rawBody: unknown) {
    const body = createAccountSchema.parse(rawBody);
    const [profile, onlineStatus] = await Promise.all([
      this.readAccountProfile(body.appId, { strict: false }),
      this.readOnlineStatus(body.appId)
    ]);
    return this.prisma.wechatAccount.create({
      data: {
        appId: body.appId,
        wxid: profile?.wxid ?? body.wxid,
        nickname: profile?.nickname ?? body.nickname,
        ...(profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
        ...(profile?.region ? { region: profile.region } : {}),
        platformRemark: body.platformRemark,
        onlineStatus,
        lastSyncedAt: new Date(),
        source: "manual"
      }
    });
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() rawBody: unknown) {
    const body = updateAccountSchema.parse(rawBody);
    const onlineStatus = body.appId ? await this.readOnlineStatus(body.appId) : undefined;
    return this.prisma.wechatAccount.update({
      where: { id },
      data: {
        ...body,
        ...(onlineStatus ? { onlineStatus } : {})
      }
    });
  }

  @Post(":id/sync-profile")
  async syncProfile(@Param("id") id: string) {
    const account = await this.prisma.wechatAccount.findUnique({ where: { id } });
    if (!account) throw new BadRequestException("账号不存在");
    const [profile, onlineStatus] = await Promise.all([
      this.readAccountProfile(account.appId, { strict: true }),
      this.readOnlineStatus(account.appId)
    ]);
    return this.prisma.wechatAccount.update({
      where: { id },
      data: {
        ...profile,
        onlineStatus,
        lastSyncedAt: new Date()
      }
    });
  }

  private async readAccountProfile(appId: string, options: { strict: boolean }): Promise<AccountProfileSnapshot | undefined> {
    try {
      const response = await this.gewe.getProfile(appId);
      const error = readGeweBusinessError(response);
      if (error) throw new Error(error);
      const profile = normalizeAccountProfile(response);
      return hasProfileValue(profile) ? profile : undefined;
    } catch (error) {
      if (options.strict) {
        const message = error instanceof Error ? error.message : "未知错误";
        throw new BadRequestException(`GeWe 获取账号资料失败: ${message}`);
      }
      return undefined;
    }
  }

  private async readOnlineStatus(appId: string): Promise<"online" | "offline" | "unknown"> {
    try {
      const response = await this.gewe.checkOnline(appId);
      const record = response as { data?: unknown };
      if (record.data === true) return "online";
      if (record.data === false) return "offline";
      return "unknown";
    } catch {
      return "unknown";
    }
  }
}

function normalizeAccountProfile(response: unknown): AccountProfileSnapshot {
  const record = response as { data?: unknown };
  const data = isRecord(record.data) ? record.data : {};
  return {
    wxid: firstText(data.wxid, data.userName, data.username),
    nickname: firstText(data.nickName, data.nickname, data.name),
    avatarUrl: firstText(data.smallHeadImgUrl, data.bigHeadImgUrl, data.avatarUrl, data.avatar),
    region: joinProfileRegion(data.country, data.province, data.city)
  };
}

function readGeweBusinessError(response: unknown): string | undefined {
  const record = response as { ret?: unknown; msg?: unknown };
  const ret = Number(record.ret);
  if (!Number.isFinite(ret) || ret === 200 || ret === 0) return undefined;
  return firstText(record.msg) ?? `ret=${record.ret}`;
}

function hasProfileValue(profile: AccountProfileSnapshot): boolean {
  return Boolean(profile.wxid || profile.nickname || profile.avatarUrl || profile.region);
}

function joinProfileRegion(...values: unknown[]): string | undefined {
  const region = values.map((value) => firstText(value)).filter(Boolean).join(" ");
  return region || undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) return text;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
