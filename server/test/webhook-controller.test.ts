import { describe, expect, it } from "vitest";
import { WebhookController } from "../src/modules/gewe/webhook.controller.js";

describe("WebhookController", () => {
  it("GeWe 回调成功接收使用 HTTP 200 而不是 Nest POST 默认 201", () => {
    const statusCode = Reflect.getMetadata("__httpCode__", WebhookController.prototype.receive);

    expect(statusCode).toBe(200);
  });
});
