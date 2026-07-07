import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
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
    const onlineStatus = await this.readOnlineStatus(body.appId);
    return this.prisma.wechatAccount.create({
      data: {
        appId: body.appId,
        wxid: body.wxid,
        nickname: body.nickname,
        platformRemark: body.platformRemark,
        onlineStatus,
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
