import { Body, Controller, Get, Headers, Post, Query, Res, UnauthorizedException } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { getBearerToken } from "./delivery-utils.js";
import { DeliveryStreamService } from "./delivery-stream.service.js";
import { DeliveryService } from "./delivery.service.js";

const ackSchema = z.object({
  eventIds: z.array(z.string()).min(1)
});

@Controller("/api/apps/events")
export class DeliveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streams: DeliveryStreamService,
    private readonly delivery: DeliveryService
  ) {}

  @Get()
  async events(
    @Headers("authorization") authorization: string | undefined,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Query("lastEventId") queryLastEventId: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const token = getBearerToken(authorization);
    if (!token) throw new UnauthorizedException("缺少应用 token");
    const app = await this.prisma.hubApp.findUnique({ where: { token } });
    if (!app || app.status !== "active") throw new UnauthorizedException("应用 token 无效");

    await this.streams.open({
      appId: app.id,
      lastEventId: queryLastEventId ?? lastEventId,
      reply
    });
  }

  @Post("ack")
  async ack(@Headers("authorization") authorization: string | undefined, @Body() rawBody: unknown) {
    const token = getBearerToken(authorization);
    if (!token) throw new UnauthorizedException("缺少应用 token");
    const body = ackSchema.parse(rawBody);
    return this.delivery.ack(token, body.eventIds);
  }
}
