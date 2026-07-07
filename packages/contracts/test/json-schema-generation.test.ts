import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const expectedSchemaFiles = [
  "ack-request.json",
  "ack-response.json",
  "delivery-event.json",
  "error-response.json",
  "message-envelope.json",
  "message-node.json",
  "send-request.json",
  "send-response.json",
];

describe("JSON Schema 生成产物", () => {
  it("覆盖消息、发送、ACK 和错误契约", () => {
    for (const fileName of expectedSchemaFiles) {
      expect(existsSync(resolve(process.cwd(), "dist/json-schema", fileName)), fileName).toBe(true);
    }
  });
});
