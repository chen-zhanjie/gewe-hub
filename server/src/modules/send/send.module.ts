import { Module } from "@nestjs/common";
import { GeweModule } from "../gewe/gewe.module.js";
import { HtmlPagesModule } from "../html-pages/html-pages.module.js";
import { SendController } from "./send.controller.js";

@Module({
  imports: [GeweModule, HtmlPagesModule],
  controllers: [SendController]
})
export class SendModule {}
