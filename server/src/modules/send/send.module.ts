import { Module } from "@nestjs/common";
import { AdminEventsModule } from "../admin-events/admin-events.module.js";
import { GeweModule } from "../gewe/gewe.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { HtmlPagesModule } from "../html-pages/html-pages.module.js";
import { SendController } from "./send.controller.js";

@Module({
  imports: [AdminEventsModule, GeweModule, HtmlPagesModule, OutboxModule],
  controllers: [SendController]
})
export class SendModule {}
