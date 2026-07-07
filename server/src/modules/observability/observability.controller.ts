import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { DeliveryStreamService } from "../delivery/delivery-stream.service.js";

@Controller("/api/observability")
export class ObservabilityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streams: DeliveryStreamService,
  ) {}

  @Get("summary")
  async summary() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [webhook24h, failedTasks, deliveryBacklog, accounts] = await Promise.all([
      this.prisma.webhookEvent.count({ where: { createdAt: { gte: since } } }),
      this.prisma.outboxTask.count({ where: { status: { in: ["failed", "dead"] } } }),
      this.prisma.delivery.count({ where: { status: { in: ["queued", "failed"] } } }),
      this.prisma.wechatAccount.groupBy({ by: ["onlineStatus"], _count: true })
    ]);

    return {
      webhook24h,
      failedTasks,
      deliveryBacklog,
      accounts,
      sseConnections: this.streams.snapshot(),
    };
  }
}
