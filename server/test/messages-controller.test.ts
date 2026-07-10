import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MessagesController } from "../src/modules/messages/messages.controller.js";

describe("MessagesController", () => {
  it("消息不存在时返回可控 404，而不是泄漏 Prisma findFirstOrThrow 错误", async () => {
    const prisma = {
      message: {
        findFirst: vi.fn(async () => null),
      },
    };
    const controller = new MessagesController(prisma as never, {} as never);

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

  it("按稳定 messageId 撤回自己已发送的消息", async () => {
    const message = {
      id: "row_1",
      messageId: "msg_stable_1",
      isSelf: true,
      isSent: true,
      platformMsgId: "769533801",
      platformNewMsgId: "5271007655758710001",
      platformCreateTime: "1704163145",
      conversation: { peerWxid: "wxid_target", account: { appId: "wx_app" } }
    };
    const prisma = {
      message: {
        findUnique: vi.fn(async () => message),
        update: vi.fn(async ({ data }) => ({ ...message, ...data }))
      }
    };
    const gewe = { revokeMessage: vi.fn(async () => ({ ret: 200 })) };
    const controller = new MessagesController(prisma as never, gewe as never);

    const result = await controller.revoke("msg_stable_1");

    expect(gewe.revokeMessage).toHaveBeenCalledWith({
      appId: "wx_app",
      toWxid: "wxid_target",
      msgId: "769533801",
      newMsgId: "5271007655758710001",
      createTime: "1704163145"
    });
    expect(result).toMatchObject({ messageId: "msg_stable_1", status: "revoked" });
  });

  it("拒绝撤回别人发送或缺少平台映射的消息", async () => {
    const prisma = { message: { findUnique: vi.fn(async () => ({ messageId: "msg_other", isSelf: false, isSent: true })) } };
    const controller = new MessagesController(prisma as never, {} as never);
    await expect(controller.revoke("msg_other")).rejects.toBeInstanceOf(BadRequestException);
  });
});
