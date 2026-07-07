import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MessagesController } from "../src/modules/messages/messages.controller.js";

describe("MessagesController", () => {
  it("消息不存在时返回可控 404，而不是泄漏 Prisma findFirstOrThrow 错误", async () => {
    const prisma = {
      message: {
        findFirst: vi.fn(async () => null),
      },
    };
    const controller = new MessagesController(prisma as never);

    await expect(controller.get("msg_missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: "msg_missing" }, { messageId: "msg_missing" }],
      },
      include: {
        conversation: true,
        account: true,
        webhookEvent: true,
        deliveries: true,
        sendRequest: true,
      },
    });
  });
});
