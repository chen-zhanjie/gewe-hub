import { describe, expect, it } from "vitest";
import { createMessageId } from "../src/modules/messages/message-id.js";

describe("稳定消息 ID", () => {
  it("生成固定格式且高概率唯一的 GeWeHub 消息 ID", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createMessageId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^msg_[A-Za-z0-9_-]{22}$/);
  });
});
