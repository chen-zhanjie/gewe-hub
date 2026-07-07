import { Module } from "@nestjs/common";
import { GeweModule } from "../gewe/gewe.module.js";
import { AccountsController } from "./accounts.controller.js";

@Module({
  imports: [GeweModule],
  controllers: [AccountsController]
})
export class AccountsModule {}
