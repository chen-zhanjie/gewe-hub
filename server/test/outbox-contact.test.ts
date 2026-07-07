import { describe, expect, it, vi } from "vitest";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";

describe("OutboxService 联系人回调", () => {
  it("处理 MOD_CONTACTS 时 upsert 账号并执行单点联系人同步", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_1",
          taskType: "process_webhook",
          refId: "event_1",
          payload: { webhookEventId: "event_1" },
          retryCount: 0,
          maxRetry: 5
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({}))
      },
      webhookEvent: {
        update: vi.fn(async (args) => {
          if (args.data?.processStatus === "processing") {
            return {
              id: "event_1",
              eventKind: "contact",
              rawPayload: {
                appid: "wx_app",
                wxid: "wxid_bot",
                msgType: "MOD_CONTACTS",
                fromUser: "filehelper",
                content: "联系人变更：文件传输助手，filehelper"
              }
            };
          }
          return { id: "event_1" };
        })
      },
      wechatAccount: {
        upsert: vi.fn(async () => ({ id: "acc_1", appId: "wx_app", wxid: "wxid_bot" }))
      }
    };
    const contactsSync = {
      syncContact: vi.fn(async () => ({ kind: "contact", status: "active" }))
    };
    const service = new OutboxService(prisma as never, { createForMessage: vi.fn() } as never, contactsSync as never);

    await service.tick();

    expect(prisma.wechatAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { wxid: "wxid_bot" },
        create: expect.objectContaining({ appId: "wx_app", wxid: "wxid_bot", source: "auto" })
      })
    );
    expect(contactsSync.syncContact).toHaveBeenCalledWith({
      accountId: "acc_1",
      appId: "wx_app",
      wxid: "filehelper",
      deleted: false
    });
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "event_1" },
      data: { processStatus: "processed" }
    });
  });
});
