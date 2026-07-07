import { describe, expect, it, vi } from "vitest";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";

describe("OutboxService 媒体任务", () => {
  it("分发 download_media 到 MediaService", async () => {
    const prisma = {
      outboxTask: {
        findFirst: vi.fn(async () => ({
          id: "task_1",
          taskType: "download_media",
          refId: "asset_1",
          payload: { mediaAssetId: "asset_1" },
          retryCount: 0,
          maxRetry: 3
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({}))
      }
    };
    const media = {
      downloadMediaAsset: vi.fn(async () => undefined)
    };
    const service = new OutboxService(
      prisma as never,
      { createForMessage: vi.fn() } as never,
      { syncContacts: vi.fn(), syncGroupMembers: vi.fn() } as never,
      media as never
    );

    await service.tick();

    expect(media.downloadMediaAsset).toHaveBeenCalledWith("asset_1");
    expect(prisma.outboxTask.update).toHaveBeenLastCalledWith({
      where: { id: "task_1" },
      data: {
        status: "done",
        leaseUntil: null,
        lastError: null
      }
    });
  });
});
