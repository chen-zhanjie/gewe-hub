import { Module } from "@nestjs/common";
import { AdminEventsController } from "./admin-events.controller.js";
import { AdminEventsService } from "./admin-events.service.js";

@Module({
  controllers: [AdminEventsController],
  providers: [AdminEventsService],
  exports: [AdminEventsService],
})
export class AdminEventsModule {}
