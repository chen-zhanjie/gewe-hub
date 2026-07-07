import { describe, expect, it, vi } from "vitest";
import { ObservabilityController } from "../src/modules/observability/observability.controller.js";

describe("ObservabilityController", () => {
  it("summary 返回 webhook、任务、投递积压、账号在线和 SSE 连接状态", async () => {
    const prisma = {
      webhookEvent: { count: vi.fn(async () => 7) },
      outboxTask: { count: vi.fn(async () => 2) },
      delivery: { count: vi.fn(async () => 3) },
      wechatAccount: { groupBy: vi.fn(async () => [{ onlineStatus: "online", _count: 1 }]) },
    };
    const streams = {
      snapshot: vi.fn(() => [
        {
          appId: "app_1",
          connected: true,
          sentEventCount: 4,
        },
      ]),
    };
    const controller = new ObservabilityController(prisma as never, streams as never);

    await expect(controller.summary()).resolves.toEqual({
      webhook24h: 7,
      failedTasks: 2,
      deliveryBacklog: 3,
      accounts: [{ onlineStatus: "online", _count: 1 }],
      sseConnections: [
        {
          appId: "app_1",
          connected: true,
          sentEventCount: 4,
        },
      ],
    });
  });
});
