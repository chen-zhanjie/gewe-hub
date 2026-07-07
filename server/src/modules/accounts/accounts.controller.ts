import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
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
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.wechatAccount.findMany({
      orderBy: { createdAt: "desc" }
    });
  }

  @Post()
  async create(@Body() rawBody: unknown) {
    const body = createAccountSchema.parse(rawBody);
    return this.prisma.wechatAccount.create({
      data: {
        appId: body.appId,
        wxid: body.wxid,
        nickname: body.nickname,
        platformRemark: body.platformRemark,
        source: "manual"
      }
    });
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() rawBody: unknown) {
    const body = updateAccountSchema.parse(rawBody);
    return this.prisma.wechatAccount.update({
      where: { id },
      data: body
    });
  }
}
