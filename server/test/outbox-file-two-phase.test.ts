import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseWebhookJsonBody } from "../src/modules/gewe/webhook-utils.js";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";

const fixtureRoot = resolve(
  process.cwd(),
  "../references/gewe-raw-samples/2026-07-05-production",
);

describe("OutboxService 文件两阶段回调", () => {
  it("APP_MSG type=74 占位跳过，后续 FILE type=6 只生成一条标准文件消息", async () => {
    const appMsgPayload = readFixture("APP_MSG/001__event_8__msg_3591584383532645877.json");
    const filePayload = readFixture("FILE/001__event_9__msg_3205839865020477895.json");
    const createdMessages: Array<Record<string, unknown>> = [];
    const events = [
      { id: "event_app_msg_74", dedupeKey: "wx_SOL6Sy1Zh5aS7MOc9FcBL:3591584383532645877", eventKind: "message", rawPayload: appMsgPayload },
      { id: "event_file_6", dedupeKey: "wx_SOL6Sy1Zh5aS7MOc9FcBL:3205839865020477895", eventKind: "message", rawPayload: filePayload },
    ];
    let taskIndex = 0;
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => {
          const event = events[taskIndex];
          if (!event) return null;
          return {
            id: `task_${event.id}`,
            taskType: "process_webhook",
            refId: event.id,
            payload: { webhookEventId: event.id },
            status: "pending",
            retryCount: 0,
            maxRetry: 5,
          };
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({})),
      },
      webhookEvent: {
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          if (data.processStatus === "processing") {
            const event = events[taskIndex];
            expect(where.id).toBe(event?.id);
            return event;
          }
          if (data.processStatus === "processed" || data.processStatus === "skipped") {
            taskIndex += 1;
          }
          return { id: where.id, ...data };
        }),
      },
      wechatAccount: {
        upsert: vi.fn(async () => ({ id: "acc_1", wxid: "wxid_mngndogkpyms22" })),
      },
      conversation: {
        upsert: vi.fn(async () => ({ id: "conv_1", app: null })),
        update: vi.fn(async () => ({})),
      },
      contact: {
        findUnique: vi.fn(async () => null),
      },
      group: {
        findUnique: vi.fn(async () => null),
      },
      message: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const existing = createdMessages.find((message) => message.dedupeKey === create.dedupeKey);
          if (existing) {
            Object.assign(existing, update);
            return {
              ...existing,
              id: existing.id,
              conversationId: existing.conversationId,
              rawMessageId: existing.rawMessageId,
              messageId: existing.messageId,
              conversation: { app: null },
            };
          }
          const message = { id: `message_${createdMessages.length + 1}`, ...create };
          createdMessages.push(message);
          return {
            ...message,
            conversation: { app: null },
          };
        }),
      },
    };
    const delivery = { createForMessage: vi.fn(async () => undefined) };
    const media = { enqueueMessageMedia: vi.fn(async () => 1) };
    const service = new OutboxService(
      prisma as never,
      delivery as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never,
    );

    await service.tick();
    await service.tick();

    expect(createdMessages).toHaveLength(1);
    expect(createdMessages[0]).toMatchObject({
      messageId: expect.stringMatching(/^msg_[A-Za-z0-9_-]{22}$/),
      platformNewMsgId: "3205839865020477895",
      type: "file",
      renderedText: "[文件] mapping_app.txt",
    });
    expect(createdMessages[0]?.payload).toMatchObject({
      content: {
        type: "file",
        media: {
          status: "pending",
          url: null,
          fileName: "mapping_app.txt",
          size: 2732,
          md5: "562d96ac785059b4b32ca1adc6789765",
        },
      },
      metadata: {
        gewe: {
          overwriteNewMsgId: "3591584383532645877",
        },
      },
    });
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "event_app_msg_74" },
      data: { processStatus: "skipped" },
    });
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "event_file_6" },
      data: { processStatus: "processed" },
    });
    expect(media.enqueueMessageMedia).toHaveBeenCalledTimes(1);
    expect(delivery.createForMessage).not.toHaveBeenCalled();
  });
});

function readFixture(relativePath: string): Record<string, unknown> {
  return parseWebhookJsonBody(readFileSync(resolve(fixtureRoot, relativePath), "utf8"));
}
