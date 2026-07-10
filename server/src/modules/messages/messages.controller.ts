import { BadRequestException, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { GeweClientService } from "../gewe/gewe-client.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("/api/messages")
export class MessagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gewe: GeweClientService
  ) {}

  @Get(":id")
  async get(@Param("id") id: string) {
    const message = await this.prisma.message.findFirst({
      where: {
        OR: [{ id }, { messageId: id }]
      },
      include: {
        conversation: true,
        account: true,
        webhookEvent: true,
        deliveries: true,
        sendRequest: true
      }
    });
    if (!message) throw new NotFoundException("消息不存在");
    return message;
  }

  @Post(":messageId/revoke")
  async revoke(@Param("messageId") messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { messageId },
      include: { conversation: { include: { account: true } } }
    });
    if (!message) throw new NotFoundException("消息不存在");
    if (!message.isSelf || !message.isSent) throw new BadRequestException("只能撤回自己已发送的消息");
    if (!message.platformMsgId || !message.platformNewMsgId || !message.platformCreateTime) {
      throw new BadRequestException("消息缺少撤回所需的平台映射");
    }

    await this.gewe.revokeMessage({
      appId: message.conversation.account.appId,
      toWxid: message.conversation.peerWxid,
      msgId: message.platformMsgId,
      newMsgId: message.platformNewMsgId,
      createTime: message.platformCreateTime
    });
    return this.prisma.message.update({
      where: { id: message.id },
      data: { status: "revoked", revokedAt: new Date() }
    });
  }
}
