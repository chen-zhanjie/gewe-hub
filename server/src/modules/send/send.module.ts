import { Module } from "@nestjs/common";
import { GeweModule } from "../gewe/gewe.module.js";
import { SendController } from "./send.controller.js";

@Module({
  imports: [GeweModule],
  controllers: [SendController]
})
export class SendModule {}
