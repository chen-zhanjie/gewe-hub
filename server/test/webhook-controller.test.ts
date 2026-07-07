import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookController } from "../src/modules/gewe/webhook.controller.js";

describe("WebhookController", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379/0");
    vi.stubEnv("GEWE_BASE_URL", "http://api.geweapi.com");
    vi.stubEnv("GEWE_TOKEN", "test-gewe-token");
    vi.stubEnv("WEBHOOK_SECRET", "replace-with-random-secret");
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "replace-with-bcrypt-hash");
    vi.stubEnv("SESSION_SECRET", "replace-with-long-random-secret");
    vi.stubEnv("FILE_STORAGE_DIR", "./storage/files");
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
  });

  it("GeWe 回调成功接收使用 HTTP 200 而不是 Nest POST 默认 201", () => {
    const statusCode = Reflect.getMetadata("__httpCode__", WebhookController.prototype.receive);

    expect(statusCode).toBe(200);
  });

  it("设置回调时允许用请求体覆盖回调 URL 前缀", async () => {
    const geweClient = {
      setCallback: async (callbackUrl: string) => ({ callbackUrl }),
    };
    const controller = new WebhookController({ store: async () => ({ duplicated: false }) } as never, geweClient as never);

    const result = await controller.setCallback({
      baseUrl: "http://3i2956l679.51vip.biz/",
    });

    expect(result.callbackUrl).toBe(
      "http://3i2956l679.51vip.biz/webhook/gewe/replace-with-random-secret",
    );
    expect(result.response).toEqual({
      callbackUrl:
        "http://3i2956l679.51vip.biz/webhook/gewe/replace-with-random-secret",
    });
  });
});
