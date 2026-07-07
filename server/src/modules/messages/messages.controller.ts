import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("/api/messages")
export class MessagesController {
  constructor(private readonly prisma: PrismaService) {}

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
}
