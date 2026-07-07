import { Module } from "@nestjs/common";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { ObservabilityController } from "./observability.controller.js";

@Module({
  imports: [DeliveryModule],
  controllers: [ObservabilityController]
})
export class ObservabilityModule {}
