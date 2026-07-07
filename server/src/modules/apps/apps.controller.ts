import { randomBytes } from "node:crypto";
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";

const createAppSchema = z.object({
  name: z.string().min(1),
  ownerWxid: z.string().optional(),
  mainConversationId: z.string().optional(),
  defaultDebounceMs: z.number().int().nonnegative().optional(),
  defaultMaxWaitMs: z.number().int().nonnegative().optional(),
  deliverSelfMessages: z.boolean().optional()
});

const accountRemarkSchema = z.object({
  accountId: z.string(),
  remark: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

const updateAppSchema = createAppSchema.partial().extend({
  status: z.enum(["active", "disabled"]).optional(),
  accountRemarks: z.array(accountRemarkSchema).optional()
});

@Controller("/api/apps")
export class AppsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.hubApp.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        accountRemarks: {
          include: { account: true }
        },
        _count: { select: { conversations: true, deliveries: true } }
      }
    });
  }

  @Post()
  async create(@Body() rawBody: unknown) {
    const body = createAppSchema.parse(rawBody);
    return this.prisma.hubApp.create({
      data: {
        ...body,
        token: generateToken()
      }
    });
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() rawBody: unknown) {
    const { accountRemarks, ...body } = updateAppSchema.parse(rawBody);
    const appUpdate = this.prisma.hubApp.update({
      where: { id },
      data: body
    });
    if (!accountRemarks) return appUpdate;
    return this.prisma.$transaction([
      appUpdate,
      ...accountRemarks.map((remark) =>
        this.prisma.appAccountRemark.upsert({
          where: {
            appId_accountId: {
              appId: id,
              accountId: remark.accountId
            }
          },
          create: {
            appId: id,
            accountId: remark.accountId,
            remark: remark.remark,
            tags: remark.tags ?? []
          },
          update: {
            remark: remark.remark,
            tags: remark.tags ?? []
          }
        })
      )
    ]);
  }

  @Post(":id/reset-token")
  async resetToken(@Param("id") id: string) {
    return this.prisma.hubApp.update({
      where: { id },
      data: { token: generateToken() }
    });
  }

  @Get(":id/conversations")
  async conversations(@Param("id") id: string, @Query("take") rawTake?: string, @Query("skip") rawSkip?: string) {
    const take = parsePaginationNumber(rawTake, 50, 1, 100);
    const skip = parsePaginationNumber(rawSkip, 0, 0, Number.MAX_SAFE_INTEGER);
    const where = { appId: id };
    const [total, items] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        include: { account: true },
        orderBy: { lastMessageAt: "desc" },
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

  @Post(":id/account-remarks")
  async upsertAccountRemark(@Param("id") id: string, @Body() rawBody: unknown) {
    const body = accountRemarkSchema.parse(rawBody);
    return this.prisma.appAccountRemark.upsert({
      where: {
        appId_accountId: {
          appId: id,
          accountId: body.accountId
        }
      },
      create: {
        appId: id,
        accountId: body.accountId,
        remark: body.remark,
        tags: body.tags ?? []
      },
      update: {
        remark: body.remark,
        tags: body.tags ?? []
      }
    });
  }
}

function generateToken(): string {
  return `ghub_${randomBytes(24).toString("base64url")}`;
}

function parsePaginationNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
