import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DeliveryController } from "../src/modules/delivery/delivery.controller.js";

describe("DeliveryController SSE", () => {
  it("鉴权通过后把 appId、Last-Event-ID 和 reply 交给长连接服务", async () => {
    const app = { id: "app_1", status: "active" };
    const prisma = {
      hubApp: {
        findUnique: vi.fn(async () => app),
      },
    };
    const streams = {
      open: vi.fn(async () => undefined),
    };
    const controller = new DeliveryController(
      prisma as never,
      streams as never,
      {} as never,
    );
    const reply = { raw: {} };

    await controller.events(
      "Bearer app-token",
      "del_header",
      undefined,
      reply as never,
    );

    expect(prisma.hubApp.findUnique).toHaveBeenCalledWith({
      where: { token: "app-token" },
    });
    expect(streams.open).toHaveBeenCalledWith({
      appId: "app_1",
      lastEventId: "del_header",
      reply,
    });
  });

  it("query lastEventId 优先于 header Last-Event-ID", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn(async () => ({ id: "app_1", status: "active" })),
      },
    };
    const streams = {
      open: vi.fn(async () => undefined),
    };
    const controller = new DeliveryController(
      prisma as never,
      streams as never,
      {} as never,
    );

    await controller.events(
      "Bearer app-token",
      "del_header",
      "del_query",
      { raw: {} } as never,
    );

    expect(streams.open).toHaveBeenCalledWith(
      expect.objectContaining({
        lastEventId: "del_query",
      }),
    );
  });

  it("无效应用 token 拒绝连接", async () => {
    const prisma = {
      hubApp: {
        findUnique: vi.fn(async () => null),
      },
    };
    const controller = new DeliveryController(
      prisma as never,
      { open: vi.fn() } as never,
      {} as never,
    );

    await expect(
      controller.events("Bearer bad", undefined, undefined, { raw: {} } as never),
    ).rejects.toThrow(UnauthorizedException);
  });
});
