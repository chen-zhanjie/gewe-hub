import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { buildWebhookDedupeKey, classifyWebhookPayload } from "./webhook-utils.js";

@Injectable()
export class WebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async store(payload: Record<string, unknown>) {
    const eventKind = classifyWebhookPayload(payload);
    const dedupeKey = buildWebhookDedupeKey(payload);
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { dedupeKey }
    });
    if (existing) {
      return { duplicated: true, event: existing };
    }

    const event = await this.prisma.webhookEvent.create({
      data: {
        secretOk: true,
        rawPayload: toPrismaJson(payload),
        eventKind,
        dedupeKey,
        processStatus: eventKind === "unknown" ? "skipped" : "stored"
      }
    });

    if (eventKind !== "unknown") {
      await this.prisma.outboxTask.create({
        data: {
          taskType: "process_webhook",
          refId: event.id,
          payload: { webhookEventId: event.id },
          status: "pending"
        }
      });
    }

    return { duplicated: false, event };
  }
}

function toPrismaJson(payload: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}
