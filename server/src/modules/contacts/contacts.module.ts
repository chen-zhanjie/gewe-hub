import { Module } from "@nestjs/common";
import { GeweModule } from "../gewe/gewe.module.js";
import { ContactsController } from "./contacts.controller.js";
import { ContactsSyncService } from "./contacts-sync.service.js";

@Module({
  imports: [GeweModule],
  controllers: [ContactsController],
  providers: [ContactsSyncService],
  exports: [ContactsSyncService]
})
export class ContactsModule {}
