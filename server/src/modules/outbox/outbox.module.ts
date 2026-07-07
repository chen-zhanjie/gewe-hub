import { Module } from "@nestjs/common";
import { AdminEventsModule } from "../admin-events/admin-events.module.js";
import { ContactsModule } from "../contacts/contacts.module.js";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { GeweModule } from "../gewe/gewe.module.js";
import { MediaModule } from "../media/media.module.js";
import { OutboxController } from "./outbox.controller.js";
import { OutboxService } from "./outbox.service.js";

@Module({
  imports: [DeliveryModule, ContactsModule, MediaModule, GeweModule, AdminEventsModule],
  controllers: [OutboxController],
  providers: [OutboxService],
  exports: [OutboxService]
})
export class OutboxModule {}
