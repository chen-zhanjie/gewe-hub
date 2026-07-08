import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AdminAuthGuard } from "./common/admin-auth.guard.js";
import { AccountsModule } from "./modules/accounts/accounts.module.js";
import { AdminEventsModule } from "./modules/admin-events/admin-events.module.js";
import { AppsModule } from "./modules/apps/apps.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ContactsModule } from "./modules/contacts/contacts.module.js";
import { ConversationsModule } from "./modules/conversations/conversations.module.js";
import { DeliveryModule } from "./modules/delivery/delivery.module.js";
import { GeweModule } from "./modules/gewe/gewe.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { HtmlPagesModule } from "./modules/html-pages/html-pages.module.js";
import { MediaModule } from "./modules/media/media.module.js";
import { MessagesModule } from "./modules/messages/messages.module.js";
import { ObservabilityModule } from "./modules/observability/observability.module.js";
import { OutboxModule } from "./modules/outbox/outbox.module.js";
import { PrismaModule } from "./modules/prisma/prisma.module.js";
import { SendModule } from "./modules/send/send.module.js";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    AdminEventsModule,
    AccountsModule,
    AppsModule,
    ContactsModule,
    ConversationsModule,
    MessagesModule,
    HtmlPagesModule,
    MediaModule,
    GeweModule,
    DeliveryModule,
    SendModule,
    OutboxModule,
    ObservabilityModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AdminAuthGuard
    }
  ]
})
export class AppModule {}
