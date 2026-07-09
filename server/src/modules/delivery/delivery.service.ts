import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { MessageEnvelope } from "@gewehub/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { buildDeliveryEventId, eventTypeToDbValue } from "./delivery-utils.js";

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async createForMessage(message: {
    id: string;
    accountId: string;
    messageId: string;
    senderWxid: string;
    isSelf: boolean;
    isAtMe: boolean;
    payload: Prisma.JsonValue;
    conversation: {
      id: string;
      appId: string | null;
      peerWxid: string;
      type: "private" | "group";
      platformRemark: string | null;
      deliveryFilter: "all" | "at_only";
      debounceMs: number | null;
      maxWaitMs: number | null;
      app: {
        id: string;
        status: "active" | "disabled";
        deliverSelfMessages: boolean;
        defaultDebounceMs: number | null;
        defaultMaxWaitMs: number | null;
      } | null;
    };
  }) {
    const app = message.conversation.app;
    if (!message.conversation.appId || !app || app.status !== "active") return null;
    if (message.isSelf && !app.deliverSelfMessages) return null;
    if (message.conversation.deliveryFilter === "at_only" && !message.isAtMe) return null;

    const payload = await this.withDeliveryView(message, {
      debounceMs: message.conversation.debounceMs ?? app.defaultDebounceMs ?? 0,
      maxWaitMs: message.conversation.maxWaitMs ?? app.defaultMaxWaitMs ?? 0
    });
    const eventId = buildDeliveryEventId(message.messageId, app.id, payload.eventType);

    return this.prisma.delivery.upsert({
      where: { eventId },
      create: {
        appId: app.id,
        messageId: message.id,
        eventId,
        eventType: eventTypeToDbValue(payload.eventType),
        payload: payload as unknown as Prisma.InputJsonValue,
        status: "queued"
      },
      update: {
        payload: payload as unknown as Prisma.InputJsonValue
      }
    });
  }

  private async withDeliveryView(
    message: {
      accountId: string;
      senderWxid: string;
      payload: Prisma.JsonValue;
      conversation: {
        id: string;
        appId: string | null;
        peerWxid: string;
        type: "private" | "group";
        platformRemark: string | null;
        app: { id: string } | null;
      };
    },
    metadata: { debounceMs: number; maxWaitMs: number }
  ): Promise<MessageEnvelope> {
    const payload = await this.withDeliveryRemarks(message);
    return withDeliveryMetadata(payload, metadata);
  }

  private async withDeliveryRemarks(message: {
    accountId: string;
    senderWxid: string;
    payload: Prisma.JsonValue;
    conversation: {
      id: string;
      appId: string | null;
      peerWxid: string;
      type: "private" | "group";
      platformRemark: string | null;
      app: { id: string } | null;
    };
  }): Promise<MessageEnvelope> {
    const payload = message.payload as unknown as MessageEnvelope;
    const [accountRemark, senderRemark] = await Promise.all([
      this.loadAccountRemark(message.conversation.app?.id ?? message.conversation.appId, message.accountId),
      this.loadSenderRemark(message)
    ]);
    const conversationRemark = normalizeRemark(message.conversation.platformRemark);

    return {
      ...payload,
      account: {
        ...payload.account,
        ...(accountRemark ? { remark: accountRemark } : {})
      },
      conversation: {
        ...payload.conversation,
        id: message.conversation.id,
        ...(conversationRemark ? { remark: conversationRemark } : {})
      },
      sender: {
        ...payload.sender,
        ...(senderRemark ? { remark: senderRemark } : {})
      }
    };
  }

  private async loadAccountRemark(appId: string | null | undefined, accountId: string): Promise<string | undefined> {
    const [appRemark, account] = await Promise.all([
      appId
        ? this.prisma.appAccountRemark.findUnique({
            where: {
              appId_accountId: {
                appId,
                accountId
              }
            },
            select: {
              remark: true
            }
          })
        : null,
      this.prisma.wechatAccount.findUnique({
        where: { id: accountId },
        select: {
          platformRemark: true
        }
      })
    ]);
    return normalizeRemark(appRemark?.remark) ?? normalizeRemark(account?.platformRemark);
  }

  private async loadSenderRemark(message: {
    accountId: string;
    senderWxid: string;
    conversation: {
      peerWxid: string;
      type: "private" | "group";
    };
  }): Promise<string | undefined> {
    if (message.conversation.type === "group") {
      const member = await this.prisma.groupMember.findFirst({
        where: {
          wxid: message.senderWxid,
          group: {
            accountId: message.accountId,
            wxid: message.conversation.peerWxid
          }
        },
        select: {
          platformRemark: true
        }
      });
      return normalizeRemark(member?.platformRemark);
    }

    const contact = await this.prisma.contact.findUnique({
      where: {
        accountId_wxid: {
          accountId: message.accountId,
          wxid: message.senderWxid
        }
      },
      select: {
        platformRemark: true
      }
    });
    return normalizeRemark(contact?.platformRemark);
  }

  async ack(appToken: string, eventIds: string[]) {
    const app = await this.prisma.hubApp.findUniqueOrThrow({ where: { token: appToken } });
    if (app.status !== "active") {
      throw new UnauthorizedException("应用 token 无效");
    }
    const result = await this.prisma.delivery.updateMany({
      where: {
        appId: app.id,
        eventId: { in: eventIds },
        status: { in: ["queued", "delivering", "delivered"] }
      },
      data: {
        status: "acked",
        ackedAt: new Date()
      }
    });
    return { ok: true as const, acked: result.count };
  }
}

function withDeliveryMetadata(payload: MessageEnvelope, metadata: { debounceMs: number; maxWaitMs: number }): MessageEnvelope {
  return {
    ...payload,
    metadata: {
      ...(payload.metadata ?? {}),
      debounceMs: metadata.debounceMs,
      maxWaitMs: metadata.maxWaitMs
    }
  };
}

function normalizeRemark(value: string | null | undefined): string | undefined {
  const remark = value?.trim();
  return remark ? remark : undefined;
}
