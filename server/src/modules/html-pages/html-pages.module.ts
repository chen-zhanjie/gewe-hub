import { Module } from "@nestjs/common";
import { HtmlPagesController } from "./html-pages.controller.js";
import { HtmlPagesService } from "./html-pages.service.js";

@Module({
  controllers: [HtmlPagesController],
  providers: [HtmlPagesService],
  exports: [HtmlPagesService],
})
export class HtmlPagesModule {}
