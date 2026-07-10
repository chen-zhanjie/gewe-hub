import { Module } from "@nestjs/common";
import { GeweModule } from "../gewe/gewe.module.js";
import { MessagesController } from "./messages.controller.js";

@Module({
  imports: [GeweModule],
  controllers: [MessagesController]
})
export class MessagesModule {}
