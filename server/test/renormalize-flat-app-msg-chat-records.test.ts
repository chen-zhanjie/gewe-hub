import { describe, expect, it, vi } from "vitest";

const normalizer = vi.hoisted(() => ({
  normalizeGewePayload: vi.fn(),
}));

vi.mock("../src/modules/normalizer/normalizer.js", () => ({
  normalizeGewePayload: normalizer.normalizeGewePayload,
}));

import {
  parseRenormalizeFlatAppMsgChatRecordsArgs,
  renormalizeFlatAppMsgChatRecords,
} from "../scripts/renormalize-flat-app-msg-chat-records.js";

const chatRecordEnvelope = {
  schemaVersion: 3,
  content: { type: "chat_record" },
  renderedText: "聊天记录：三条消息",
} as never;

function createPrisma(messages: Array<Record<string, unknown>>) {
  return {
    message: {
      findMany: vi.fn().mockResolvedValue(messages),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("renormalize-flat-app-msg-chat-records script", () => {
  it("默认 dry-run：筛选带 webhook event 的 callback unsupported 消息，输出 JSON 汇总且不更新", async () => {
    const prisma = createPrisma([
      {
        id: "message_db_1",
        messageId: "message_1",
        webhookEvent: { rawPayload: { msgType: "APP_MSG", content: "<appmsg />" } },
      },
    ]);
    const log = vi.fn();
    normalizer.normalizeGewePayload.mockReturnValue(chatRecordEnvelope);

    const options = parseRenormalizeFlatAppMsgChatRecordsArgs(["--limit", "5"]);
    const summary = await renormalizeFlatAppMsgChatRecords({
      prisma: prisma as never,
      ...options,
      log,
    });

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: {
        source: "callback",
        type: "unsupported",
        webhookEvent: { isNot: null },
      },
      select: {
        id: true,
        messageId: true,
        webhookEvent: { select: { rawPayload: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    expect(normalizer.normalizeGewePayload).toHaveBeenCalledWith(
      { msgType: "APP_MSG", content: "<appmsg />" },
      "message_1",
    );
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(summary).toEqual({
      mode: "dry-run",
      limit: 5,
      scanned: 1,
      candidates: [
        {
          id: "message_db_1",
          messageId: "message_1",
          type: "chat_record",
          renderedText: "聊天记录：三条消息",
          payloadVersion: 3,
        },
      ],
      updated: 0,
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify(summary));
  });

  it("只有 --apply 才更新 chat_record 的 type、payload、renderedText 和 payloadVersion", async () => {
    const prisma = createPrisma([
      {
        id: "message_db_2",
        messageId: "message_2",
        webhookEvent: { rawPayload: { msgType: "APP_MSG", content: "<appmsg />" } },
      },
    ]);
    const log = vi.fn();
    normalizer.normalizeGewePayload.mockReturnValue(chatRecordEnvelope);

    const options = parseRenormalizeFlatAppMsgChatRecordsArgs(["--apply"]);
    const summary = await renormalizeFlatAppMsgChatRecords({
      prisma: prisma as never,
      ...options,
      log,
    });

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "message_db_2" },
      data: {
        type: "chat_record",
        payload: chatRecordEnvelope,
        renderedText: "聊天记录：三条消息",
        payloadVersion: 3,
      },
    });
    expect(summary).toMatchObject({ mode: "apply", scanned: 1, updated: 1 });
    expect(log).toHaveBeenCalledWith(JSON.stringify(summary));
  });

  it("重新解析结果不是 chat_record 时不更新", async () => {
    const prisma = createPrisma([
      {
        id: "message_db_3",
        messageId: "message_3",
        webhookEvent: { rawPayload: { msgType: "APP_MSG", content: "<appmsg />" } },
      },
    ]);
    const log = vi.fn();
    normalizer.normalizeGewePayload.mockReturnValue({
      schemaVersion: 2,
      content: { type: "link" },
      renderedText: "链接",
    } as never);

    const summary = await renormalizeFlatAppMsgChatRecords({
      prisma: prisma as never,
      apply: true,
      log,
    });

    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(summary).toEqual({
      mode: "apply",
      limit: null,
      scanned: 1,
      candidates: [],
      updated: 0,
    });
  });
});
