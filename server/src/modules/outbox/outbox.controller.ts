import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { OutboxService } from "./outbox.service.js";

@Controller("/api/outbox/tasks")
export class OutboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  @Get()
  async list(@Query("status") status?: string) {
    return this.prisma.outboxTask.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  @Post(":id/retry")
  async retry(@Param("id") id: string) {
    return this.outbox.retry(id);
  }
}
