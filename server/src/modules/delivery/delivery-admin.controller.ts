import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";

const deliveryStatusSchema = z.enum(["success", "failed", "in_progress", "queued", "delivering", "delivered", "acked"]);
const DEFAULT_TAKE = 100;
const MAX_TAKE = 200;

@Controller("/api/deliveries")
export class DeliveryAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listDeliveries(
    @Query("status") status: string | undefined,
    @Query("appId") appId: string | undefined,
    @Query("conversationId") conversationId: string | undefined,
    @Query("messageId") messageId: string | undefined,
    @Query("take") rawTake: string | undefined,
    @Query("skip") rawSkip: string | undefined
  ) {
    const where: Prisma.DeliveryWhereInput = {};
    if (status) where.status = mapDeliveryStatus(status);
    if (appId) where.appId = appId;
    const messageWhere: Prisma.MessageWhereInput = {};
    if (conversationId) messageWhere.conversationId = conversationId;
    if (messageId) messageWhere.messageId = messageId;
    if (Object.keys(messageWhere).length > 0) where.message = messageWhere;

    return this.prisma.delivery.findMany({
      where,
      include: {
        app: true,
        message: {
          include: {
            conversation: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: parseTake(rawTake),
      skip: parseSkip(rawSkip)
    });
  }

  @Post(":eventId/retry")
  async retryDelivery(@Param("eventId") eventId: string) {
    return this.prisma.delivery.update({
      where: { eventId },
      data: {
        status: "queued",
        attempts: 0,
        lastError: null,
        deliveredAt: null,
        ackedAt: null
      }
    });
  }
}

function mapDeliveryStatus(status: string): NonNullable<Prisma.DeliveryWhereInput["status"]> {
  const parsed = deliveryStatusSchema.parse(status);
  switch (parsed) {
    case "success":
      return { in: ["delivered", "acked"] };
    case "in_progress":
      return { in: ["queued", "delivering"] };
    default:
      return parsed;
  }
}

function parseTake(rawTake: string | undefined): number {
  if (!rawTake) return DEFAULT_TAKE;
  const take = Number.parseInt(rawTake, 10);
  if (!Number.isFinite(take) || take < 1) return DEFAULT_TAKE;
  return Math.min(take, MAX_TAKE);
}

function parseSkip(rawSkip: string | undefined): number {
  if (!rawSkip) return 0;
  const skip = Number.parseInt(rawSkip, 10);
  if (!Number.isFinite(skip) || skip < 0) return 0;
  return skip;
}
