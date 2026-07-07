import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { sendRequestSchema } from "@gewehub/contracts";
import { z } from "zod";
import { getBearerToken } from "../delivery/delivery-utils.js";
import { GeweClientService } from "../gewe/gewe-client.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { mapSendRequestToGewe } from "./send-utils.js";

const sendRequestStatusSchema = z.enum(["success", "failed", "in_progress", "pending", "sent", "unknown"]);
const DEFAULT_TAKE = 100;
const MAX_TAKE = 200;

@Controller()
export class SendController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gewe: GeweClientService
  ) {}

  @Post("/api/send")
  async send(@Headers("authorization") authorization: string | undefined, @Body() rawBody: unknown) {
    const appToken = getBearerToken(authorization);
    const app = appToken ? await this.prisma.hubApp.findUnique({ where: { token: appToken } }) : null;
    if (appToken && (!app || app.status !== "active")) {
      throw new UnauthorizedException("应用 token 无效");
    }

    const body = sendRequestSchema.parse(rawBody);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: body.conversationId },
      include: { account: true }
    });
    const mapped = mapSendRequestToGewe({
      appId: conversation.account.appId,
      peerWxid: conversation.peerWxid,
      type: body.type,
      text: body.text,
      mediaUrl: body.mediaUrl,
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      contentBase64: body.contentBase64,
      mimeType: body.mimeType,
      thumbUrl: body.thumbUrl,
      title: body.title,
      desc: body.desc,
      linkUrl: body.linkUrl,
      durationMs: body.durationMs,
      mentions: body.mentions
    });

    const sendRequest = await this.prisma.sendRequest.create({
      data: {
        appId: app?.id ?? null,
        accountId: conversation.accountId,
        conversationId: conversation.id,
        type: body.type,
        requestPayload: body as unknown as Prisma.InputJsonValue,
        geweRequest: mapped as unknown as Prisma.InputJsonValue,
        status: "pending"
      }
    });
    await this.prisma.outboxTask.create({
      data: {
        taskType: "send",
        refId: sendRequest.id,
        payload: { sendRequestId: sendRequest.id },
        status: "pending",
        priority: 40
      }
    });
    return sendRequest;
  }

  @Post("/api/send/:id/revoke")
  async revoke(@Param("id") id: string) {
    const sendRequest = await this.prisma.sendRequest.findUniqueOrThrow({
      where: { id },
      include: {
        conversation: {
          include: { account: true }
        }
      }
    });
    if (sendRequest.status !== "sent") {
      throw new BadRequestException("只能撤回已发送成功的消息");
    }
    if (!sendRequest.resultMsgId || !sendRequest.resultNewMsgId || !sendRequest.resultCreateTime) {
      throw new BadRequestException("发送记录缺少撤回所需三件套");
    }

    const revokeResponse = await this.gewe.revokeMessage({
      appId: sendRequest.conversation.account.appId,
      toWxid: sendRequest.conversation.peerWxid,
      msgId: sendRequest.resultMsgId,
      newMsgId: sendRequest.resultNewMsgId,
      createTime: sendRequest.resultCreateTime
    });
    const revokedAt = new Date();
    await this.prisma.message.updateMany({
      where: { sendRequestId: sendRequest.id },
      data: {
        status: "revoked",
        revokedAt
      }
    });

    return this.prisma.sendRequest.update({
      where: { id },
      data: {
        geweResponse: mergeRevokeResponse(sendRequest.geweResponse, revokeResponse) as Prisma.InputJsonValue
      }
    });
  }

  @Get("/api/send-requests")
  async list(
    @Query("status") status: string | undefined,
    @Query("take") rawTake: string | undefined,
    @Query("skip") rawSkip: string | undefined
  ) {
    const where: Prisma.SendRequestWhereInput = {};
    if (status) where.status = mapSendRequestStatus(status);

    return this.prisma.sendRequest.findMany({
      where,
      include: { conversation: true, app: true },
      orderBy: { createdAt: "desc" },
      take: parseTake(rawTake),
      skip: parseSkip(rawSkip)
    });
  }

  @Get("/api/send-requests/:id")
  async detail(@Param("id") id: string) {
    return this.prisma.sendRequest.findUniqueOrThrow({
      where: { id },
      include: { conversation: true, app: true }
    });
  }
}

function mapSendRequestStatus(status: string): NonNullable<Prisma.SendRequestWhereInput["status"]> {
  const parsed = sendRequestStatusSchema.parse(status);
  switch (parsed) {
    case "success":
      return "sent";
    case "in_progress":
      return "pending";
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

function mergeRevokeResponse(previous: Prisma.JsonValue, revokeResponse: unknown): Prisma.InputJsonValue {
  if (previous && typeof previous === "object" && !Array.isArray(previous)) {
    return {
      ...previous,
      revoke: revokeResponse
    } as Prisma.InputJsonValue;
  }
  return { revoke: revokeResponse } as Prisma.InputJsonValue;
}
