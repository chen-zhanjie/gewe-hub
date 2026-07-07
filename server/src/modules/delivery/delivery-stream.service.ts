import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Delivery } from "@prisma/client";
import type { FastifyReply } from "fastify";
import { PrismaService } from "../prisma/prisma.service.js";
import type { DeliveryLease } from "./delivery-lock.service.js";
import { DeliveryLockService } from "./delivery-lock.service.js";
import { buildSseFrame, dbValueToEventType } from "./delivery-utils.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 2_000;

type DeliveryWithConversation = Delivery & {
  message?: {
    conversationId?: string | null;
    sentAt?: Date | string | null;
  } | null;
};

interface DeliveryCursor {
  eventId: string;
  createdAt: Date | string;
  message?: {
    sentAt?: Date | string | null;
  } | null;
}

interface OpenDeliveryStreamInput {
  appId: string;
  lastEventId: string | undefined;
  reply: FastifyReply;
}

interface ActiveStream {
  appId: string;
  reply: FastifyReply;
  sentEventIds: Set<string>;
  heartbeatTimer: NodeJS.Timeout;
  pollTimer: NodeJS.Timeout;
  streamLease?: DeliveryLease;
  closed: boolean;
}

export interface DeliveryStreamSnapshot {
  appId: string;
  connected: boolean;
  sentEventCount: number;
  hasLease: boolean;
}

@Injectable()
export class DeliveryStreamService implements OnModuleDestroy {
  private readonly streams = new Map<string, ActiveStream>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly locks?: DeliveryLockService,
  ) {}

  async open(input: OpenDeliveryStreamInput): Promise<void> {
    this.close(input.appId);
    const streamLease = await this.locks?.takeoverStream(input.appId);

    input.reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const stream: ActiveStream = {
      appId: input.appId,
      reply: input.reply,
      sentEventIds: new Set(input.lastEventId ? [input.lastEventId] : []),
      heartbeatTimer: setInterval(() => {
        this.writeHeartbeat(stream).catch(() => this.close(input.appId, stream));
      }, HEARTBEAT_INTERVAL_MS),
      pollTimer: setInterval(() => {
        this.flushPending(stream).catch(() => this.close(input.appId));
      }, POLL_INTERVAL_MS),
      streamLease,
      closed: false,
    };
    stream.heartbeatTimer.unref?.();
    stream.pollTimer.unref?.();
    this.streams.set(input.appId, stream);
    input.reply.raw.once("close", () => this.close(input.appId, stream));

    await this.flushPending(stream, input.lastEventId);
  }

  onModuleDestroy(): void {
    for (const appId of this.streams.keys()) {
      this.close(appId);
    }
  }

  snapshot(): DeliveryStreamSnapshot[] {
    return [...this.streams.values()].map((stream) => ({
      appId: stream.appId,
      connected: !stream.closed,
      sentEventCount: stream.sentEventIds.size,
      hasLease: Boolean(stream.streamLease),
    }));
  }

  private async flushPending(stream: ActiveStream, cursor?: string): Promise<void> {
    if (stream.closed) return;
    if (!(await this.ensureStreamOwnership(stream))) return;
    const cursorDelivery = await this.loadCursorDelivery(stream.appId, cursor);
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        appId: stream.appId,
        status: { not: "acked" },
      },
      include: {
        message: {
          select: {
            conversationId: true,
            sentAt: true,
          },
        },
      },
      orderBy: [
        {
          message: {
            sentAt: "asc",
          },
        },
        { createdAt: "asc" },
      ],
      take: 100,
    });

    const blockedConversationIds = new Set<string>();
    for (const item of filterAfterCursor(sortDeliveriesForStreaming(deliveries), cursor, cursorDelivery)) {
      const conversationId = item.message?.conversationId ?? undefined;
      if (conversationId && blockedConversationIds.has(conversationId)) continue;
      if (stream.closed) return;
      if (!(await this.ensureStreamOwnership(stream))) return;
      if (stream.sentEventIds.has(item.eventId)) {
        if (conversationId) blockedConversationIds.add(conversationId);
        continue;
      }
      if (await this.hasEarlierUndeliveredDelivery(stream.appId, item)) {
        if (conversationId) blockedConversationIds.add(conversationId);
        continue;
      }
      const conversationLease = conversationId
        ? await this.locks?.acquireConversation(stream.appId, conversationId)
        : undefined;
      if (conversationId && this.locks && !conversationLease) {
        blockedConversationIds.add(conversationId);
        continue;
      }
      const eventType = dbValueToEventType(item.eventType);
      try {
        stream.reply.raw.write(
          buildSseFrame({
            eventId: item.eventId,
            eventType,
            data: {
              eventId: item.eventId,
              eventType,
              payload: item.payload,
            },
          }),
        );
        stream.sentEventIds.add(item.eventId);
        if (conversationId) blockedConversationIds.add(conversationId);
        await this.prisma.delivery.update({
          where: { id: item.id },
          data: {
            status: "delivered",
            deliveredAt: new Date(),
            attempts: { increment: 1 },
          },
        });
      } finally {
        if (conversationLease) {
          await this.locks?.release(conversationLease);
        }
      }
    }
  }

  private async hasEarlierUndeliveredDelivery(appId: string, item: DeliveryWithConversation): Promise<boolean> {
    const conversationId = item.message?.conversationId;
    const sentAt = item.message?.sentAt;
    if (!conversationId || !sentAt) return false;

    const count = await this.prisma.delivery.count({
      where: {
        appId,
        status: { notIn: ["delivered", "acked"] },
        message: {
          conversationId,
          sentAt: {
            lt: sentAt,
          },
        },
      },
    });
    return count > 0;
  }

  private async loadCursorDelivery(appId: string, cursor: string | undefined): Promise<DeliveryCursor | null> {
    if (!cursor) return null;
    const delivery = await this.prisma.delivery.findUnique({
      where: { eventId: cursor },
      include: {
        message: {
          select: {
            sentAt: true,
          },
        },
      },
    });
    if (!delivery || delivery.appId !== appId) return null;
    return delivery;
  }

  private async writeHeartbeat(stream: ActiveStream): Promise<void> {
    if (stream.closed) return;
    if (!(await this.ensureStreamOwnership(stream))) return;
    stream.reply.raw.write(": heartbeat\n\n");
  }

  private close(appId: string, stream = this.streams.get(appId)): void {
    if (!stream || stream.closed) return;
    stream.closed = true;
    clearInterval(stream.heartbeatTimer);
    clearInterval(stream.pollTimer);
    this.streams.delete(appId);
    if (stream.streamLease) {
      void this.locks?.release(stream.streamLease).catch(() => undefined);
    }
    stream.reply.raw.end();
  }

  private async ensureStreamOwnership(stream: ActiveStream): Promise<boolean> {
    if (!stream.streamLease || !this.locks) return true;
    const owned = await this.locks.renew(stream.streamLease);
    if (!owned) {
      this.close(stream.appId, stream);
      return false;
    }
    return true;
  }
}

function filterAfterCursor<T extends DeliveryWithConversation>(
  items: T[],
  cursor: string | undefined,
  cursorDelivery: DeliveryCursor | null = null,
): T[] {
  if (!cursor) return items;
  const index = items.findIndex((item) => item.eventId === cursor);
  if (index >= 0) return items.slice(index + 1);
  if (!cursorDelivery) return items;
  const cursorSortValue = deliverySortValue(cursorDelivery);
  return items.filter((item) => deliverySortValue(item) > cursorSortValue);
}

function sortDeliveriesForStreaming<T extends DeliveryWithConversation>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    return deliverySortValue(left) - deliverySortValue(right);
  });
}

function deliverySortValue(value: DeliveryWithConversation | DeliveryCursor): number {
  const sentAt = dateTimeValue(value.message?.sentAt);
  if (sentAt !== 0) return sentAt;
  return dateTimeValue(value.createdAt);
}

function dateTimeValue(value: Date | string | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }
  return 0;
}
