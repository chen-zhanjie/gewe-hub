import { Controller, Get, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AdminEventsService } from "./admin-events.service.js";

@Controller("/api/admin/events")
export class AdminEventsController {
  constructor(private readonly adminEvents: AdminEventsService) {}

  @Get()
  async events(@Res() reply: FastifyReply) {
    await this.adminEvents.open(reply);
  }
}
