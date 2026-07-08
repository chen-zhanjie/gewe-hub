import { Module } from "@nestjs/common";
import { GeweClientService } from "./gewe-client.service.js";
import { WebhookAuditLogger } from "./webhook-audit-logger.service.js";
import { WebhookController } from "./webhook.controller.js";
import { WebhookService } from "./webhook.service.js";

@Module({
  controllers: [WebhookController],
  providers: [GeweClientService, WebhookAuditLogger, WebhookService],
  exports: [GeweClientService, WebhookService]
})
export class GeweModule {}
