import { Module } from "@nestjs/common";
import { DeliveryAdminController } from "./delivery-admin.controller.js";
import { DeliveryController } from "./delivery.controller.js";
import { DeliveryLockService } from "./delivery-lock.service.js";
import { DeliveryStreamService } from "./delivery-stream.service.js";
import { DeliveryService } from "./delivery.service.js";

@Module({
  controllers: [DeliveryController, DeliveryAdminController],
  providers: [DeliveryService, DeliveryStreamService, DeliveryLockService],
  exports: [DeliveryService, DeliveryStreamService]
})
export class DeliveryModule {}
