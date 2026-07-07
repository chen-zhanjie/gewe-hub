import { Module } from "@nestjs/common";
import { GeweClientService } from "./gewe-client.service.js";
import { WebhookController } from "./webhook.controller.js";
import { WebhookService } from "./webhook.service.js";

@Module({
  controllers: [WebhookController],
  providers: [GeweClientService, WebhookService],
  exports: [GeweClientService, WebhookService]
})
export class GeweModule {}
